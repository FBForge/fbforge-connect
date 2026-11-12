//! Renderer actions expose summaries and public drafts only, never private JWKs or archive paths.
use crate::{
    destination_backup_model::Backup, destination_backup_store::Store, engine::request,
    portable_archive, profiles, protocol::ApiVersion, EngineState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum BackupAction {
    List {},
    Capture {
        destination_id: String,
        name: String,
    },
    Inspect {
        id: String,
    },
    Delete {
        id: String,
    },
    Export {
        id: String,
    },
    Import {},
}
async fn store(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<Store, &'static str> {
    if api != ApiVersion::V3 {
        return Err("invalid_input");
    }
    profiles::require_profile(state, api, session).await?;
    let bindings = state.profiles.lock().await;
    let binding = bindings.get(session).ok_or("vault_profile_required")?;
    let profile = profiles::vault(app)?.load(&binding.profile_id)?;
    if profile.environment != state.environment() || profile.api_version != api {
        return Err("environment_mismatch");
    }
    Store::new(
        &app.path()
            .app_data_dir()
            .map_err(|_| "backup_unavailable")?
            .join("destination-backups"),
        &binding.profile_id,
        state.environment(),
    )
}
#[tauri::command]
pub async fn destination_backups(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    action: BackupAction,
) -> Result<Value, &'static str> {
    // Same lock/order as deleting a profile. A late import cannot recreate forgotten data.
    let _guard = crate::profile_workspace::WORKSPACE_LOCK.lock().await;
    let storage = store(&app, &state, api_version, &session_id).await?;
    match action {
        BackupAction::List {} => Ok(json!({"items":storage.list()?})),
        BackupAction::Capture {
            destination_id,
            name,
        } => {
            if !crate::protocol::valid_session_id(&destination_id)
                || name.trim().is_empty()
                || name.encode_utf16().count() > 160
            {
                return Err("invalid_input");
            }
            let backup = crate::destination_backup_transfer::capture(
                &session_id,
                state.environment(),
                &destination_id,
                name,
                |value| request(&app, &state, value),
            )
            .await?;
            store(&app, &state, api_version, &session_id)
                .await?
                .save_new(&backup)?;
            Ok(backup.summary())
        }
        BackupAction::Inspect { id } => {
            let value = storage.read(&id)?;
            Ok(
                json!({"summary":value.summary(),"configuration":value.draft(),"snapshot":value.configuration}),
            )
        }
        BackupAction::Delete { id } => {
            storage.delete(&id)?;
            Ok(json!({"deleted":true}))
        }
        BackupAction::Export { id } => {
            let value = storage.read(&id)?;
            let document = serde_json::to_vec(&value).map_err(|_| "backup_invalid")?;
            let saved = tauri::async_runtime::spawn_blocking(move || {
                let mut dialog = app
                    .dialog()
                    .file()
                    .set_title("Zustellpunkt-Sicherung exportieren")
                    .add_filter("Zustellpunkt-Sicherung", &["json"])
                    .set_file_name("zustellpunkt.json");
                if let Ok(directory) = app.path().download_dir() {
                    dialog = dialog.set_directory(directory);
                }
                let Some(file) = dialog.blocking_save_file() else {
                    return Ok(false);
                };
                crate::vault::write_protected(
                    &file.into_path().map_err(|_| "backup_unavailable")?,
                    &document,
                )?;
                Ok::<_, &'static str>(true)
            })
            .await
            .map_err(|_| "backup_unavailable")??;
            Ok(json!({"saved":saved}))
        }
        BackupAction::Import {} => {
            let dialog_app = app.clone();
            let file = tauri::async_runtime::spawn_blocking(move || {
                let Some(file) = dialog_app
                    .dialog()
                    .file()
                    .set_title("Zustellpunkt-Sicherung importieren")
                    .add_filter("Zustellpunkt-Sicherung", &["json"])
                    .blocking_pick_file()
                else {
                    return Ok(None);
                };
                crate::vault::read_bounded(
                    &file.into_path().map_err(|_| "backup_unavailable")?,
                    portable_archive::MAX_FILE,
                )
                .map(Some)
            })
            .await
            .map_err(|_| "backup_unavailable")??;
            let Some(file) = file else {
                return Ok(Value::Null);
            };
            let parsed = serde_json::from_slice::<Backup>(&file).map_err(|_| "backup_invalid");
            let mut backup = parsed?;
            backup.validate()?;
            if backup.environment != state.environment() {
                return Err("environment_mismatch");
            }
            backup.id = portable_archive::random_id()?;
            store(&app, &state, api_version, &session_id)
                .await?
                .save_new(&backup)?;
            Ok(backup.summary())
        }
    }
}
