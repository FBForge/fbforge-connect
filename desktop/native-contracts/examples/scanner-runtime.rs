//! Explicit Windows acceptance against the real optional component, never bundled with the app.
use fbforge_connect_native_contracts::{scanner_process, scanner_runtime::Runtime};
use std::{
    fs,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpStream},
    path::PathBuf,
    time::Duration,
};
fn scan(port: u16, bytes: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    let mut socket = TcpStream::connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))?;
    socket.set_read_timeout(Some(Duration::from_secs(20)))?;
    socket.set_write_timeout(Some(Duration::from_secs(20)))?;
    socket.write_all(b"zINSTREAM\0")?;
    for part in bytes.chunks(8192) {
        socket.write_all(&(part.len() as u32).to_be_bytes())?;
        socket.write_all(part)?;
    }
    socket.write_all(&0u32.to_be_bytes())?;
    let mut response = Vec::new();
    for byte in socket.bytes().take(4096) {
        let byte = byte?;
        if byte == 0 {
            return Ok(String::from_utf8(response)?);
        }
        response.push(byte);
    }
    Err("scanner_acceptance_incomplete".into())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    if !cfg!(windows) {
        return Err("windows_required".into());
    }
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("usage: scanner-runtime COMPONENT.zip NEW_WORKSPACE".into());
    }
    let package = PathBuf::from(&args[1]);
    let root = PathBuf::from(&args[2]);
    if root.exists() {
        return Err("scanner_acceptance_workspace_exists".into());
    }
    fs::create_dir(&root)?;
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut runtime = Runtime::open(root.clone())?;
        if let Err(error) = runtime.install_offline(&package) {
            // Diagnose only this newly owned, credential-free fixture. Keep the failure.
            let stages: Vec<_> = fs::read_dir(&root)?
                .flatten()
                .filter(|entry| {
                    entry.file_name().to_string_lossy().starts_with("install-")
                        && entry.path().is_dir()
                })
                .collect();
            eprintln!(
                "scanner_install_probe stages={} current={}",
                stages.len(),
                runtime.current().exists()
            );
            let write = root.join("diagnostic-write");
            match fs::write(&write, b"owned fixture") {
                Ok(()) => eprintln!("scanner_install_probe write_succeeded=true"),
                Err(error) => eprintln!(
                    "scanner_install_probe write_os_error={}",
                    error.raw_os_error().unwrap_or(-1)
                ),
            }
            if stages.len() == 1 && !runtime.current().exists() {
                let stage = stages[0].path();
                let probe = root.join("diagnostic-rename");
                match fs::rename(&stage, &probe) {
                    Ok(()) => {
                        eprintln!("scanner_install_probe stage_rename_succeeded=true");
                        let _ = fs::rename(probe, stage);
                    }
                    Err(error) => eprintln!(
                        "scanner_install_probe stage_rename_os_error={}",
                        error.raw_os_error().unwrap_or(-1)
                    ),
                }
            }
            return Err(error.into());
        }
        let port = runtime
            .enable(true)?
            .ok_or("scanner_acceptance_not_ready")?;
        assert!(runtime.status().ready);
        assert_eq!(
            scan(port, b"Fiktive saubere Integrations-Testdatei.")?,
            "stream: OK"
        );
        let eicar = [
            "X5O",
            "!P%@AP",
            "[4",
            "\\",
            "PZX54(P^)7CC)7}",
            "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!",
            "$H+H*",
        ]
        .join("");
        let finding = scan(port, eicar.as_bytes())?;
        assert!(finding.ends_with(" FOUND") && finding.to_lowercase().contains("eicar"));
        runtime.enable(false)?;
        assert!(!runtime.status().ready);
        assert!(TcpStream::connect_timeout(
            &SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into(),
            Duration::from_millis(200)
        )
        .is_err());
        assert_eq!(runtime.preferences.enabled, false);
        assert!(!scanner_process::owns_port(std::process::id(), port));
        println!("Native ClamAV: verified offline install, owned loopback process, clean/EICAR scans and shutdown passed.");
        Ok(())
    })();
    fs::remove_dir_all(root)?;
    result
}
