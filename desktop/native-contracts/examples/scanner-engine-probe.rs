//! Verify and execute a relocated scanner using the exact native product extraction path.
use fbforge_connect_native_contracts::{scanner_package as package, scanner_process};
use std::{path::PathBuf, time::Duration};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let archive = PathBuf::from(args.next().ok_or("archive missing")?);
    let root = PathBuf::from(args.next().ok_or("fresh destination missing")?);
    let keep = args.next().as_deref() == Some("--keep");
    if args.next().is_some() {
        return Err("invalid arguments".into());
    }
    package::unpack_upstream(&archive, &root)?;
    let engine = root.join("engine");
    package::verify_engine(&engine)?;
    let probe = root.join("probe");
    std::fs::create_dir(&probe)?;
    let configuration = probe.join("freshclam.conf");
    std::fs::write(&configuration,format!("DatabaseDirectory \"{}\"\nDatabaseMirror database.clamav.net\nCVDCertsDirectory \"{}\"\n",probe.display(),engine.join("certs").display()))?;
    let daemon_configuration = probe.join("clamd.conf");
    std::fs::write(&daemon_configuration,format!("Foreground yes\nTCPAddr 127.0.0.1\nTCPSocket 3310\nDatabaseDirectory \"{}\"\nCVDCertsDirectory \"{}\"\n",probe.display(),engine.join("certs").display()))?;
    for program in ["freshclam", "sigtool", "clamd"] {
        let mut command = package::command(&engine, program);
        if program == "freshclam" {
            command.arg("--config-file").arg(&configuration);
        }
        if program == "clamd" {
            command.arg("--config-file").arg(&daemon_configuration);
        }
        let output = scanner_process::output_with_cancel(
            command.arg("--version"),
            Duration::from_secs(10),
            &Default::default(),
        )?;
        if !output.contains(&package::component()?.version) {
            return Err("wrong scanner version".into());
        }
        println!("Native verified relocated scanner executable passed: {program}");
    }
    std::fs::remove_dir_all(probe)?;
    if !keep {
        std::fs::remove_dir_all(root)?;
    }
    Ok(())
}
