//! Send commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn load_send_destination(
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
        serde_json::json!({"command":"load_send_destination", "destinationId":destination_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_send_schema(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    schema_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) || schema_document.len() > 24 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"load_send_schema", "destinationId":destination_id, "schemaDocument":schema_document})).await
}

#[tauri::command]
pub(crate) async fn validate_send_data(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    schema_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) || schema_document.len() > 24 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"validate_send_data", "destinationId":destination_id, "schemaDocument":schema_document})).await
}

#[tauri::command]
pub(crate) async fn read_send_schema(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    content_id: String,
    byte_offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&content_id) || byte_offset > 24 * 1024 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"read_send_schema", "contentId":content_id, "byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn prepare_send(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    send_document: String,
) -> Result<SessionResource, &'static str> {
    if send_document.len() > 24 * 1024 {
        return Err("invalid_submission");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"prepare_send","sendDocument":send_document}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn execute_send(
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
        serde_json::json!({"command":"execute_send","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_send(
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
        serde_json::json!({"command":"cancel_send","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn send_state(
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
        serde_json::json!({"command":"send_state"}),
    )
    .await
}
