//! Renderer actions expose summaries and public drafts only, never private JWKs or archive paths.
use crate::{
    destination_backup_model::Backup,
    destination_backup_store::Store,
    engine::request,
    portable_archive, profiles,
    protocol::{ApiVersion, SessionResource},
    EngineState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
#[derive(Deserialize)]
#[serde(transparent)]
pub struct Password(String);
impl Drop for Password {
    fn drop(&mut self) {
        crate::vault::wipe_string(&mut self.0);
    }
}

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
        password: Password,
    },
    Import {
        password: Password,
    },
    UseKeys {
        id: String,
    },
    RestoreKeys {
        id: String,
    },
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
            profiles::checkpoint(&app, &state, api_version, &session_id).await?;
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
        BackupAction::Export { id, password } => {
            let value = storage.read(&id)?;
            let mut plain = serde_json::to_vec(&value).map_err(|_| "backup_invalid")?;
            let encrypted = portable_archive::encrypt(&plain, &password.0);
            plain.fill(0);
            drop(password);
            let encrypted = encrypted?;
            let saved = tauri::async_runtime::spawn_blocking(move || {
                let mut dialog = app
                    .dialog()
                    .file()
                    .set_title("Zustellpunkt-Sicherung exportieren")
                    .add_filter("Zustellpunkt-Sicherung", &["fcdestination"])
                    .set_file_name("zustellpunkt.fcdestination");
                if let Ok(directory) = app.path().download_dir() {
                    dialog = dialog.set_directory(directory);
                }
                let Some(file) = dialog.blocking_save_file() else {
                    return Ok(false);
                };
                crate::vault::write_protected(
                    &file.into_path().map_err(|_| "backup_unavailable")?,
                    &encrypted,
                )?;
                Ok::<_, &'static str>(true)
            })
            .await
            .map_err(|_| "backup_unavailable")??;
            Ok(json!({"saved":saved}))
        }
        BackupAction::Import { password } => {
            let dialog_app = app.clone();
            let file = tauri::async_runtime::spawn_blocking(move || {
                let Some(file) = dialog_app
                    .dialog()
                    .file()
                    .set_title("Zustellpunkt-Sicherung importieren")
                    .add_filter("Zustellpunkt-Sicherung", &["fcdestination"])
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
            let decrypted = portable_archive::decrypt(&file, &password.0);
            drop(password);
            let mut plain = decrypted?;
            let parsed = serde_json::from_slice::<Backup>(&plain).map_err(|_| "backup_invalid");
            plain.fill(0);
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
        BackupAction::UseKeys { id } => {
            let backup = storage.read(&id)?;
            let mut document = crate::destination_backup_transfer::bundle_document(&backup)?;
            let result = import_bundle(&app, &state, api_version, &session_id, &document).await;
            document.fill(0);
            result
        }
        BackupAction::RestoreKeys { id } => {
            let backup = storage.read(&id)?;
            if backup.keys.is_empty() {
                return Err("backup_keys_missing");
            }
            // Fresh owned read precedes every import. Existing registration policy validates each key.
            let own:SessionResource=request(&app,&state,json!({"command":"load_managed_destination","apiVersion":api_version,"sessionId":session_id,"destinationId":backup.source_destination_id})).await?;
            if !own.validate(api_version, &session_id)
                || own.environment != state.environment().name()
                || own.data["destinationId"] != backup.source_destination_id
            {
                return Err("engine_protocol_error");
            }
            let _ = crate::resource_action(
                &app,
                &state,
                api_version,
                &session_id,
                json!({"command":"load_destination","destinationId":backup.source_destination_id}),
            )
            .await?;
            for key in &backup.keys {
                crate::resource_action(&app,&state,api_version,&session_id,json!({"command":"import_key","destinationId":backup.source_destination_id,"purpose":key.purpose,"keyDocument":key.private_jwk})).await?;
            }
            Ok(json!({"restored":backup.keys.len(),"destinationId":backup.source_destination_id}))
        }
    }
}

async fn import_bundle(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
    document: &[u8],
) -> Result<Value, &'static str> {
    crate::destination_backup_transfer::import_bundle(
        session,
        state.environment(),
        document,
        |command| crate::resource_action(app, state, api, session, command),
    )
    .await
}
