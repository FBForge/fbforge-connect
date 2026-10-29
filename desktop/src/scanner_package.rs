//! Fixed upstream engine trust and bounded offline extraction. No executable path comes from IPC.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MANIFEST: &str = include_str!("../scanner-component.json");
pub const PACKAGE_LIMIT: u64 = 512 * 1024 * 1024;
const DATABASE_LIMIT: u64 = 400 * 1024 * 1024;
pub const DATABASES: [&str; 3] = ["main.cvd", "daily.cvd", "bytecode.cvd"];
pub type Failure = &'static str;

pub fn is_database_signature(name: &str) -> bool {
    ["main-", "daily-", "bytecode-"].iter().any(|prefix| {
        name.strip_prefix(prefix)
            .and_then(|tail| tail.strip_suffix(".cvd.sign"))
            .is_some_and(|version| {
                !version.is_empty()
                    && version.len() <= 12
                    && version.bytes().all(|b| b.is_ascii_digit())
            })
    })
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileEntry {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Download {
    pub url: String,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Component {
    pub format: u8,
    pub version: String,
    pub target: String,
    pub signer_fingerprint: String,
    pub archive: Download,
    pub source: Download,
    pub files: Vec<FileEntry>,
}
pub fn component() -> Result<Component, Failure> {
    let value: Component = serde_json::from_str(MANIFEST).map_err(|_| "scanner_package_invalid")?;
    let release = format!(
        "https://github.com/Cisco-Talos/clamav/releases/download/clamav-{}/clamav-{}",
        value.version, value.version
    );
    if value.archive.url != format!("{release}.win.x64.zip")
        || value.source.url != format!("{release}.tar.gz")
        || value.signer_fingerprint.len() != 40
        || !value
            .signer_fingerprint
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
        || value.source.bytes == 0
        || value.source.bytes > PACKAGE_LIMIT
        || value.source.sha256.len() != 64
        || value.archive.bytes == 0
        || value.archive.bytes > PACKAGE_LIMIT
        || value.archive.sha256.len() != 64
    {
        return Err("scanner_package_invalid");
    }
    if value.format != 1
        || value.target != "windows-x86_64"
        || value.files.len() > 100
        || !value.files.iter().all(|file| {
            safe_path(&file.path)
                && file.bytes <= PACKAGE_LIMIT
                && file.sha256.len() == 64
                && file.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        })
        || value
            .files
            .iter()
            .map(|f| &f.path)
            .collect::<HashSet<_>>()
            .len()
            != value.files.len()
    {
        return Err("scanner_package_invalid");
    }
    Ok(value)
}

fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && !value.contains('\\')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-/".contains(&b))
        && value
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}

pub fn check_file(path: &Path, length: u64, hash: &str) -> Result<(), Failure> {
    let meta = fs::symlink_metadata(path).map_err(|_| "scanner_package_invalid")?;
    if !meta.is_file()
        || meta.file_type().is_symlink()
        || meta.len() != length
        || length > PACKAGE_LIMIT
    {
        return Err("scanner_package_invalid");
    }
    let mut file = fs::File::open(path).map_err(|_| "scanner_package_invalid")?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "scanner_package_invalid")?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > length {
            return Err("scanner_package_invalid");
        }
        digest.update(&buffer[..count]);
    }
    if total != length || format!("{:x}", digest.finalize()) != hash {
        return Err("scanner_package_invalid");
    }
    Ok(())
}

fn entries(directory: &Path, prefix: &str, paths: &mut HashSet<String>) -> Result<(), Failure> {
    for item in fs::read_dir(directory).map_err(|_| "scanner_package_invalid")? {
        let item = item.map_err(|_| "scanner_package_invalid")?;
        let kind = item.file_type().map_err(|_| "scanner_package_invalid")?;
        let name = item
            .file_name()
            .into_string()
            .map_err(|_| "scanner_package_invalid")?;
        let path = format!("{prefix}{name}");
        if kind.is_symlink() || !safe_path(&path) {
            return Err("scanner_package_invalid");
        }
        if kind.is_dir() {
            entries(&item.path(), &(path + "/"), paths)?;
        } else if kind.is_file() {
            paths.insert(path);
        } else {
            return Err("scanner_package_invalid");
        }
        if paths.len() > 100 {
            return Err("scanner_package_invalid");
        }
    }
    Ok(())
}

pub fn verify_engine(root: &Path) -> Result<Component, Failure> {
    let spec = component()?;
    verify_files(root, &spec.files)?;
    Ok(spec)
}
fn verify_files(root: &Path, files: &[FileEntry]) -> Result<(), Failure> {
    if fs::symlink_metadata(root)
        .map_err(|_| "scanner_package_invalid")?
        .file_type()
        .is_symlink()
    {
        return Err("scanner_package_invalid");
    }
    let mut actual = HashSet::new();
    entries(root, "", &mut actual)?;
    if actual != files.iter().map(|entry| entry.path.clone()).collect() {
        return Err("scanner_package_invalid");
    }
    for file in files {
        check_file(&root.join(&file.path), file.bytes, &file.sha256)?;
    }
    Ok(())
}

/// Destination must be a newly created directory beneath the managed scanner workspace.
/// A failure removes the staging tree; the caller never replaces its previous working engine.
pub fn unpack_upstream(archive: &Path, destination: &Path) -> Result<(), Failure> {
    let spec = component()?;
    check_file(archive, spec.archive.bytes, &spec.archive.sha256)?;
    unpack(archive, destination, &spec, false)
}
pub fn unpack_offline(archive: &Path, destination: &Path) -> Result<(), Failure> {
    let spec = component()?;
    unpack(archive, destination, &spec, true)
}

fn unpack(
    archive: &Path,
    destination: &Path,
    spec: &Component,
    offline: bool,
) -> Result<(), Failure> {
    // create_dir is the ownership boundary: never remove a pre-existing destination.
    fs::create_dir(destination).map_err(|_| "scanner_install_failed")?;
    let result = unpack_inner(archive, destination, spec, offline);
    if result.is_err() {
        let _ = fs::remove_dir_all(destination);
    }
    result
}
fn unpack_inner(
    archive: &Path,
    destination: &Path,
    spec: &Component,
    offline: bool,
) -> Result<(), Failure> {
    let input = fs::File::open(archive).map_err(|_| "scanner_package_invalid")?;
    if input
        .metadata()
        .map_err(|_| "scanner_package_invalid")?
        .len()
        > PACKAGE_LIMIT
    {
        return Err("scanner_package_invalid");
    }
    let mut zip = zip::ZipArchive::new(input).map_err(|_| "scanner_package_invalid")?;
    if zip.len() > 256 {
        return Err("scanner_package_invalid");
    }
    let mut names = HashSet::new();
    let mut expanded = 0u64;
    let upstream_prefix = format!("clamav-{}.win.x64/", spec.version);
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|_| "scanner_package_invalid")?;
        let name = entry
            .name()
            .map_err(|_| "scanner_package_invalid")?
            .trim_end_matches('/')
            .to_string();
        if !safe_path(&name)
            || !names.insert(name.to_lowercase())
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("scanner_package_invalid");
        }
        expanded = expanded
            .checked_add(entry.size())
            .ok_or("scanner_package_invalid")?;
        if expanded > 1024 * 1024 * 1024 {
            return Err("scanner_package_invalid");
        }
        if entry.is_dir() {
            continue;
        }
        let relative = if offline {
            name.strip_prefix("engine/")
        } else {
            name.strip_prefix(&upstream_prefix)
        };
        let expected = relative.and_then(|path| spec.files.iter().find(|file| file.path == path));
        let database = offline
            && name
                .strip_prefix("database/")
                .is_some_and(|part| DATABASES.contains(&part) || is_database_signature(part));
        if offline && expected.is_none() && !database {
            return Err("scanner_package_invalid");
        }
        let Some((target, limit)) = expected
            .map(|file| (PathBuf::from("engine").join(&file.path), file.bytes))
            .or_else(|| {
                database.then(|| {
                    (
                        PathBuf::from(&name),
                        if name.ends_with(".sign") {
                            65536
                        } else {
                            DATABASE_LIMIT
                        },
                    )
                })
            })
        else {
            continue;
        };
        if entry.size() > limit
            || expected.is_some_and(|file| entry.size() != file.bytes)
            || database && !name.ends_with(".sign") && entry.size() < 512
        {
            return Err("scanner_package_invalid");
        }
        let output = destination.join(target);
        fs::create_dir_all(output.parent().ok_or("scanner_install_failed")?)
            .map_err(|_| "scanner_install_failed")?;
        let mut output_file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|_| "scanner_install_failed")?;
        let copied = std::io::copy(&mut entry.by_ref().take(limit + 1), &mut output_file)
            .map_err(|_| "scanner_package_invalid")?;
        if copied > limit {
            return Err("scanner_package_invalid");
        }
        output_file.flush().map_err(|_| "scanner_install_failed")?;
    }
    verify_files(&destination.join("engine"), &spec.files)?;
    if offline {
        for name in DATABASES {
            if !destination.join("database").join(name).is_file() {
                return Err("scanner_database_missing");
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn workspace() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "scanner-policy-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        path
    }
    fn spec() -> Component {
        Component {
            format: 1,
            version: "1.0".into(),
            target: "windows-x86_64".into(),
            signer_fingerprint: "test".into(),
            archive: Download {
                url: "unused".into(),
                bytes: 0,
                sha256: String::new(),
            },
            source: Download {
                url: "unused".into(),
                bytes: 0,
                sha256: String::new(),
            },
            files: vec![FileEntry {
                path: "clamd.exe".into(),
                bytes: 5,
                sha256: format!("{:x}", Sha256::digest(b"clean")),
            }],
        }
    }
    #[test]
    fn official_component_is_pinned_to_a_bounded_matching_runtime() {
        let spec = component().unwrap();
        assert!(spec
            .archive
            .url
            .starts_with("https://github.com/Cisco-Talos/clamav/releases/download/"));
        assert!(spec.files.iter().any(|file| file.path == "freshclam.exe"));
        assert!(spec.files.iter().any(|file| file.path == "COPYING.txt"));
        assert!(!spec
            .files
            .iter()
            .any(|file| file.path.ends_with(".pdb") || file.path == "clamsubmit.exe"));
    }
    fn write_package(path: &Path, mutation: Option<(&str, &[u8])>, link: bool) {
        let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for name in [
            "engine/clamd.exe",
            "database/main.cvd",
            "database/daily.cvd",
            "database/bytecode.cvd",
        ] {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            let database = [b' '; 512];
            let baseline: &[u8] = if name.starts_with("database/") {
                &database
            } else {
                b"clean"
            };
            let bytes = mutation
                .filter(|(changed, _)| *changed == name)
                .map(|(_, bytes)| bytes)
                .unwrap_or(baseline);
            zip.write_all(bytes).unwrap();
        }
        if let Some((name, bytes)) = mutation.filter(|(name, _)| {
            ![
                "engine/clamd.exe",
                "database/main.cvd",
                "database/daily.cvd",
                "database/bytecode.cvd",
            ]
            .contains(name)
        }) {
            if link {
                zip.add_symlink(
                    name,
                    "../../escaped",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            } else {
                zip.start_file(name, zip::write::SimpleFileOptions::default())
                    .unwrap();
                zip.write_all(bytes).unwrap();
            }
        }
        zip.finish().unwrap();
    }
    #[test]
    fn offline_extraction_accepts_a_complete_hash_verified_baseline() {
        let root = workspace();
        let archive = root.join("input.zip");
        write_package(&archive, None, false);
        unpack(&archive, &root.join("stage"), &spec(), true).unwrap();
        assert_eq!(
            fs::read(root.join("stage/engine/clamd.exe")).unwrap(),
            b"clean"
        );
        for name in DATABASES {
            assert!(root.join("stage/database").join(name).is_file());
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn offline_package_rejects_each_mutation_of_an_otherwise_valid_archive() {
        for (name, bytes, link) in [
            ("../escaped", b"clean".as_slice(), false),
            ("/absolute.exe", b"clean".as_slice(), false),
            ("engine/CLAMD.EXE", b"clean".as_slice(), false),
            ("engine/changed.exe", b"clean".as_slice(), false),
            ("engine/clamd.exe", b"wrong".as_slice(), false),
            ("engine/clamd.exe", b"too large".as_slice(), false),
            ("engine/link", b"clean".as_slice(), true),
        ] {
            let root = workspace();
            let archive = root.join("input.zip");
            write_package(&archive, Some((name, bytes)), link);
            assert!(
                unpack(&archive, &root.join("stage"), &spec(), true).is_err(),
                "accepted {name}"
            );
            assert!(!root.join("stage").exists());
            assert!(!root.join("escaped").exists());
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[test]
    fn failed_install_never_removes_an_existing_installation() {
        let root = workspace();
        let previous = root.join("previous");
        fs::create_dir(&previous).unwrap();
        fs::write(previous.join("keep"), b"retained").unwrap();
        assert!(unpack(&root.join("missing.zip"), &previous, &spec(), true).is_err());
        assert_eq!(fs::read(previous.join("keep")).unwrap(), b"retained");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn engine_verification_checks_payload_and_unexpected_dlls() {
        let root = workspace();
        fs::write(root.join("clamd.exe"), b"clean").unwrap();
        verify_files(&root, &spec().files).unwrap();
        fs::write(root.join("unexpected.dll"), b"anything").unwrap();
        assert!(verify_files(&root, &spec().files).is_err());
        fs::remove_file(root.join("unexpected.dll")).unwrap();
        fs::write(root.join("clamd.exe"), b"wrong").unwrap();
        assert!(verify_files(&root, &spec().files).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
