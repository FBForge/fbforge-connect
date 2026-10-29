use crate::{
    profile_workspace_store::{Template, WorkspaceStore},
    profiles,
    protocol::{valid_session_id, ApiVersion},
    EngineState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Manager, State};
use tokio::sync::Mutex;
pub(crate) static WORKSPACE_LOCK: Mutex<()> = Mutex::const_new(());
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum WorkspaceRequest {
    Read {},
    SaveTemplate { template: Template },
    DeleteTemplate { id: String },
    Remember { id: String, favorite: Option<bool> },
    ClearHistory {},
}
pub async fn store(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<Option<WorkspaceStore>, &'static str> {
    if !valid_session_id(session) {
        return Err("invalid_input");
    }
    let bindings = state.profiles.lock().await;
    let Some(binding) = bindings.get(session) else {
        return Ok(None);
    };
    if binding.api != api || binding.error.is_some() {
        return Err("vault_pending");
    }
    let profile = profiles::vault(app)?.load(&binding.profile_id)?;
    if profile.environment != state.environment() || profile.api_version != api {
        return Err("environment_mismatch");
    }
    WorkspaceStore::new(
        &app.path()
            .app_data_dir()
            .map_err(|_| "vault_unavailable")?
            .join("profile-workspaces"),
        &binding.profile_id,
        state.environment(),
        api,
    )
    .map(Some)
}
#[tauri::command]
pub async fn profile_workspace(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    request: WorkspaceRequest,
) -> Result<Value, &'static str> {
    let _guard = WORKSPACE_LOCK.lock().await;
    let Some(store) = store(&app, &state, api_version, &session_id).await? else {
        return Ok(Value::Null);
    };
    let mut data = store.read()?;
    match request {
        WorkspaceRequest::Read {} => {
            return serde_json::to_value(data).map_err(|_| "vault_invalid")
        }
        WorkspaceRequest::SaveTemplate { template } => {
            data.templates.retain(|t| t.id != template.id);
            data.templates.push(template);
        }
        WorkspaceRequest::DeleteTemplate { id } => data.templates.retain(|t| t.id != id),
        WorkspaceRequest::Remember { id, favorite } => data.remember(id, favorite)?,
        WorkspaceRequest::ClearHistory {} => data.history.clear(),
    }
    store.save(&data)?;
    serde_json::to_value(data).map_err(|_| "vault_invalid")
}
// Only native, validated engine results can enter the journal; no renderer append command exists.
pub async fn journal(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
    value: &Value,
) -> Result<(), &'static str> {
    let _guard = WORKSPACE_LOCK.lock().await;
    let Some(store) = store(app, state, api, session).await? else {
        return Ok(());
    };
    let mut data = store.read()?;
    data.journal(value.clone())?;
    store.save(&data)
}
pub async fn mark_running(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
    attempt: &str,
) -> Result<(), &'static str> {
    let _guard = WORKSPACE_LOCK.lock().await;
    let Some(store) = store(app, state, api, session).await? else {
        return Ok(());
    };
    let mut data = store.read()?;
    let Some(entry) = data
        .history
        .iter_mut()
        .find(|row| row["snapshot"]["attemptId"] == attempt)
    else {
        return Err("vault_pending");
    };
    entry["snapshot"]["status"] = json!("uncertain");
    store.save(&data)
}
