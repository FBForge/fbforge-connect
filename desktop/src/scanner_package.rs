//! Fixed upstream engine trust and bounded offline extraction. No executable path comes from IPC.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[cfg(not(target_os = "macos"))]
pub const MANIFEST: &str = include_str!("../scanner-component.json");
#[cfg(target_os = "macos")]
pub const MANIFEST: &str = include_str!("../scanner-component.macos.json");
pub fn program(name: &str) -> PathBuf {
    if cfg!(target_os = "macos") {
        PathBuf::from(if name == "clamd" { "sbin" } else { "bin" }).join(name)
    } else {
        PathBuf::from(format!("{name}.exe"))
    }
}
/// Use the verified component paths and reject inherited dynamic-loader injections.
pub fn command(engine: &Path, name: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut command = std::process::Command::new(engine.join(program(name)));
    #[cfg(target_os = "macos")]
    {
        for key in [
            "DYLD_LIBRARY_PATH",
            "DYLD_FALLBACK_LIBRARY_PATH",
            "DYLD_INSERT_LIBRARIES",
            "DYLD_FRAMEWORK_PATH",
            "DYLD_FALLBACK_FRAMEWORK_PATH",
            "DYLD_ROOT_PATH",
            "DYLD_IMAGE_SUFFIX",
        ] {
            command.env_remove(key);
        }
        // Vendor RPATH targets /usr/local/clamav. Use only our hash-verified private libraries.
        command.env("DYLD_LIBRARY_PATH", engine.join("lib"));
    }
    command
}
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
    if value.archive.url
        != format!(
            "{release}{}",
            if cfg!(target_os = "macos") {
                ".macos.universal.pkg"
            } else {
                ".win.x64.zip"
            }
        )
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
        || value.target
            != if cfg!(target_os = "macos") {
                "darwin-aarch64"
            } else {
                "windows-x86_64"
            }
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
    #[cfg(target_os = "macos")]
    let result = if offline || spec.target != "darwin-aarch64" {
        unpack_inner(archive, destination, spec, offline)
    } else {
        crate::scanner_macos_package::unpack(archive, destination, spec)
    };
    #[cfg(not(target_os = "macos"))]
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
        #[cfg(target_os = "macos")]
        if expected.is_some_and(|e| e.path.starts_with("bin/") || e.path.starts_with("sbin/")) {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&output, fs::Permissions::from_mode(0o700))
                .map_err(|_| "scanner_install_failed")?;
        }
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
#[path = "scanner_package_tests.rs"]
mod tests;
