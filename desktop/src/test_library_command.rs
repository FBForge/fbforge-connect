use crate::test_library::{LibraryRequest, TestLibrary};
use std::sync::Mutex;
use tauri::Manager;

// Serialize native callers too, including renderer reloads during a save.
static LIBRARY_LOCK: Mutex<()> = Mutex::new(());
#[tauri::command]
pub fn test_library(
    app: tauri::AppHandle,
    request: LibraryRequest,
) -> Result<serde_json::Value, &'static str> {
    let _guard = LIBRARY_LOCK.lock().map_err(|_| "vault_unavailable")?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "vault_unavailable")?
        .join("test-library");
    TestLibrary(root).execute(request)
}
