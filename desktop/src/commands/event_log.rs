//! Event log commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn load_case_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    case_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&case_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"load_case_event_log","caseId":case_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn list_case_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    log_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&log_id) || offset > 1000 || offset % 5 != 0 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_case_event_log","logId":log_id,"offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_reply_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    case_id: String,
    reply_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&case_id) || !valid_session_id(&reply_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"load_reply_event_log","caseId":case_id,"replyId":reply_id}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn load_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    case_id: String,
    submission_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id)
        || !valid_session_id(&case_id)
        || !valid_session_id(&submission_id)
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"load_event_log","destinationId":destination_id,"caseId":case_id,"submissionId":submission_id})).await
}

#[tauri::command]
pub(crate) async fn list_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    log_id: String,
    offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&log_id) || offset > 1000 || offset % 5 != 0 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_event_log","logId":log_id,"offset":offset}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn read_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    log_id: String,
    event_id: String,
    part: String,
    byte_offset: u32,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&log_id)
        || !valid_session_id(&event_id)
        || !matches!(part.as_str(), "header" | "claims")
        || byte_offset > 65536
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"read_event_log","logId":log_id,"eventId":event_id,"part":part,"byteOffset":byte_offset})).await
}

#[tauri::command]
pub(crate) async fn discard_event_log(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    log_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&log_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"discard_event_log","logId":log_id}),
    )
    .await
}
