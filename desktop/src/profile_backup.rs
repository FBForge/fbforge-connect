//! Backups are decrypted only in native code; dropped files carry ciphertext, never paths.
use crate::{
    profiles,
    protocol::valid_session_id,
    vault::{read_bounded, ProfileSummary, Vault, MAX_BACKUP_BYTES},
    EngineState,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_profile_backup(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    profile_id: String,
) -> Result<bool, &'static str> {
    if !valid_session_id(&profile_id) {
        return Err("invalid_input");
    }
    let sessions: Vec<_> = state
        .profiles
        .lock()
        .await
        .iter()
        .filter(|(_, item)| item.profile_id == profile_id)
        .map(|(session, item)| (session.clone(), item.api))
        .collect();
    for (session, api) in sessions {
        profiles::checkpoint(&app, &state, api, &session).await?;
    }
    let protected = profiles::vault(&app)?.backup(&profile_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Geschütztes Profil sichern")
            .add_filter("Geschütztes Profil", &["fctest-profile"])
            .set_file_name("test-profil.fctest-profile");
        if let Ok(directory) = app.path().download_dir() {
            dialog = dialog.set_directory(directory);
        }
        let selected = dialog.blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(|_| "vault_unavailable")?;
        Vault::write_backup(&path, &protected)?;
        Ok(true)
    })
    .await
    .map_err(|_| "vault_unavailable")?
}
#[tauri::command]
pub async fn import_profile_backup(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<Option<ProfileSummary>, &'static str> {
    let dialog_app = app.clone();
    let protected = tauri::async_runtime::spawn_blocking(move || {
        let selected = dialog_app
            .dialog()
            .file()
            .set_title("Geschütztes Profil wiederherstellen")
            .add_filter("Geschütztes Profil", &["fctest-profile"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|_| "vault_unavailable")?;
        read_bounded(&path, MAX_BACKUP_BYTES).map(Some)
    })
    .await
    .map_err(|_| "vault_unavailable")??;
    let Some(protected) = protected else {
        return Ok(None);
    };
    let _bindings = state.profiles.lock().await;
    profiles::vault(&app)?.restore_backup(&protected).map(Some)
}

/// Binary IPC avoids a JSON/base64 expansion. Native storage still enforces the backup
/// envelope, size, current-user DPAPI binding, profile validation and no-overwrite rule.
#[tauri::command]
pub async fn import_profile_backup_file(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    request: tauri::ipc::Request<'_>,
) -> Result<ProfileSummary, &'static str> {
    let tauri::ipc::InvokeBody::Raw(protected) = request.body() else {
        return Err("vault_invalid");
    };
    if protected.is_empty() || protected.len() > MAX_BACKUP_BYTES {
        return Err("vault_invalid");
    }
    let _bindings = state.profiles.lock().await;
    profiles::vault(&app)?.restore_backup(protected)
}
