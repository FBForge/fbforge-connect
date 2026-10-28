//! Sessions commands. All resource calls pass through the central policy.
use crate::profiles;
use crate::protocol::{valid_session_id, ApiVersion, ProbeResult, SessionRole, SessionSnapshot};
use crate::request;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn probe_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
) -> Result<ProbeResult, &'static str> {
    let value: ProbeResult = request(
        &app,
        &state,
        serde_json::json!({"command":"probe", "apiVersion":api_version}),
    )
    .await?;
    if !value.validate(api_version) {
        *state.process.lock().await = None;
        return Err("engine_protocol_error");
    }
    Ok(value)
}

#[tauri::command]
pub(crate) async fn open_session(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    role: SessionRole,
    client_id: String,
    client_secret: String,
    profile_id: Option<String>,
    profile_name: Option<String>,
) -> Result<SessionSnapshot, &'static str> {
    if client_id.trim().is_empty()
        || client_id.len() > 512
        || client_secret.trim().is_empty()
        || client_secret.len() > 8192
    {
        return Err("invalid_credentials");
    }
    if profile_id.is_some() != profile_name.is_some()
        || profile_id.as_ref().is_some_and(|id| !valid_session_id(id))
    {
        return Err("invalid_input");
    }
    if profile_id.is_some() && !cfg!(windows) {
        return Err("vault_unsupported");
    }
    if profile_name.as_ref().is_some_and(|name| {
        name.trim().is_empty() || name.len() > 120 || name.chars().any(char::is_control)
    }) {
        return Err("invalid_input");
    }
    profiles::before_open(&app, &state, api_version, role)
        .await
        .map_err(|_| "vault_pending")?;
    let value: SessionSnapshot = request(
        &app,
        &state,
        serde_json::json!({"command":"open_session",
        "apiVersion":api_version, "role":role, "clientId":client_id, "clientSecret":client_secret}),
    )
    .await?;
    if !value.validate(api_version, Some(role), None, true) {
        *state.process.lock().await = None;
        return Err("engine_protocol_error");
    }
    profiles::opened(&state, api_version, role).await;
    if let (Some(id), Some(name)) = (profile_id, profile_name) {
        if let Err(code) =
            profiles::save_opened(&app, &state, &value, id, name, client_id, client_secret).await
        {
            let _: Result<SessionSnapshot, _> = request(&app, &state, serde_json::json!({"command":"close_session", "apiVersion":api_version,"sessionId":value.session_id})).await;
            return Err(code);
        }
    }
    Ok(value)
}

#[tauri::command]
pub(crate) async fn check_session(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionSnapshot, &'static str> {
    session_action(&app, &state, api_version, &session_id, true).await
}

/// Reuse an active native login without exposing its secret to the renderer.
#[tauri::command]
pub(crate) async fn open_session_for_api(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    target_api_version: ApiVersion,
) -> Result<SessionSnapshot, &'static str> {
    if api_version == target_api_version || !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    let source = session_action(&app, &state, api_version, &session_id, true).await?;
    profiles::before_open(&app, &state, target_api_version, source.role)
        .await
        .map_err(|_| "vault_pending")?;
    let target: SessionSnapshot = request(
        &app,
        &state,
        serde_json::json!({"command":"open_session_for_api", "apiVersion":api_version,
            "sessionId":session_id, "targetApiVersion":target_api_version}),
    )
    .await?;
    if !target.validate(target_api_version, Some(source.role), None, true)
        || target.environment != source.environment
        || target.session_id == source.session_id
    {
        *state.process.lock().await = None;
        return Err("engine_protocol_error");
    }
    profiles::opened(&state, target_api_version, source.role).await;
    Ok(target)
}

#[tauri::command]
pub(crate) async fn close_session(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionSnapshot, &'static str> {
    session_action(&app, &state, api_version, &session_id, false).await
}

pub(crate) async fn session_action(
    app: &tauri::AppHandle,
    state: &EngineState,
    version: ApiVersion,
    id: &str,
    connected: bool,
) -> Result<SessionSnapshot, &'static str> {
    if !valid_session_id(id) {
        return Err("session_missing");
    }
    if !connected {
        profiles::checkpoint(app, state, version, id).await?;
    }
    let command = if connected {
        "check_session"
    } else {
        "close_session"
    };
    let value: SessionSnapshot = request(
        app,
        state,
        serde_json::json!({"command":command,"apiVersion":version,"sessionId":id}),
    )
    .await?;
    if !value.validate(version, None, Some(id), connected) {
        *state.process.lock().await = None;
        return Err("engine_protocol_error");
    }
    if !connected {
        state.profiles.lock().await.remove(id);
        state.case_profiles.lock().await.remove(id);
    }
    Ok(value)
}
