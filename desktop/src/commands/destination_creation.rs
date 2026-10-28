//! Destination creation commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn destination_creation_state(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"destination_creation_state"}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn prepare_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || destination_document.len() > 24000 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"prepare_destination_creation","destinationDocument":destination_document})).await
}

#[tauri::command]
pub(crate) async fn execute_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"execute_destination_creation","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"cancel_destination_creation","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn reconcile_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    bundle_id: Option<String>,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3
        || bundle_id
            .as_ref()
            .is_some_and(|value| !valid_session_id(value))
        || !valid_session_id(&destination_id)
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"reconcile_destination_creation","bundleId":bundle_id,"destinationId":destination_id})).await
}
