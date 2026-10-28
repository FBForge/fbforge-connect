//! Content commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn begin_content(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    total_bytes: u32,
) -> Result<SessionResource, &'static str> {
    if total_bytes > 32 * 1024 * 1024 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"begin_content","totalBytes":total_bytes}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn append_content(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    content_id: String,
    byte_offset: u32,
    chunk: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&content_id)
        || byte_offset > 32 * 1024 * 1024
        || chunk.is_empty()
        || chunk.len() > 32768
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"append_content","contentId":content_id,"byteOffset":byte_offset,"chunk":chunk})).await
}

#[tauri::command]
pub(crate) async fn discard_content(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    content_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&content_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"discard_content","contentId":content_id}),
    )
    .await
}
