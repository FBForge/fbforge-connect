//! Destination rotation commands. All resource calls pass through the central policy.
use crate::protocol::{ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn prepare_destination_rotation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    resource_action(&app, &state, api_version, &session_id, serde_json::json!({"command":"prepare_destination_rotation","destinationDocument":destination_document})).await
}

#[tauri::command]
pub(crate) async fn execute_destination_rotation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"execute_destination_rotation","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_destination_rotation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"cancel_destination_rotation","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn destination_rotation_state(
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
        serde_json::json!({"command":"destination_rotation_state"}),
    )
    .await
}
