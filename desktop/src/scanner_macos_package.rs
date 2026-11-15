//! Expand only the pinned official PKG. Never invoke installer or its scripts.
use crate::{
    scanner_package::{self as package, Component},
    scanner_process,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
pub fn unpack(archive: &Path, destination: &Path, spec: &Component) -> Result<(), &'static str> {
    let expanded = destination.join("vendor");
    let cancel = std::sync::atomic::AtomicBool::new(false);
    scanner_process::output_with_cancel(
        Command::new("/usr/sbin/pkgutil")
            .arg("--expand-full")
            .arg(archive)
            .arg(&expanded),
        Duration::from_secs(120),
        &cancel,
    )?;
    let engine = destination.join("engine");
    fs::create_dir(&engine).map_err(|_| "scanner_install_failed")?;
    for entry in &spec.files {
        let vendor = if entry.path == "COPYING.txt" {
            expanded.join("Resources/License.txt")
        } else {
            let group = if entry.path.starts_with("lib/") {
                "libraries"
            } else {
                "programs"
            };
            let relative = if entry.path.starts_with("certs/") {
                format!("etc/{}", entry.path)
            } else {
                entry.path.clone()
            };
            expanded
                .join(format!(
                    "clamav-{}.macos.universal-{group}.pkg/Payload/usr/local/clamav",
                    spec.version
                ))
                .join(relative)
        };
        // Vendor dylib aliases are dereferenced only inside the hash-verified extracted tree.
        let actual = vendor
            .canonicalize()
            .map_err(|_| "scanner_package_invalid")?;
        if !actual.starts_with(
            expanded
                .canonicalize()
                .map_err(|_| "scanner_package_invalid")?,
        ) {
            return Err("scanner_package_invalid");
        }
        package::check_file(&actual, entry.bytes, &entry.sha256)?;
        let target = engine.join(PathBuf::from(&entry.path));
        fs::create_dir_all(target.parent().ok_or("scanner_install_failed")?)
            .map_err(|_| "scanner_install_failed")?;
        fs::copy(actual, &target).map_err(|_| "scanner_install_failed")?;
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            &target,
            fs::Permissions::from_mode(
                if entry.path.starts_with("bin/") || entry.path.starts_with("sbin/") {
                    0o700
                } else {
                    0o600
                },
            ),
        )
        .map_err(|_| "scanner_install_failed")?;
    }
    package::verify_engine(&engine)?;
    fs::remove_dir_all(expanded).map_err(|_| "scanner_install_failed")?;
    Ok(())
}
