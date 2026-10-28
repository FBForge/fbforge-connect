//! Reply receive commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn list_reply_channels(
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
        serde_json::json!({"command":"list_reply_channels"}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn list_replies(
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
        serde_json::json!({"command":"list_replies","offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn read_received_reply_schema(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
    byte_offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id) || byte_offset > 24 * 1024 * 1024 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"read_received_reply_schema","proofId":proof_id,"byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn verify_reply(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    case_id: String,
    reply_id: String,
    schema_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&case_id)
        || !valid_session_id(&reply_id)
        || schema_document.len() > 24 * 1024
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"verify_reply","caseId":case_id,"replyId":reply_id,"schemaDocument":schema_document})).await
}

#[tauri::command]
pub(crate) async fn list_received_reply_contents(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id) || offset > 40 || offset % 2 != 0 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"list_received_reply_contents","proofId":proof_id,"offset":offset})).await
}

#[tauri::command]
pub(crate) async fn read_received_reply_content(
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
        || byte_offset > 32 * 1024 * 1024
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"read_received_reply_content","proofId":proof_id,"contentId":content_id,"byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn discard_received_reply(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    proof_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&proof_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"discard_received_reply","proofId":proof_id}),
    )
    .await
}
