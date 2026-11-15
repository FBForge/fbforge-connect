//! Spawn the signed application as a scanner guardian, with an app-owned pipe lease.
use super::OwnedProcess;
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};
pub fn spawn(engine: &Path, configuration: &Path) -> Result<OwnedProcess, &'static str> {
    use std::os::unix::process::CommandExt;
    let mut command = Command::new(std::env::current_exe().map_err(|_| "scanner_start_failed")?);
    command
        .arg("--fbforge-scanner-guardian")
        .arg(engine)
        .arg(configuration)
        .process_group(0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| "scanner_start_failed")?;
    let lease = child.stdin.take().ok_or("scanner_start_failed")?;
    let output = child.stdout.take().ok_or("scanner_start_failed")?;
    let (send, receive) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(output.take(32))
            .read_line(&mut line)
            .ok()
            .and_then(|_| line.trim().parse::<u32>().ok())
            .filter(|pid| *pid > 1);
        let _ = send.send(result);
    });
    match receive.recv_timeout(Duration::from_secs(10)).ok().flatten() {
        Some(pid) => Ok(OwnedProcess {
            child,
            _lease: Some(lease),
            scanner_pid: Some(pid),
        }),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            Err("scanner_start_failed")
        }
    }
}
pub fn owns_port(pid: u32, port: u16) -> bool {
    if pid <= 1 || port == 0 {
        return false;
    }
    let result = super::output_with_cancel(
        Command::new("/usr/sbin/lsof").args([
            "-nP",
            "-a",
            "-p",
            &pid.to_string(),
            "-iTCP@127.0.0.1",
            "-sTCP:LISTEN",
            "-Fpn",
        ]),
        Duration::from_secs(2),
        &Default::default(),
    );
    result.is_ok_and(|text| {
        text.lines().any(|line| line == format!("p{pid}"))
            && text
                .lines()
                .any(|line| line == format!("n127.0.0.1:{port}"))
    })
}
