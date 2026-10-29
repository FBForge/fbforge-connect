//! Own only the scanner children we start. Windows jobs prevent orphan daemons after a forced exit.
use std::{
    io::Read,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

pub struct OwnedProcess {
    child: Child,
    #[cfg(windows)]
    _job: std::os::windows::io::OwnedHandle,
}
impl OwnedProcess {
    pub fn spawn(command: &mut Command) -> Result<Self, &'static str> {
        command.stdin(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        #[allow(unused_mut)]
        let mut child = command.spawn().map_err(|_| "scanner_start_failed")?;
        #[cfg(windows)]
        {
            use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
            use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                let _ = child.kill();
                return Err("scanner_start_failed");
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags =
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            limits.ProcessMemoryLimit = 3 * 1024 * 1024 * 1024;
            let ok = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    std::mem::size_of_val(&limits) as u32,
                )
            } != 0
                && unsafe { AssignProcessToJobObject(handle, child.as_raw_handle()) } != 0;
            if !ok {
                unsafe {
                    CloseHandle(handle);
                }
                let _ = child.kill();
                let _ = child.wait();
                return Err("scanner_start_failed");
            }
            Ok(Self {
                child,
                _job: unsafe { OwnedHandle::from_raw_handle(handle) },
            })
        }
        #[cfg(not(windows))]
        Ok(Self { child })
    }
    pub fn id(&self) -> u32 {
        self.child.id()
    }
    pub fn running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}
impl Drop for OwnedProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Bounded helper output, no shell and no inherited stdin. A timeout kills our helper and its job.
pub fn output(command: &mut Command, timeout: Duration) -> Result<String, &'static str> {
    output_with_cancel(command, timeout, &std::sync::atomic::AtomicBool::new(false))
}
pub fn output_with_cancel(
    command: &mut Command,
    timeout: Duration,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<String, &'static str> {
    command.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut process = OwnedProcess::spawn(command)?;
    let mut pipe = process.child.stdout.take().ok_or("scanner_start_failed")?;
    let reader = std::thread::spawn(move || {
        let mut result = Vec::new();
        let mut chunk = [0u8; 4096];
        let mut too_large = false;
        loop {
            let count = pipe.read(&mut chunk).map_err(|_| "scanner_scan_failed")?;
            if count == 0 {
                break;
            }
            if result.len() + count <= 65536 {
                result.extend_from_slice(&chunk[..count]);
            } else {
                too_large = true;
            }
        }
        if too_large {
            Err("scanner_scan_failed")
        } else {
            Ok(String::from_utf8_lossy(&result).into_owned())
        }
    });
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.load(std::sync::atomic::Ordering::SeqCst) {
            drop(process);
            let _ = reader.join();
            return Err("content_cancelled");
        }
        match process.child.try_wait() {
            Ok(Some(status)) => {
                let text = reader.join().map_err(|_| "scanner_scan_failed")??;
                return if status.success() {
                    Ok(text)
                } else {
                    Err("scanner_scan_failed")
                };
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                drop(process);
                let _ = reader.join();
                return Err("scanner_scan_failed");
            }
        }
    }
}

#[cfg(windows)]
pub fn owns_port(pid: u32, port: u16) -> bool {
    use windows_sys::Win32::{NetworkManagement::IpHelper::*, Networking::WinSock::AF_INET};
    let mut length = 0u32;
    unsafe {
        GetExtendedTcpTable(
            std::ptr::null_mut(),
            &mut length,
            0,
            AF_INET as u32,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        );
    }
    if length < 4 || length > 8 * 1024 * 1024 {
        return false;
    }
    // u64 allocation provides sufficient alignment for the API; row reads remain unaligned-safe.
    let mut buffer = vec![0u64; (length as usize).div_ceil(8)];
    if unsafe {
        GetExtendedTcpTable(
            buffer.as_mut_ptr().cast(),
            &mut length,
            0,
            AF_INET as u32,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        )
    } != 0
        || length < 4
        || length as usize > buffer.len() * 8
    {
        return false;
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(buffer.as_ptr().cast::<u8>(), length as usize) };
    let count = u32::from_ne_bytes(bytes[..4].try_into().unwrap()) as usize;
    let width = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();
    if count > (bytes.len() - 4) / width {
        return false;
    }
    (0..count).any(|i| {
        let row = unsafe {
            std::ptr::read_unaligned(
                bytes[4 + i * width..]
                    .as_ptr()
                    .cast::<MIB_TCPROW_OWNER_PID>(),
            )
        };
        row.dwOwningPid == pid
            && row.dwLocalAddr.to_ne_bytes() == [127, 0, 0, 1]
            && u16::from_be(row.dwLocalPort as u16) == port
    })
}
#[cfg(not(windows))]
pub fn owns_port(_pid: u32, _port: u16) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn helpers_are_bounded_and_timeout_terminates_the_owned_process() {
        let mut clean = Command::new("/bin/echo");
        clean.arg("ready");
        assert_eq!(
            output(&mut clean, Duration::from_secs(2)).unwrap().trim(),
            "ready"
        );
        let mut blocked = Command::new("/bin/sleep");
        blocked.arg("10");
        let start = Instant::now();
        assert!(output(&mut blocked, Duration::from_millis(100)).is_err());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
