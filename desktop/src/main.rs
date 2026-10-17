#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod case_store;
mod cases;
mod profile_backup;
use cases::case_workspace;
mod profiles;
mod protocol;
mod vault;
use profile_backup::{export_profile_backup, import_profile_backup, import_profile_backup_file};
use profiles::{
    forget_profile, get_profile_defaults, list_profiles, open_saved_profile, profile_status,
    save_profile_defaults, save_profile_state, update_profile,
};
use protocol::{
    valid_session_id, ApiVersion, EngineFailure, EngineResponse, ProbeResult, SessionResource,
    SessionRole, SessionSnapshot, MAX_FRAME_BYTES,
};
use serde::de::DeserializeOwned;
use std::{
    path::PathBuf,
    process::Stdio,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::{Manager, State};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

struct EngineProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: ChildStdout,
}
#[derive(Default)]
struct EngineState {
    process: Mutex<Option<EngineProcess>>,
    sequence: AtomicU64,
    profiles: Mutex<profiles::Bindings>,
    case_profiles: Mutex<cases::Bindings>,
    case_errors: Mutex<std::collections::HashMap<String, &'static str>>,
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

impl EngineProcess {
    fn spawn(resources: PathBuf) -> Result<Self, &'static str> {
        // Never search PATH or accept a renderer-selected runtime/JAR.
        let directory = resources.join("resources/engine");
        let java = directory.join(if cfg!(windows) {
            "runtime/bin/java.exe"
        } else {
            "runtime/bin/java"
        });
        let java = java.canonicalize().map_err(|_| "engine_not_staged")?;
        let jar = directory
            .join("engine-host.jar")
            .canonicalize()
            .map_err(|_| "engine_not_staged")?;
        let mut command = Command::new(java);
        command
            .arg("-Xmx512m")
            .arg("-jar")
            .arg(jar)
            .current_dir(directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        // These inherited settings can inject agents, JVM arguments or another module path.
        for key in [
            "JAVA_TOOL_OPTIONS",
            "_JAVA_OPTIONS",
            "JDK_JAVA_OPTIONS",
            "CLASSPATH",
            "JAVA_HOME",
            "JDK_HOME",
        ] {
            command.env_remove(key);
        }
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|_| "engine_start_failed")?;
        let stdin = child.stdin.take().ok_or("engine_start_failed")?;
        let stdout = child.stdout.take().ok_or("engine_start_failed")?;
        Ok(Self {
            child,
            stdin: Some(stdin),
            stdout,
        })
    }

    async fn exchange<T: DeserializeOwned>(
        &mut self,
        id: &str,
        request: &mut [u8],
    ) -> Result<T, EngineFailure> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or(EngineFailure::Fatal("engine_disconnected"))?;
        stdin
            .write_u32(request.len() as u32)
            .await
            .map_err(|_| EngineFailure::Fatal("engine_disconnected"))?;
        stdin
            .write_all(request)
            .await
            .map_err(|_| EngineFailure::Fatal("engine_disconnected"))?;
        stdin
            .flush()
            .await
            .map_err(|_| EngineFailure::Fatal("engine_disconnected"))?;
        request.fill(0); // Best effort only, not a guarantee of erasing every prior serialized copy.
        let length =
            self.stdout
                .read_u32()
                .await
                .map_err(|_| EngineFailure::Fatal("engine_disconnected"))? as usize;
        if length == 0 || length > MAX_FRAME_BYTES {
            return Err(EngineFailure::Fatal("engine_protocol_error"));
        }
        let mut body = vec![0; length];
        self.stdout
            .read_exact(&mut body)
            .await
            .map_err(|_| EngineFailure::Fatal("engine_disconnected"))?;
        let response = serde_json::from_slice::<EngineResponse<T>>(&body)
            .map_err(|_| EngineFailure::Fatal("engine_protocol_error"));
        body.fill(0);
        response?.payload(id)
    }

    async fn shutdown(mut self) -> Result<(), &'static str> {
        drop(self.stdin.take()); // EOF lets Java close session-owned files before exiting.
        match tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await {
            Ok(Ok(status)) if status.success() => Ok(()),
            _ => Err("engine_shutdown_failed"), // Drop still kills a child that cannot exit normally.
        }
    }
}

async fn request<T: DeserializeOwned>(
    app: &tauri::AppHandle,
    state: &EngineState,
    mut command: serde_json::Value,
) -> Result<T, &'static str> {
    let mut guard = state.process.try_lock().map_err(|_| "engine_busy")?;
    if guard.is_none() {
        let resources = app.path().resource_dir().map_err(|_| "engine_not_staged")?;
        *guard = Some(EngineProcess::spawn(resources)?);
    }
    let id = format!("op-{}", state.sequence.fetch_add(1, Ordering::Relaxed));
    let timeout_seconds = match command.get("command").and_then(serde_json::Value::as_str) {
        Some(
            "prepare_destination_cleanup"
            | "execute_destination_cleanup"
            | "generate_test_keys"
            | "prepare_destination_rotation"
            | "execute_destination_rotation"
            | "execute_destination_creation"
            | "load_send_schema"
            | "execute_send"
            | "execute_reply"
            | "verify_submission"
            | "verify_reply"
            | "prepare_receipt"
            | "execute_receipt"
            | "execute_reply_receipt"
            | "load_event_log"
            | "load_reply_event_log"
            | "load_case_event_log"
            | "prepare_destination_update"
            | "execute_destination_update",
        ) => 240,
        _ => 25,
    };
    command["protocolVersion"] = 1.into();
    command["id"] = id.clone().into();
    let mut bytes = serde_json::to_vec(&command).map_err(|_| "engine_protocol_error")?;
    drop(command);
    if bytes.len() > MAX_FRAME_BYTES {
        bytes.fill(0);
        return Err("invalid_input");
    }
    let result = tokio::time::timeout(
        Duration::from_secs(timeout_seconds),
        guard.as_mut().unwrap().exchange::<T>(&id, &mut bytes),
    )
    .await;
    bytes.fill(0);
    match result {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(EngineFailure::Remote(code))) => Err(code),
        Ok(Err(EngineFailure::Fatal(code))) => {
            *guard = None;
            Err(code)
        }
        Err(_) => {
            *guard = None;
            Err("engine_timeout")
        }
    }
}

#[tauri::command]
async fn probe_engine(
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
async fn open_session(
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
async fn check_session(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionSnapshot, &'static str> {
    session_action(&app, &state, api_version, &session_id, true).await
}

#[tauri::command]
async fn close_session(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionSnapshot, &'static str> {
    session_action(&app, &state, api_version, &session_id, false).await
}

async fn session_action(
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

async fn resource_action(
    app: &tauri::AppHandle,
    state: &EngineState,
    version: ApiVersion,
    id: &str,
    mut command: serde_json::Value,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(id) {
        return Err("session_missing");
    }
    command["apiVersion"] = serde_json::to_value(version).map_err(|_| "invalid_input")?;
    command["sessionId"] = id.into();
    let operation = command["command"].as_str().unwrap_or("").to_string();
    if matches!(
        operation.as_str(),
        "generate_test_keys" | "prepare_destination_rotation" | "execute_destination_rotation"
    ) {
        profiles::require_profile(state, version, id).await?;
    }
    if operation == "prepare_destination_creation" {
        let document: serde_json::Value = serde_json::from_str(
            command["destinationDocument"]
                .as_str()
                .ok_or("invalid_input")?,
        )
        .map_err(|_| "invalid_input")?;
        // The Java boundary accepts type C only without any key bundle or registered key material.
        if document["configuration"]["type"] != "C" {
            profiles::require_profile(state, version, id).await?;
        }
    }
    if matches!(
        operation.as_str(),
        "execute_destination_creation" | "execute_destination_rotation"
    ) {
        let mut mark = command.clone();
        mark["command"] = if operation == "execute_destination_creation" {
            "mark_destination_creation_dispatch"
        } else {
            "mark_destination_rotation_dispatch"
        }
        .into();
        let intent: SessionResource = request(app, state, mark).await?;
        if !intent.validate(version, id)
            || intent.data.get("attemptId") != command.get("attemptId")
            || !matches!(
                intent.data.get("status").and_then(|v| v.as_str()),
                Some("prepared" | "expired")
            )
        {
            return Err("engine_protocol_error");
        }
        if operation == "execute_destination_creation" {
            if intent.data["bundleId"].is_null() {
                let document: serde_json::Value = serde_json::from_str(
                    intent.data["configurationJson"]
                        .as_str()
                        .ok_or("engine_protocol_error")?,
                )
                .map_err(|_| "engine_protocol_error")?;
                if document["type"] != "C"
                    || ["encryptionKid", "encryptionPublicKey", "signingPublicKey"]
                        .iter()
                        .any(|key| document.get(key).is_some())
                {
                    return Err("engine_protocol_error");
                }
            } else {
                profiles::require_profile(state, version, id).await?;
            }
        }
        profiles::checkpoint(app, state, version, id).await?;
        if intent.data["status"] == "expired" {
            return Ok(intent);
        }
    }
    if matches!(
        operation.as_str(),
        "execute_receipt" | "execute_reply_receipt"
    ) {
        cases::checkpoint(app, state, version, id)
            .await
            .map_err(|_| "case_storage_pending")?;
    }
    let value: SessionResource = request(app, state, command).await?;
    if !value.validate(version, id) {
        *state.process.lock().await = None;
        return Err("engine_protocol_error");
    }
    if matches!(
        operation.as_str(),
        "verify_submission"
            | "verify_reply"
            | "execute_send"
            | "execute_reply"
            | "execute_receipt"
            | "execute_reply_receipt"
    ) {
        // A local failure must never turn a completed remote write into an implicit resend.
        let failure = cases::checkpoint(app, state, version, id).await.err();
        let mut errors = state.case_errors.lock().await;
        if let Some(code) = failure {
            errors.insert(id.to_owned(), code);
        } else {
            errors.remove(id);
        }
    }
    if matches!(
        operation.as_str(),
        "verify_reply"
            | "prepare_send"
            | "execute_send"
            | "cancel_send"
            | "import_key"
            | "discard_keys"
            | "remove_key_inventory_item"
            | "execute_destination_cleanup"
            | "generate_test_keys"
            | "prepare_destination_creation"
            | "execute_destination_creation"
            | "cancel_destination_creation"
            | "reconcile_destination_creation"
            | "use_generated_keys"
            | "prepare_destination_rotation"
            | "execute_destination_rotation"
            | "cancel_destination_rotation"
    ) {
        if let Err(code) = profiles::checkpoint(app, state, version, id).await {
            if matches!(
                operation.as_str(),
                "generate_test_keys" | "remove_key_inventory_item"
            ) {
                return Err(code);
            }
            if matches!(
                operation.as_str(),
                "prepare_destination_creation" | "prepare_destination_rotation"
            ) {
                if let Some(attempt) = value.data.get("attemptId").and_then(|v| v.as_str()) {
                    let cancel = if operation == "prepare_destination_creation" {
                        "cancel_destination_creation"
                    } else {
                        "cancel_destination_rotation"
                    };
                    let _: Result<SessionResource,_> = request(app, state, serde_json::json!({"command":cancel,"apiVersion":version,"sessionId":id,"attemptId":attempt})).await;
                }
                return Err(code);
            }
            if operation == "prepare_send" {
                // A reply key must be durable before its offer can be dispatched.
                if let Some(attempt) = value
                    .data
                    .get("attempt")
                    .and_then(|v| v.get("attemptId"))
                    .and_then(|v| v.as_str())
                {
                    let _: Result<SessionResource,_> = request(app, state, serde_json::json!({"command":"cancel_send","apiVersion":version,"sessionId":id,"attemptId":attempt})).await;
                }
                return Err(code);
            }
            // Preserve the actual send outcome; profile_status reports a failed checkpoint separately.
        }
    }
    Ok(value)
}

#[tauri::command]
async fn list_destinations(
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
async fn load_managed_destination(
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
async fn prepare_destination_update(
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
async fn execute_destination_update(
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
async fn cancel_destination_update(
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
async fn destination_update_state(
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
async fn load_destination(
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
async fn import_key(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
    purpose: String,
    key_document: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&destination_id)
        || !matches!(purpose.as_str(), "decrypt" | "sign" | "auto")
        || key_document.is_empty()
        || key_document.len() > 32768
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"import_key","destinationId":destination_id,"purpose":purpose,"keyDocument":key_document})).await
}

#[tauri::command]
async fn load_send_destination(
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
async fn load_send_schema(
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
async fn read_send_schema(
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
async fn loaded_keys(
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
        serde_json::json!({"command":"loaded_keys"}),
    )
    .await
}

#[tauri::command]
async fn discard_keys(
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
        serde_json::json!({"command":"discard_keys"}),
    )
    .await
}

#[tauri::command]
async fn begin_content(
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
async fn prepare_send(
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
async fn reply_target(
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
async fn prepare_reply(
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
async fn execute_reply(
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
async fn cancel_reply(
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
async fn reply_state(
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
async fn prepare_receipt(
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
async fn execute_receipt(
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
async fn cancel_receipt(
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
async fn receipt_state(
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

#[tauri::command]
async fn list_submissions(
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
async fn list_reply_channels(
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
async fn list_replies(
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
async fn load_submission(
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
async fn verify_submission(
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
async fn list_received_contents(
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
async fn read_received_content(
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
async fn search_process_destinations(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    resource_action(&app, &state, api_version, &session_id, serde_json::json!({"command":"search_process_destinations","destinationDocument":destination_document})).await
}
#[tauri::command]
async fn prepare_destination_cleanup(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"prepare_destination_cleanup","destinationId":destination_id}),
    )
    .await
}
#[tauri::command]
async fn execute_destination_cleanup(
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
        serde_json::json!({"command":"execute_destination_cleanup","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn cancel_destination_cleanup(
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
        serde_json::json!({"command":"cancel_destination_cleanup","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn destination_cleanup_state(
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
        serde_json::json!({"command":"destination_cleanup_state"}),
    )
    .await
}
#[tauri::command]
async fn prepare_destination_rotation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    resource_action(&app, &state, api_version, &session_id, serde_json::json!({"command":"prepare_destination_rotation","destinationDocument":destination_document})).await
}
#[tauri::command]
async fn execute_destination_rotation(
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
async fn cancel_destination_rotation(
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
async fn destination_rotation_state(
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
#[tauri::command]
async fn generate_test_keys(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"generate_test_keys"}),
    )
    .await
}
#[tauri::command]
async fn list_key_inventory(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    offset: usize,
) -> Result<SessionResource, &'static str> {
    if offset > 120 || offset % 20 != 0 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_key_inventory","offset":offset}),
    )
    .await
}
#[tauri::command]
async fn remove_key_inventory_item(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    item_id: String,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&item_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"remove_key_inventory_item","itemId":item_id}),
    )
    .await
}
#[tauri::command]
async fn list_generated_keys(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"list_generated_keys"}),
    )
    .await
}
#[tauri::command]
async fn destination_creation_state(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"destination_creation_state"}),
    )
    .await
}
#[tauri::command]
async fn prepare_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    destination_document: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || destination_document.len() > 24000 {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"prepare_destination_creation","destinationDocument":destination_document})).await
}
#[tauri::command]
async fn execute_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"execute_destination_creation","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn cancel_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    attempt_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3 || !valid_session_id(&attempt_id) {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"cancel_destination_creation","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn reconcile_destination_creation(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    bundle_id: Option<String>,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3
        || bundle_id
            .as_ref()
            .is_some_and(|value| !valid_session_id(value))
        || !valid_session_id(&destination_id)
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"reconcile_destination_creation","bundleId":bundle_id,"destinationId":destination_id})).await
}
#[tauri::command]
async fn use_generated_keys(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    bundle_id: String,
    destination_id: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3
        || !valid_session_id(&bundle_id)
        || !valid_session_id(&destination_id)
    {
        return Err("invalid_input");
    }
    resource_action(&app, &state, api_version, &session_id,
        serde_json::json!({"command":"use_generated_keys","bundleId":bundle_id,"destinationId":destination_id})).await
}
#[tauri::command]
async fn prepare_reply_receipt(
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
        serde_json::json!({"command":"prepare_reply_receipt","receiptDocument":receipt_document}),
    )
    .await
}
#[tauri::command]
async fn execute_reply_receipt(
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
        serde_json::json!({"command":"execute_reply_receipt","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn cancel_reply_receipt(
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
        serde_json::json!({"command":"cancel_reply_receipt","attemptId":attempt_id}),
    )
    .await
}
#[tauri::command]
async fn reply_receipt_state(
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
        serde_json::json!({"command":"reply_receipt_state"}),
    )
    .await
}
#[tauri::command]
async fn load_case_event_log(
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
async fn list_case_event_log(
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
async fn load_reply_event_log(
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
async fn load_reply_schema(
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
async fn read_reply_schema(
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
#[tauri::command]
async fn read_received_schema(
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
async fn read_received_reply_schema(
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
async fn discard_received(
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

#[tauri::command]
async fn verify_reply(
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
async fn list_received_reply_contents(
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
async fn read_received_reply_content(
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
async fn discard_received_reply(
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

#[tauri::command]
async fn load_event_log(
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
async fn list_event_log(
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
async fn read_event_log(
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
async fn discard_event_log(
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

#[tauri::command]
async fn execute_send(
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
async fn cancel_send(
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
async fn send_state(
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

#[tauri::command]
async fn append_content(
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
async fn discard_content(
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![
            case_workspace,
            update_profile,
            export_profile_backup,
            import_profile_backup,
            import_profile_backup_file,
            search_process_destinations,
            prepare_destination_cleanup,
            execute_destination_cleanup,
            cancel_destination_cleanup,
            destination_cleanup_state,
            prepare_destination_rotation,
            execute_destination_rotation,
            cancel_destination_rotation,
            destination_rotation_state,
            generate_test_keys,
            list_generated_keys,
            list_key_inventory,
            remove_key_inventory_item,
            prepare_destination_creation,
            execute_destination_creation,
            cancel_destination_creation,
            destination_creation_state,
            reconcile_destination_creation,
            use_generated_keys,
            list_profiles,
            get_profile_defaults,
            save_profile_defaults,
            forget_profile,
            open_saved_profile,
            profile_status,
            save_profile_state,
            load_managed_destination,
            prepare_destination_update,
            execute_destination_update,
            cancel_destination_update,
            destination_update_state,
            probe_engine,
            open_session,
            check_session,
            close_session,
            load_send_destination,
            load_send_schema,
            read_send_schema,
            load_reply_schema,
            read_reply_schema,
            load_reply_event_log,
            load_case_event_log,
            list_case_event_log,
            prepare_reply_receipt,
            execute_reply_receipt,
            cancel_reply_receipt,
            reply_receipt_state,
            read_received_schema,
            read_received_reply_schema,
            list_destinations,
            load_destination,
            import_key,
            loaded_keys,
            discard_keys,
            begin_content,
            append_content,
            discard_content,
            prepare_send,
            execute_send,
            cancel_send,
            send_state,
            reply_target,
            prepare_reply,
            execute_reply,
            cancel_reply,
            reply_state,
            list_submissions,
            load_submission,
            verify_submission,
            list_received_contents,
            read_received_content,
            discard_received,
            verify_reply,
            list_received_reply_contents,
            read_received_reply_content,
            discard_received_reply,
            prepare_receipt,
            execute_receipt,
            cancel_receipt,
            receipt_state,
            load_event_log,
            list_event_log,
            read_event_log,
            discard_event_log,
            list_replies,
            list_reply_channels
        ])
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_, url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
                            && url.port() == Some(1420))
                })
                .build(),
        )
        .build(tauri::generate_context!())
        .expect("Desktop startup failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app.state::<EngineState>();
            tauri::async_runtime::block_on(async {
                if let Ok(mut process) =
                    tokio::time::timeout(Duration::from_secs(2), state.process.lock()).await
                {
                    if let Some(child) = process.take() {
                        let _ = child.shutdown().await;
                    }
                }
            });
        }
    });
}

#[cfg(test)]
mod process_tests {
    use super::*;

    #[test]
    fn packaged_engine_finishes_cleanly_when_native_shutdown_closes_its_input() {
        tauri::async_runtime::block_on(async {
            let mut process = EngineProcess::spawn(PathBuf::from(env!("CARGO_MANIFEST_DIR")))
                .expect("Stage the engine before native tests");
            let mut request = serde_json::to_vec(&serde_json::json!({
                "protocolVersion":1,"id":"shutdown-test","command":"probe","apiVersion":"v3"
            }))
            .unwrap();
            let response: ProbeResult = process
                .exchange("shutdown-test", &mut request)
                .await
                .unwrap_or_else(|_| panic!("Packaged SDK probe failed"));
            assert!(response.validate(ApiVersion::V3));
            assert!(
                process.shutdown().await.is_ok(),
                "Normal EOF must let Java close its resources and exit successfully"
            );
        });
    }
}
