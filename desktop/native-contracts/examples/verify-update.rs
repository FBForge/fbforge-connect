//! Independent verification of the exact signed setup retained by the release workflow.
use fbforge_connect_native_contracts::update_policy;
use std::{fs, path::Path};

fn verify(directory: &Path, key: &Path) -> Result<(), &'static str> {
    let raw = fs::read(directory.join("latest.json")).map_err(|_| "update_manifest_missing")?;
    if raw.len() > update_policy::MAX_MANIFEST {
        return Err("update_manifest_invalid");
    }
    let manifest: serde_json::Value =
        serde_json::from_slice(&raw).map_err(|_| "update_manifest_invalid")?;
    update_policy::manifest(&manifest, "0.0.0")?;
    let version = manifest["version"]
        .as_str()
        .ok_or("update_manifest_invalid")?;
    let name = format!("FBForge Connect_{version}_x64-setup.exe");
    let path = directory.join(name);
    if fs::metadata(&path)
        .map_err(|_| "update_package_invalid")?
        .len()
        > update_policy::MAX_PACKAGE as u64
    {
        return Err("update_package_too_large");
    }
    let bytes = fs::read(&path).map_err(|_| "update_package_invalid")?;
    let signature = fs::read_to_string(path.with_extension("exe.sig"))
        .map_err(|_| "update_signature_invalid")?;
    if manifest["platforms"]["windows-x86_64"]["signature"].as_str() != Some(signature.trim()) {
        return Err("update_signature_invalid");
    }
    let key = fs::read_to_string(key).map_err(|_| "update_not_configured")?;
    update_policy::verify(&bytes, &signature, &key, version)
}
fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() != 3 || verify(Path::new(&args[1]), Path::new(&args[2])).is_err() {
        eprintln!("update_artifact_verification_failed");
        std::process::exit(1);
    }
    println!("Update package signature, signed version, target and download identity verified.");
}
