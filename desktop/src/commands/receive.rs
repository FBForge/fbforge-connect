//! Receive commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn list_submissions(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) || offset > 10000 || offset % 20 != 0 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"list_submissions","destinationId":destination_id,"offset":offset})).await
}

#[tauri::command]
pub(crate) async fn load_submission(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    submission_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id) || !valid_session_id(&submission_id) {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"load_submission","destinationId":destination_id,"submissionId":submission_id})).await
}

#[tauri::command]
pub(crate) async fn verify_submission(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    submission_id: String,
    schema_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id)
        || !valid_session_id(&submission_id)
        || schema_document.len() > 24 * 1024
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"verify_submission","destinationId":destination_id,"submissionId":submission_id,"schemaDocument":schema_document})).await
}

#[tauri::command]
pub(crate) async fn list_received_contents(
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
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_received_contents","proofId":proof_id,"offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn read_received_content(
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
        serde_json::json!({"command":"read_received_content","proofId":proof_id,"contentId":content_id,"byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn read_received_schema(
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
        serde_json::json!({"command":"read_received_schema","proofId":proof_id,"byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn discard_received(
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
        serde_json::json!({"command":"discard_received","proofId":proof_id}),
    )
    .await
}
