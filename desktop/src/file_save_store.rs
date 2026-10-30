//! Saving is allowed only after the native save dialog selected a path.
use std::{fs, io::Write, path::Path};
pub const MAX_SAVE_BYTES: usize = 32 * 1024 * 1024;
pub fn suggested_name(value: &str) -> String {
    let name = value.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = name
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"|?*".contains(*c))
        .take(180)
        .collect();
    let clean = clean.trim_matches([' ', '.']);
    let stem = clean.split('.').next().unwrap_or("").to_ascii_uppercase();
    if clean.is_empty()
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&stem.as_str())
    {
        "Datei.bin".into()
    } else {
        clean.into()
    }
}
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.len() > MAX_SAVE_BYTES {
        return Err("content_limit");
    }
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("export_failed");
        }
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "export_failed")?
        .as_nanos();
    let temporary = path.with_extension(format!("fbforge-pending-{}-{nonce}", std::process::id()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| "export_failed")?;
    let result = (|| {
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "export_failed")?;
        drop(file);
        fs::rename(&temporary, path).map_err(|_| "export_failed")
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_binary_bytes_survive_and_failed_saves_keep_existing_files() {
        let root = std::env::temp_dir().join(format!("fbforge-save-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("original.bin");
        write(&path, &[0, 255, 10, 13, 128]).unwrap();
        assert_eq!(fs::read(&path).unwrap(), vec![0, 255, 10, 13, 128]);
        write(&path, b"replacement").unwrap();
        assert_eq!(
            write(&path, &vec![0; MAX_SAVE_BYTES + 1]),
            Err("content_limit")
        );
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
        assert_eq!(write(&root, b"x"), Err("export_failed"));
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn names_are_basename_suggestions_not_paths() {
        assert_eq!(suggested_name("C:\\private\\Nachweis.pdf"), "Nachweis.pdf");
        assert_eq!(suggested_name("../../Anlage.pdf"), "Anlage.pdf");
        for name in ["..", " ", "CON", "LPT1.txt", "nul.pdf"] {
            assert_eq!(suggested_name(name), "Datei.bin");
        }
        assert_eq!(suggested_name("Na\u{0000}chweis?.pdf"), "Nachweis.pdf");
    }
    #[cfg(unix)]
    #[test]
    fn a_link_cannot_replace_the_original_target() {
        let root = std::env::temp_dir().join(format!("fbforge-save-link-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("link");
        let target = root.join("target");
        fs::write(&target, b"safe").unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        assert_eq!(write(&path, b"changed"), Err("export_failed"));
        assert_eq!(fs::read(target).unwrap(), b"safe");
        fs::remove_dir_all(root).unwrap();
    }
}
