//! System file dialogs keep backup paths and protected profile bytes in native code.
use crate::{
    profiles,
    protocol::valid_session_id,
    vault::{read_bounded, ProfileSummary, Vault, MAX_BACKUP_BYTES},
    EngineState,
};
use tauri::State;
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
        let selected = app
            .dialog()
            .file()
            .set_title("Geschütztes TEST-Profil sichern")
            .add_filter("Geschütztes TEST-Profil", &["fctest-profile"])
            .set_file_name("test-profil.fctest-profile")
            .blocking_save_file();
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
            .set_title("Geschütztes TEST-Profil wiederherstellen")
            .add_filter("Geschütztes TEST-Profil", &["fctest-profile"])
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
