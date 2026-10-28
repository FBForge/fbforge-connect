//! Replies commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn reply_target(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id) || offset > 64 || offset % 2 != 0 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"reply_target","proofId":proof_id,"offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn prepare_reply(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    reply_document: String,
) -> Result<SessionResource, &'static str> {
    if reply_document.len() > 24 * 1024 {
        return Err("invalid_submission");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"prepare_reply","replyDocument":reply_document}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn execute_reply(
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
        serde_json::json!({"command":"execute_reply","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_reply(
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
        serde_json::json!({"command":"cancel_reply","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn reply_state(
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
        serde_json::json!({"command":"reply_state"}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_reply_schema(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
    schema_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id) || schema_document.len() > 24 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"load_reply_schema","proofId":proof_id,"schemaDocument":schema_document})).await
}

#[tauri::command]
pub(crate) async fn read_reply_schema(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
    content_id: String,
    byte_offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id)
        || !valid_session_id(&content_id)
        || byte_offset > 24 * 1024 * 1024
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"read_reply_schema","proofId":proof_id,"contentId":content_id,"byteOffset":byte_offset})).await
}
