//! Atomic component and signed-database installation; keep the previous usable state on failure.
use crate::{
    scanner_package as package, scanner_process,
    scanner_runtime::{
        database_header, failure, freshclam_configuration, now, unique, verify_databases, Runtime,
    },
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
impl Runtime {
    pub fn install_offline(&mut self, archive: &Path) -> Result<(), &'static str> {
        let stage = unique(&self.root, "install");
        package::unpack_offline(archive, &stage)?;
        self.commit(stage)
    }
    pub fn adopt_bundled(&mut self, source: &Path) -> Result<(), &'static str> {
        let archive = source.join("component.zip");
        if self.current().join("engine/clamd.exe").is_file() || !archive.is_file() {
            return Ok(());
        }
        self.install_offline(&archive)?;
        self.preferences.enabled = true;
        self.save()
    }
    pub fn commit(&mut self, stage: PathBuf) -> Result<(), &'static str> {
        let checked =
            verify_databases(&stage.join("engine"), &stage.join("database"), &self.cancel);
        if let Err(error) = checked {
            let _ = fs::remove_dir_all(stage);
            return Err(error);
        }
        if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = fs::remove_dir_all(stage);
            return Err("content_cancelled");
        }
        let current = self.current();
        let backup = self.root.join("previous");
        if let (Ok(previous), Ok(next)) = (
            database_header(&current.join("database/daily.cvd")),
            database_header(&stage.join("database/daily.cvd")),
        ) {
            if next.0 < previous.0 || next.1 < previous.1 {
                let _ = fs::remove_dir_all(stage);
                return Err("scanner_database_rollback");
            }
        }
        let was_ready = self.status().ready;
        self.stop();
        if backup.exists() {
            fs::remove_dir_all(&backup).map_err(failure)?;
        }
        if current.exists() {
            fs::rename(&current, &backup).map_err(failure)?;
        }
        if fs::rename(&stage, &current).is_err() {
            let _ = fs::rename(&backup, &current);
            if was_ready {
                let _ = self.start();
            }
            return Err("scanner_install_failed");
        }
        if was_ready && self.start().is_err() {
            let _ = fs::remove_dir_all(&current);
            let _ = fs::rename(&backup, &current);
            let _ = self.start();
            return Err("scanner_start_failed");
        }
        let _ = fs::remove_dir_all(backup);
        Ok(())
    }
    pub fn populate_stage(&mut self, stage: &Path) -> Result<(), &'static str> {
        let engine = stage.join("engine");
        package::verify_engine(&engine)?;
        let database = stage.join("database");
        fs::create_dir_all(&database).map_err(failure)?;
        let conf = self.root.join("freshclam-initial.conf");
        fs::write(
            &conf,
            freshclam_configuration(&database, &engine.join("certs"))?,
        )
        .map_err(failure)?;
        scanner_process::output_with_cancel(
            Command::new(engine.join("freshclam.exe"))
                .current_dir(&engine)
                .arg("--config-file")
                .arg(&conf),
            Duration::from_secs(240),
            &self.cancel,
        )
        .map_err(|error| {
            if error == "content_cancelled" {
                error
            } else {
                "scanner_update_failed"
            }
        })?;
        verify_databases(&engine, &database, &self.cancel)
    }
    pub fn import_databases(&mut self, paths: &[PathBuf]) -> Result<(), &'static str> {
        let spec = package::verify_engine(&self.current().join("engine"))?;
        if paths.len() != 6 {
            return Err("scanner_database_invalid");
        }
        let stage = unique(&self.root, "database-import");
        fs::create_dir(&stage).map_err(failure)?;
        let result = (|| {
            for item in &spec.files {
                let target = stage.join("engine").join(&item.path);
                fs::create_dir_all(target.parent().ok_or("scanner_install_failed")?)
                    .map_err(failure)?;
                fs::copy(self.current().join("engine").join(&item.path), target)
                    .map_err(failure)?;
            }
            fs::create_dir(stage.join("database")).map_err(failure)?;
            let mut used = std::collections::HashSet::new();
            for source in paths {
                let name = source
                    .file_name()
                    .and_then(|s| s.to_str())
                    .ok_or("scanner_database_invalid")?;
                let meta = fs::symlink_metadata(source).map_err(failure)?;
                if !(package::DATABASES.contains(&name) || package::is_database_signature(name))
                    || !used.insert(name)
                    || !meta.is_file()
                    || meta.file_type().is_symlink()
                    || meta.len() > 400 * 1024 * 1024
                {
                    return Err("scanner_database_invalid");
                }
                fs::copy(source, stage.join("database").join(&name)).map_err(failure)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            let _ = fs::remove_dir_all(stage);
            return Err(error);
        }
        self.commit(stage)
    }
    pub fn refresh(&mut self) -> Result<(), &'static str> {
        let current = self.current();
        let engine = current.join("engine");
        package::verify_engine(&engine)?;
        // Persist the attempt before network I/O: a failed update or forced app exit must not
        // trigger automatic retries on every restart. Manual updates remain explicitly available.
        self.preferences.last_update_attempt = Some(now());
        self.save()?;
        let database = unique(&self.root, "database");
        fs::create_dir(&database).map_err(failure)?;
        let result = (|| {
            for name in database_names(&current.join("database"))? {
                if current.join("database").join(&name).is_file() {
                    fs::copy(current.join("database").join(&name), database.join(&name))
                        .map_err(failure)?;
                }
            }
            let conf = self.root.join("freshclam.conf");
            fs::write(
                &conf,
                freshclam_configuration(&database, &engine.join("certs"))?,
            )
            .map_err(failure)?;
            scanner_process::output_with_cancel(
                Command::new(engine.join("freshclam.exe"))
                    .current_dir(&engine)
                    .arg("--config-file")
                    .arg(&conf),
                Duration::from_secs(240),
                &self.cancel,
            )
            .map_err(|error| {
                if error == "content_cancelled" {
                    error
                } else {
                    "scanner_update_failed"
                }
            })?;
            verify_databases(&engine, &database, &self.cancel)?;
            let old = current.join("database.previous");
            let was_ready = self.status().ready;
            self.stop();
            if old.exists() {
                fs::remove_dir_all(&old).map_err(failure)?;
            }
            fs::rename(current.join("database"), &old).map_err(failure)?;
            if fs::rename(&database, current.join("database")).is_err() {
                let _ = fs::rename(&old, current.join("database"));
                if was_ready {
                    let _ = self.start();
                }
                return Err("scanner_update_failed");
            }
            if was_ready && self.start().is_err() {
                let _ = fs::remove_dir_all(current.join("database"));
                let _ = fs::rename(&old, current.join("database"));
                let _ = self.start();
                return Err("scanner_start_failed");
            }
            let _ = fs::remove_dir_all(old);
            Ok(())
        })();
        let _ = fs::remove_dir_all(database);
        self.preferences.update_failed = result.is_err();
        if result.is_ok() {
            self.preferences.last_update = Some(now());
        }
        self.save()?;
        result
    }
}

fn database_names(directory: &Path) -> Result<Vec<String>, &'static str> {
    let mut names = Vec::new();
    for name in package::DATABASES {
        let (version, _) = database_header(&directory.join(name))?;
        names.push(name.to_string());
        names.push(format!(
            "{}-{version}.cvd.sign",
            name.trim_end_matches(".cvd")
        ));
    }
    Ok(names)
}
