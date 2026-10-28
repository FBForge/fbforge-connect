//! Plaintext exports only enter a newly reserved directory chosen through a native dialog.
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub const FILE_LIMIT: u64 = 32 * 1024 * 1024;
pub const MESSAGE_LIMIT: u64 = 64 * 1024 * 1024;
pub const CHUNK_SIZE: usize = 24 * 1024;

pub fn reserve(parent: &Path, name: &str) -> Result<PathBuf, &'static str> {
    for index in 0..10000 {
        let path = parent.join(if index == 0 {
            name.to_string()
        } else {
            format!("{name}-{index}")
        });
        #[allow(unused_mut)]
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("export_failed"),
        }
    }
    Err("export_failed")
}

pub fn attachment_name(index: usize, name: Option<&str>) -> String {
    let clean: String = name
        .unwrap_or("Anlage.bin")
        .chars()
        .take(120)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim_matches(|c| c == '.' || c == ' ');
    // The ordinal also avoids reserved Windows device names and duplicate basenames.
    format!(
        "{index:02}-{}",
        if clean.is_empty() {
            "Anlage.bin"
        } else {
            clean
        }
    )
}

pub fn decode_chunk(text: &str) -> Result<Vec<u8>, &'static str> {
    if text.len() > CHUNK_SIZE * 4 / 3 || text.len() % 4 != 0 {
        return Err("engine_protocol_error");
    }
    fn digit(c: u8) -> Result<u32, &'static str> {
        Ok(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("engine_protocol_error"),
        })
    }
    let mut output = Vec::with_capacity(text.len() / 4 * 3);
    for (index, block) in text.as_bytes().chunks_exact(4).enumerate() {
        let last = (index + 1) * 4 == text.len();
        let a = digit(block[0])?;
        let b = digit(block[1])?;
        if block[2] == b'=' {
            if !last || block[3] != b'=' || b & 15 != 0 {
                return Err("engine_protocol_error");
            }
            output.push(((a << 2) | (b >> 4)) as u8);
        } else {
            let c = digit(block[2])?;
            output.push(((a << 2) | (b >> 4)) as u8);
            output.push(((b << 4) | (c >> 2)) as u8);
            if block[3] == b'=' {
                if !last || c & 3 != 0 {
                    return Err("engine_protocol_error");
                }
            } else {
                output.push(((c << 6) | digit(block[3])?) as u8);
            }
        }
    }
    Ok(output)
}

pub struct ExportDirectory {
    pub path: PathBuf,
    files: Vec<PathBuf>,
    complete: bool,
}
impl ExportDirectory {
    pub fn new(parent: &Path, name: &str) -> Result<Self, &'static str> {
        let mut export = Self {
            path: reserve(parent, name)?,
            files: vec![],
            complete: false,
        };
        let mut marker = export.create("UNVOLLSTAENDIG.txt")?;
        marker.write_all(b"Dieser Export ist noch nicht vollstaendig. Ein abgeschlossener Export enthaelt export.json und keine UNVOLLSTAENDIG.txt.")
            .and_then(|_| marker.sync_all()).map_err(|_| "export_failed")?;
        Ok(export)
    }
    pub fn create(&mut self, name: &str) -> Result<File, &'static str> {
        if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', ':']) {
            return Err("invalid_input");
        }
        let path = self.path.join(name);
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&path).map_err(|_| "export_failed")?;
        self.files.push(path);
        Ok(file)
    }
    pub fn finish(mut self, manifest: &serde_json::Value) -> Result<PathBuf, &'static str> {
        let mut file = self.create("export.json")?;
        let bytes = serde_json::to_vec_pretty(manifest).map_err(|_| "export_failed")?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "export_failed")?;
        fs::remove_file(self.path.join("UNVOLLSTAENDIG.txt")).map_err(|_| "export_failed")?;
        self.complete = true;
        Ok(self.path.clone())
    }
}
impl Drop for ExportDirectory {
    fn drop(&mut self) {
        if !self.complete {
            // Never recursively remove foreign files that might have appeared in the chosen folder.
            for file in &self.files {
                let _ = fs::remove_file(file);
            }
            let _ = fs::remove_dir(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("fbforge-export-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        reserve(&root, "test").unwrap()
    }
    #[test]
    fn hostile_names_and_noncanonical_base64_cannot_escape_or_change_content() {
        for name in [
            "../../evil",
            "C:\\Windows\\file",
            "CON.txt",
            "a:b",
            "...",
            "<bad>.pdf",
        ] {
            let safe = attachment_name(1, Some(name));
            assert!(!safe.contains(['/', '\\', ':', '<', '>']));
            assert!(safe.starts_with("01-"));
        }
        assert_eq!(decode_chunk("AAH/").unwrap(), [0, 1, 255]);
        assert_eq!(decode_chunk("YQ==").unwrap(), b"a");
        assert_eq!(decode_chunk("YWI=").unwrap(), b"ab");
        for invalid in ["YQ=", "YR==", "YWJ=", "YQ==YQ==", "YQ\n=", "===="] {
            assert!(decode_chunk(invalid).is_err());
        }
    }
    #[test]
    fn complete_exports_never_overwrite_and_failed_exports_remove_only_owned_files() {
        let root = root();
        let mut first = ExportDirectory::new(&root, "Einreichung-1").unwrap();
        assert!(first.path.join("UNVOLLSTAENDIG.txt").exists());
        first
            .create("metadata.json")
            .unwrap()
            .write_all(b"{}")
            .unwrap();
        let saved = first.finish(&serde_json::json!({"complete":true})).unwrap();
        assert!(!saved.join("UNVOLLSTAENDIG.txt").exists());
        let mut failed = ExportDirectory::new(&root, "Einreichung-1").unwrap();
        assert_ne!(saved, failed.path);
        assert!(failed.create("../outside").is_err());
        failed.create("data.json").unwrap();
        let path = failed.path.clone();
        fs::write(path.join("foreign"), b"keep").unwrap();
        drop(failed);
        assert!(!path.join("data.json").exists());
        assert_eq!(fs::read(path.join("foreign")).unwrap(), b"keep");
        assert_eq!(fs::read(saved.join("metadata.json")).unwrap(), b"{}");
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn existing_symlinks_are_never_followed() {
        use std::os::unix::fs::symlink;
        let root = root();
        let mut export = ExportDirectory::new(&root, "message").unwrap();
        let target = root.join("target");
        fs::write(&target, b"keep").unwrap();
        symlink(&target, export.path.join("data.json")).unwrap();
        assert!(export.create("data.json").is_err());
        assert_eq!(fs::read(target).unwrap(), b"keep");
        drop(export);
        fs::remove_dir_all(root).unwrap();
    }
}
