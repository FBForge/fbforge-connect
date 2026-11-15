//! A private pipe lease ties a foreground clamd to the app even after SIGKILL.
//! This helper is the same signed executable, invoked before starting Tauri.
use crate::scanner_package as package;
use std::{
    io::{Read, Write},
    path::Path,
    process::Stdio,
    time::Duration,
};
pub fn run(engine: &Path, configuration: &Path) -> Result<(), &'static str> {
    package::verify_engine(engine)?;
    if !std::fs::symlink_metadata(configuration)
        .map_err(|_| "scanner_configuration_invalid")?
        .is_file()
    {
        return Err("scanner_configuration_invalid");
    }
    let mut child = package::command(engine, "clamd")
        .arg("--config-file")
        .arg(configuration)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "scanner_start_failed")?;
    let announced =
        writeln!(std::io::stdout(), "{}", child.id()).and_then(|_| std::io::stdout().flush());
    if announced.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("scanner_start_failed");
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut byte = [0];
        let _ = std::io::stdin().read(&mut byte);
        let _ = sender.send(());
    });
    let result = loop {
        match child.try_wait() {
            Ok(Some(_)) | Err(_) => break Err("scanner_start_failed"),
            Ok(None) => {}
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break Ok(()),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }
    };
    let _ = child.kill();
    let _ = child.wait();
    result
}
