//! Original bytes use binary IPC and a native dialog. The renderer cannot select a filesystem path.
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
#[derive(Default)]
pub struct FileSaves(tokio::sync::Mutex<()>);
impl FileSaves {
    pub(crate) fn active(&self) -> bool {
        self.0.try_lock().is_err()
    }
}
#[tauri::command]
pub async fn save_local_file(
    app: tauri::AppHandle,
    saves: State<'_, FileSaves>,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, &'static str> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("invalid_input");
    };
    if bytes.len() > crate::file_save_store::MAX_SAVE_BYTES {
        return Err("content_limit");
    }
    let name = request
        .headers()
        .get("x-fbforge-file-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("invalid_input")?;
    if name.len() > 2048 {
        return Err("invalid_input");
    }
    // UTF-8 names are passed as base64 in an ASCII HTTP header.
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(name)
        .map_err(|_| "invalid_input")?;
    let name = String::from_utf8(decoded).map_err(|_| "invalid_input")?;
    if name.len() > 1024 {
        return Err("invalid_input");
    }
    let name = crate::file_save_store::suggested_name(&name);
    let _guard = saves.0.try_lock().map_err(|_| "export_busy")?;
    let mut data = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let window = app.get_webview_window("main").ok_or("export_failed")?;
            let mut dialog = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("Datei speichern")
                .set_file_name(name);
            if let Ok(directory) = app.path().download_dir() {
                dialog = dialog.set_directory(directory);
            }
            let Some(selected) = dialog.blocking_save_file() else {
                return Ok(None);
            };
            let path = selected.into_path().map_err(|_| "export_failed")?;
            crate::file_save_store::write(&path, &data)?;
            Ok(Some(path.to_string_lossy().into_owned()))
        })();
        data.fill(0);
        result
    })
    .await
    .map_err(|_| "export_failed")?
}
