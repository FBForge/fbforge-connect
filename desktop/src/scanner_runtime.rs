//! Managed per-user ClamAV workspace. Only validated, pinned engine executables are started.
use crate::{
    scanner_package as package,
    scanner_process::{self, OwnedProcess},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub enabled: bool,
    pub automatic_updates: bool,
    pub last_update: Option<u64>,
    #[serde(default)]
    pub last_update_attempt: Option<u64>,
    pub update_failed: bool,
}
impl Preferences {
    pub fn automatic_update_due(&self, time: u64) -> bool {
        self.automatic_updates
            && self
                .last_update_attempt
                .or(self.last_update)
                .is_none_or(|previous| time.saturating_sub(previous) >= 86400)
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub installed: bool,
    pub ready: bool,
    pub enabled: bool,
    pub automatic_updates: bool,
    pub engine_version: String,
    pub database_version: Option<u64>,
    pub database_created_at: Option<u64>,
    pub database_age_days: Option<u64>,
    pub last_update: Option<u64>,
    pub update_failed: bool,
}
pub struct Runtime {
    pub root: PathBuf,
    pub preferences: Preferences,
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    process: Option<OwnedProcess>,
    port: Option<u16>,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
pub(crate) fn failure<T>(_: T) -> &'static str {
    "scanner_install_failed"
}
fn path_value(path: &Path) -> Result<String, &'static str> {
    let text = path.to_str().ok_or("scanner_install_failed")?;
    if text.chars().any(|c| c < ' ' || c == '"') {
        return Err("scanner_install_failed");
    }
    Ok(format!("\"{text}\""))
}
pub(crate) fn unique(root: &Path, prefix: &str) -> PathBuf {
    root.join(format!(
        "{prefix}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}
pub fn database_header(path: &Path) -> Result<(u64, u64), &'static str> {
    let mut input = fs::File::open(path).map_err(|_| "scanner_database_missing")?;
    let mut head = [0u8; 512];
    input
        .read_exact(&mut head)
        .map_err(|_| "scanner_database_invalid")?;
    let text = std::str::from_utf8(&head).map_err(|_| "scanner_database_invalid")?;
    let fields: Vec<_> = text.split(':').collect();
    let version = fields
        .get(2)
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("scanner_database_invalid")?;
    let created = fields
        .get(8)
        .and_then(|s| s.trim().parse::<u64>().ok())
        .ok_or("scanner_database_invalid")?;
    if fields.first() != Some(&"ClamAV-VDB") || created == 0 || created > now() + 300 {
        return Err("scanner_database_invalid");
    }
    Ok((version, created))
}
pub fn verify_databases(engine: &Path, database: &Path) -> Result<(), &'static str> {
    package::verify_engine(engine)?;
    for name in package::DATABASES {
        let file = database.join(name);
        let meta = fs::symlink_metadata(&file).map_err(|_| "scanner_database_missing")?;
        if !meta.is_file()
            || meta.file_type().is_symlink()
            || meta.len() < 512
            || meta.len() > 400 * 1024 * 1024
        {
            return Err("scanner_database_invalid");
        }
        let (version, _) = database_header(&file)?;
        let signature = database.join(format!(
            "{}-{version}.cvd.sign",
            name.trim_end_matches(".cvd")
        ));
        let meta = fs::symlink_metadata(&signature).map_err(|_| "scanner_database_invalid")?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 65536 {
            return Err("scanner_database_invalid");
        }
        scanner_process::output(
            Command::new(engine.join("sigtool.exe"))
                .current_dir(engine)
                .arg("--verify")
                .arg(&file)
                .arg("--cvdcertsdir")
                .arg(engine.join("certs")),
            Duration::from_secs(30),
        )
        .map_err(|_| "scanner_database_invalid")?;
    }
    Ok(())
}
impl Runtime {
    pub fn open(root: PathBuf) -> Result<Self, &'static str> {
        fs::create_dir_all(&root).map_err(failure)?;
        let prefs = root.join("preferences.json");
        let preferences = if prefs.exists() {
            let bytes = fs::read(&prefs).map_err(failure)?;
            if bytes.len() > 2048 {
                return Err("scanner_configuration_invalid");
            }
            serde_json::from_slice(&bytes).map_err(|_| "scanner_configuration_invalid")?
        } else {
            Preferences::default()
        };
        Ok(Self {
            root,
            preferences,
            cancel: Default::default(),
            process: None,
            port: None,
        })
    }
    pub fn save(&self) -> Result<(), &'static str> {
        let temporary = unique(&self.root, "preferences");
        fs::write(
            &temporary,
            serde_json::to_vec(&self.preferences).map_err(failure)?,
        )
        .map_err(failure)?;
        // Preferences contain no credentials or executable paths. Preserve the old file on failure.
        let old = self.root.join("preferences.json");
        let backup = self.root.join("preferences.previous");
        if old.exists() {
            let _ = fs::remove_file(&backup);
            fs::rename(&old, &backup).map_err(failure)?;
        }
        if fs::rename(&temporary, &old).is_err() {
            let _ = fs::rename(&backup, &old);
            let _ = fs::remove_file(&temporary);
            return Err("scanner_install_failed");
        }
        let _ = fs::remove_file(backup);
        Ok(())
    }
    pub fn current(&self) -> PathBuf {
        self.root.join("current")
    }
    pub fn status(&mut self) -> Status {
        let current = self.current();
        let installed = current.join("engine/clamd.exe").is_file();
        let ready = self.process.as_mut().is_some_and(|p| {
            p.running()
                && self
                    .port
                    .is_some_and(|port| scanner_process::owns_port(p.id(), port))
        });
        let database = database_header(&current.join("database/daily.cvd")).ok();
        Status {
            installed,
            ready,
            enabled: self.preferences.enabled,
            automatic_updates: self.preferences.automatic_updates,
            engine_version: package::component().map(|s| s.version).unwrap_or_default(),
            database_version: database.map(|v| v.0),
            database_created_at: database.map(|v| v.1),
            database_age_days: database.map(|v| now().saturating_sub(v.1) / 86400),
            last_update: self.preferences.last_update,
            update_failed: self.preferences.update_failed,
        }
    }
    pub fn endpoint(&self) -> Option<u16> {
        self.port
    }
    pub fn stop(&mut self) {
        self.port = None;
        self.process.take();
    }
    pub fn enable(&mut self, enabled: bool) -> Result<Option<u16>, &'static str> {
        if !enabled {
            self.stop();
        }
        let port = if enabled { Some(self.start()?) } else { None };
        self.preferences.enabled = enabled;
        self.save()?;
        Ok(port)
    }
    pub fn start(&mut self) -> Result<u16, &'static str> {
        #[cfg(not(windows))]
        {
            return Err("scanner_unsupported");
        }
        #[cfg(windows)]
        {
            self.start_windows()
        }
    }
    #[cfg(windows)]
    fn start_windows(&mut self) -> Result<u16, &'static str> {
        if let (Some(process), Some(port)) = (&mut self.process, self.port) {
            if process.running() && scanner_process::owns_port(process.id(), port) {
                return Ok(port);
            }
        }
        self.stop();
        let current = self.current();
        let engine = current.join("engine");
        let database = current.join("database");
        verify_databases(&engine, &database)?;
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "scanner_start_failed")?;
        let port = listener
            .local_addr()
            .map_err(|_| "scanner_start_failed")?
            .port();
        let temporary = self.root.join("temporary");
        fs::create_dir_all(&temporary).map_err(failure)?;
        let configuration = self.root.join("clamd.conf");
        fs::write(
            &configuration,
            clamd_configuration(&database, &temporary, port, &engine.join("certs"))?,
        )
        .map_err(failure)?;
        drop(listener);
        let mut command = Command::new(engine.join("clamd.exe"));
        command
            .current_dir(&engine)
            .arg("--config-file")
            .arg(&configuration)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut process = OwnedProcess::spawn(&mut command)?;
        let deadline = Instant::now() + Duration::from_secs(60);
        while Instant::now() < deadline {
            if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err("content_cancelled");
            }
            if !process.running() {
                return Err("scanner_start_failed");
            }
            if scanner_process::owns_port(process.id(), port) && ping(port) {
                self.port = Some(port);
                self.process = Some(process);
                return Ok(port);
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        Err("scanner_start_failed")
    }
}
fn ping(port: u16) -> bool {
    (|| {
        let mut socket = TcpStream::connect_timeout(
            &SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into(),
            Duration::from_millis(200),
        )
        .ok()?;
        socket
            .set_read_timeout(Some(Duration::from_millis(200)))
            .ok()?;
        socket
            .set_write_timeout(Some(Duration::from_millis(200)))
            .ok()?;
        socket.write_all(b"zPING\0").ok()?;
        let mut reply = [0; 5];
        socket.read_exact(&mut reply).ok()?;
        (reply == *b"PONG\0").then_some(())
    })()
    .is_some()
}
pub fn clamd_configuration(
    database: &Path,
    temporary: &Path,
    port: u16,
    certificates: &Path,
) -> Result<String, &'static str> {
    if port == 0 {
        return Err("scanner_configuration_invalid");
    }
    Ok(format!("Foreground yes\nTCPAddr 127.0.0.1\nTCPSocket {port}\nDatabaseDirectory {}\nCVDCertsDirectory {}\nTemporaryDirectory {}\nMaxThreads 2\nMaxQueue 4\nMaxConnectionQueueLength 8\nMaxScanTime 15000\nMaxFileSize 32M\nMaxScanSize 64M\nStreamMaxLength 32M\nMaxRecursion 12\nAlertExceedsMax yes\nAlertEncrypted yes\nAlertOLE2Macros yes\nScanPDF yes\nScanOLE2 yes\nDisableCache yes\nConcurrentDatabaseReload no\nSelfCheck 30\n", path_value(database)?, path_value(certificates)?, path_value(temporary)?))
}
pub fn freshclam_configuration(
    database: &Path,
    certificates: &Path,
) -> Result<String, &'static str> {
    Ok(format!("DatabaseDirectory {}\nCVDCertsDirectory {}\nDatabaseMirror database.clamav.net\nScriptedUpdates no\nConnectTimeout 10\nReceiveTimeout 30\nMaxAttempts 2\n", path_value(database)?, path_value(certificates)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_update_limit_includes_failed_attempts_and_retains_old_preferences() {
        let mut preferences: Preferences = serde_json::from_str(
            r#"{"enabled":true,"automaticUpdates":true,"lastUpdate":100,"updateFailed":false}"#,
        )
        .unwrap();
        assert!(!preferences.automatic_update_due(101));
        assert!(preferences.automatic_update_due(86500));
        preferences.last_update_attempt = Some(86500);
        preferences.update_failed = true;
        assert!(!preferences.automatic_update_due(86501));
        assert!(!preferences.automatic_update_due(1)); // Clock moved backwards.
        assert!(preferences.automatic_update_due(172900));
        preferences.automatic_updates = false;
        assert!(!preferences.automatic_update_due(172900));
    }
    #[test]
    fn local_configuration_is_bounded_loopback_only_and_has_no_execution_hooks() {
        let text = clamd_configuration(
            Path::new("database"),
            Path::new("temporary"),
            3310,
            Path::new("certs"),
        )
        .unwrap();
        assert!(text.contains("TCPAddr 127.0.0.1\n"));
        assert!(text.contains("AlertExceedsMax yes"));
        assert!(text.contains("MaxThreads 2"));
        assert!(!text.contains("VirusEvent"));
        assert!(clamd_configuration(
            Path::new("bad\nVirusEvent injected"),
            Path::new("temp"),
            3310,
            Path::new("certs")
        )
        .is_err());
        assert!(freshclam_configuration(Path::new("bad\"path"), Path::new("certs")).is_err());
    }
}
