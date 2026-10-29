//! Opens a known documentation chapter using the operating system browser.
use crate::documentation_links::documentation_url;

#[cfg(windows)]
pub(crate) fn launch(url: &str) -> Result<(), &'static str> {
    use std::{ffi::c_void, ptr};
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            window: *mut c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show: i32,
        ) -> isize;
    }
    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    // Both UTF-16 buffers are NUL-terminated and remain alive for the call.
    // The target is constructed exclusively from the fixed chapter allowlist.
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            ptr::null(),
            ptr::null(),
            1,
        )
    };
    if result > 32 {
        Ok(())
    } else {
        Err("browser_unavailable")
    }
}

#[cfg(not(windows))]
pub(crate) fn launch(url: &str) -> Result<(), &'static str> {
    use std::process::{Command, Stdio};
    let executable = if cfg!(target_os = "macos") {
        "/usr/bin/open"
    } else {
        "/usr/bin/xdg-open"
    };
    let status = Command::new(executable)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "browser_unavailable")?;
    if status.success() {
        Ok(())
    } else {
        Err("browser_unavailable")
    }
}

#[tauri::command]
pub async fn open_documentation(topic: String) -> Result<(), String> {
    let target = documentation_url(&topic).map_err(str::to_owned)?;
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::task::spawn_blocking(move || launch(&target)),
    )
    .await
    .map_err(|_| "browser_unavailable".to_owned())?
    .map_err(|_| "browser_unavailable".to_owned())?
    .map_err(str::to_owned)
}
