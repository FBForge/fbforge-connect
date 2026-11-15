//! Explicit native acceptance against the real optional component, never bundled with the app.
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
    #[cfg(target_os = "macos")]
    {
        let args: Vec<_> = std::env::args_os().collect();
        if args
            .get(1)
            .is_some_and(|v| v == "--fbforge-scanner-guardian")
        {
            if args.len() != 4 {
                return Err("invalid arguments".into());
            }
            return fbforge_connect_native_contracts::scanner_guardian::run(
                std::path::Path::new(&args[2]),
                std::path::Path::new(&args[3]),
            )
            .map_err(Into::into);
        }
    }
    if !cfg!(any(windows, target_os = "macos")) {
        return Err("platform unsupported".into());
    }
    let args: Vec<_> = std::env::args().collect();
    #[cfg(target_os = "macos")]
    if args.get(1).is_some_and(|v| v == "--abrupt-parent") {
        if args.len() != 3 {
            return Err("invalid arguments".into());
        }
        let mut runtime = Runtime::open(PathBuf::from(&args[2]))?;
        let port = runtime.enable(true)?.ok_or("scanner not ready")?;
        println!("{port}");
        std::io::stdout().flush()?;
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }

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
        let port = match runtime.enable(true) {
            Ok(Some(port)) => port,
            result => {
                // This isolated fixture contains no credentials or user files. Capture only
                // its vendor startup output, with an owned process and a bounded lifetime.
                let engine = runtime.current().join("engine");
                let path = root.join("clamd-probe.log");
                let output = fs::File::create(&path)?;
                let mut command =
                    fbforge_connect_native_contracts::scanner_package::command(&engine, "clamd");
                command
                    .arg("--config-file")
                    .arg(root.join("clamd.conf"))
                    .stdout(output.try_clone()?)
                    .stderr(output);
                if let Ok(mut child) = scanner_process::OwnedProcess::spawn(&mut command) {
                    std::thread::sleep(Duration::from_secs(8));
                    eprintln!("scanner_fixture_direct_daemon_running={}", child.running());
                    drop(child);
                }
                let text = fs::read_to_string(path).unwrap_or_default();
                eprintln!(
                    "scanner_fixture_daemon_output={}",
                    text.chars().take(4000).collect::<String>()
                );
                return Err(result
                    .err()
                    .unwrap_or("scanner_acceptance_not_ready")
                    .into());
            }
        };
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
        #[cfg(target_os = "macos")]
        {
            use std::{
                io::{BufRead, BufReader},
                process::{Command, Stdio},
                time::Instant,
            };
            let mut parent = Command::new(std::env::current_exe()?)
                .arg("--abrupt-parent")
                .arg(&root)
                .stdout(Stdio::piped())
                .spawn()?;
            let output = parent.stdout.take().ok_or("missing parent pipe")?;
            let (send, receive) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let mut line = String::new();
                let result = BufReader::new(output)
                    .read_line(&mut line)
                    .ok()
                    .and_then(|_| line.trim().parse::<u16>().ok());
                let _ = send.send(result);
            });
            let port = match receive.recv_timeout(Duration::from_secs(90)).ok().flatten() {
                Some(port) => port,
                None => {
                    let _ = parent.kill();
                    let _ = parent.wait();
                    return Err("forced-exit startup timed out".into());
                }
            };
            assert_eq!(scan(port, b"Fiktive saubere Datei")?, "stream: OK");
            parent.kill()?;
            parent.wait()?;
            let deadline = Instant::now() + Duration::from_secs(10);
            while Instant::now() < deadline
                && TcpStream::connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok()
            {
                std::thread::sleep(Duration::from_millis(100));
            }
            assert!(
                TcpStream::connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_err(),
                "scanner survived forced app exit"
            );
            println!("Native macOS scanner pipe lease stops clamd after a forced parent exit");
        }
        println!("Native ClamAV: verified offline install, owned loopback process, clean/EICAR scans and shutdown passed.");
        Ok(())
    })();
    fs::remove_dir_all(root)?;
    result
}
