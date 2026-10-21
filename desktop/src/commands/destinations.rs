//! Destinations commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn list_destinations(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if offset > 10000 || offset % 20 != 0 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_destinations","offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_managed_destination(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"load_managed_destination","destinationId":destination_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn prepare_destination_update(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    if destination_document.is_empty() || destination_document.len() > 24 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"prepare_destination_update","destinationDocument":destination_document})).await
}

#[tauri::command]
pub(crate) async fn execute_destination_update(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"execute_destination_update","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_destination_update(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"cancel_destination_update","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn destination_update_state(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionResource, &'static str> {
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"destination_update_state"}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_destination(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"load_destination","destinationId":destination_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn search_process_destinations(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    resource_action(&app, &state, api_version, &session_id, serde_json::json!({"command":"search_process_destinations","destinationDocument":destination_document})).await
}
