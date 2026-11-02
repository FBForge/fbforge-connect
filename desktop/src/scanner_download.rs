//! Each online installation owns a fresh workspace. Stale or locked downloads cannot block a retry.
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
const DIRECTORY: &str = "online-downloads";

pub struct Attempt {
    pub archive: PathBuf,
    pub stage: PathBuf,
    directory: PathBuf,
}
impl Attempt {
    pub fn begin(root: &Path) -> Result<Self, &'static str> {
        let parent = root.join(DIRECTORY);
        match fs::create_dir(&parent) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let meta = fs::symlink_metadata(&parent).map_err(|_| "scanner_install_failed")?;
                if !meta.is_dir() || meta.file_type().is_symlink() {
                    return Err("scanner_install_failed");
                }
            }
            Err(_) => return Err("scanner_install_failed"),
        }
        let directory = crate::scanner_runtime::unique(
            &parent,
            &format!("attempt-{}", SEQUENCE.fetch_add(1, Ordering::Relaxed)),
        );
        fs::create_dir(&directory).map_err(|_| "scanner_install_failed")?;
        Ok(Self {
            archive: directory.join("engine.zip"),
            stage: directory.join("stage"),
            directory,
        })
    }
}
impl Drop for Attempt {
    fn drop(&mut self) {
        // A transient Windows lock may defer removal until the next application start.
        // The next attempt always uses a different directory and never overwrites this one.
        let _ = fs::remove_dir_all(&self.directory);
    }
}
pub fn create_archive(path: &Path) -> Result<File, &'static str> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "scanner_install_failed")
}
/// Called when the runtime opens, before any online operation can be active.
pub fn cleanup_stale(root: &Path) {
    let directory = root.join(DIRECTORY);
    if fs::symlink_metadata(&directory)
        .is_ok_and(|meta| meta.is_dir() && !meta.file_type().is_symlink())
    {
        let _ = fs::remove_dir_all(directory);
    }
    let legacy = root.join("engine-download.zip");
    if fs::symlink_metadata(&legacy)
        .is_ok_and(|meta| meta.is_file() && !meta.file_type().is_symlink())
    {
        let _ = fs::remove_file(legacy);
    }
}
#[cfg(test)]
#[path = "scanner_download_tests.rs"]
mod tests;
