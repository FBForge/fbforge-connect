//! Receipts commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn prepare_receipt(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    receipt_document: String,
) -> Result<SessionResource, &'static str> {
    if receipt_document.len() > 16384 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"prepare_receipt","receiptDocument":receipt_document}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn execute_receipt(
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
        serde_json::json!({"command":"execute_receipt","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn cancel_receipt(
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
        serde_json::json!({"command":"cancel_receipt","attemptId":attempt_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn receipt_state(
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
        serde_json::json!({"command":"receipt_state"}),
    )
    .await
}
