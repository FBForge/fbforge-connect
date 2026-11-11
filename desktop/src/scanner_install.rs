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

fn freshclam_command(
    engine: &Path,
    configuration: &Path,
) -> Result<(Command, Option<crate::network_trust_bundle::TrustBundle>), &'static str> {
    let mut command = Command::new(engine.join("freshclam.exe"));
    // FreshClam's progress output can exceed the bounded helper pipe even on success.
    // The native operation state supplies UI progress, so retain only errors here.
    command
        .current_dir(engine)
        .arg("--quiet")
        .arg("--config-file")
        .arg(configuration);
    crate::network_settings::downloader(&mut command)?;
    let trust = crate::network_settings::download_trust(&mut command)?;
    Ok((command, trust))
}
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
        if let Err(error) =
            ensure_database_progress(&current.join("database"), &stage.join("database"))
        {
            let _ = fs::remove_dir_all(stage);
            return Err(error);
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
        let (mut command, _trust) = freshclam_command(&engine, &conf)?;
        scanner_process::output_with_cancel(&mut command, Duration::from_secs(240), &self.cancel)
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
            let (mut command, _trust) = freshclam_command(&engine, &conf)?;
            scanner_process::output_with_cancel(
                &mut command,
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
            ensure_database_progress(&current.join("database"), &database)?;
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

// Authenticity is verified before this guard. Compare each independent database,
// including online refreshes, before stopping the daemon or replacing any file.
fn ensure_database_progress(current: &Path, next: &Path) -> Result<(), &'static str> {
    for name in package::DATABASES {
        if let Ok(previous) = database_header(&current.join(name)) {
            let candidate = database_header(&next.join(name))?;
            if candidate.0 < previous.0 || candidate.1 < previous.1 {
                return Err("scanner_database_rollback");
            }
        }
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freshclam_progress_does_not_turn_success_into_a_bounded_output_failure() {
        let root = std::env::temp_dir().join(format!(
            "fbforge-freshclam-output-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let executable = root.join("freshclam.exe");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::write(&executable, "#!/bin/sh\nfor option do\n  if [ \"$option\" = \"--quiet\" ]; then exit 0; fi\ndone\nhead -c 70000 /dev/zero\n").unwrap();
            fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        }
        #[cfg(windows)]
        {
            let powershell = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
                .join("System32/WindowsPowerShell/v1.0/powershell.exe");
            let mut compiler = Command::new(powershell);
            compiler.args(["-NoProfile", "-NonInteractive", "-Command", "Add-Type -TypeDefinition 'using System; public class FreshclamFixture { public static int Main(string[] args) { if (Array.IndexOf(args, \"--quiet\") < 0) Console.Write(new string((char)120, 70000)); return 0; } }' -OutputType ConsoleApplication -OutputAssembly $env:FBFC_TEST_HELPER"])
                .env("FBFC_TEST_HELPER", &executable);
            scanner_process::output_with_cancel(
                &mut compiler,
                Duration::from_secs(30),
                &std::sync::atomic::AtomicBool::new(false),
            )
            .unwrap();
        }
        let cancelled = std::sync::atomic::AtomicBool::new(false);
        assert_eq!(
            scanner_process::output_with_cancel(
                &mut Command::new(&executable),
                Duration::from_secs(10),
                &cancelled,
            ),
            Err("scanner_scan_failed")
        );
        let (mut configured, _trust) =
            freshclam_command(&root, &root.join("freshclam.conf")).unwrap();
        assert_eq!(
            scanner_process::output_with_cancel(
                &mut configured,
                Duration::from_secs(10),
                &cancelled,
            ),
            Ok(String::new())
        );
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
#[path = "scanner_install_regression_tests.rs"]
mod regression_tests;
