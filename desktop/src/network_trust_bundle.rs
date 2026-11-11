//! Short-lived files contain public certificates only. The child cannot choose their paths.
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
};
static ROOTS: OnceLock<PathBuf> = OnceLock::new();
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub fn set_default_roots(path: PathBuf) {
    let _ = ROOTS.set(path);
}
pub struct TrustBundle {
    pub pem: PathBuf,
    pub store: PathBuf,
    pub fingerprints: String,
    directory: PathBuf,
}
impl TrustBundle {
    pub fn create(roots: &[String], defaults: Option<&Path>) -> Result<Option<Self>, &'static str> {
        if roots.is_empty() {
            return Ok(None);
        }
        let info = crate::network_trust::validate(roots)?;
        let directory = std::env::temp_dir().join(format!(
            "fbforge-trust-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "network_trust_unavailable")?
                .as_nanos(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).map_err(|_| "network_trust_unavailable")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).is_err()
            {
                let _ = std::fs::remove_dir(&directory);
                return Err("network_trust_unavailable");
            }
        }
        let bundle = Self {
            pem: directory.join("roots.pem"),
            store: directory.join("java.p12"),
            fingerprints: info
                .iter()
                .map(|i| i.fingerprint.clone())
                .collect::<Vec<_>>()
                .join(","),
            directory,
        };
        let mut content = if let Some(path) = defaults {
            let bytes = crate::vault::read_bounded(path, 1024 * 1024)
                .map_err(|_| "network_trust_unavailable")?;
            String::from_utf8(bytes).map_err(|_| "network_trust_unavailable")?
        } else {
            String::new()
        };
        for root in info.iter().filter(|i| defaults.is_none() || i.active) {
            content.push_str(&crate::network_trust::pem(&root.der));
        }
        use std::io::Write;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&bundle.pem)
            .and_then(|mut f| {
                f.write_all(content.as_bytes())?;
                f.sync_all()
            })
            .map_err(|_| "network_trust_unavailable")?;
        Ok(Some(bundle))
    }
    pub fn downloader(roots: &[String]) -> Result<Option<Self>, &'static str> {
        if roots.is_empty() {
            return Ok(None);
        }
        Self::create(roots, Some(ROOTS.get().ok_or("network_trust_unavailable")?))
    }
}
impl Drop for TrustBundle {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.pem);
        let _ = std::fs::remove_file(&self.store);
        let _ = std::fs::remove_dir(&self.directory);
    }
}
