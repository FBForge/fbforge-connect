//! Packaged engine process, bounded frames and timeout handling.
use crate::environments::{response_environment, Environment};
use crate::protocol::{EngineFailure, EngineResponse, MAX_FRAME_BYTES};
use crate::{cases, profiles};
use serde::de::DeserializeOwned;
use std::{
    path::PathBuf,
    process::Stdio,
    sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
    time::Duration,
};
use tauri::Manager;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};
pub(crate) struct EngineProcess {
    child: Child,
    environment: Environment,
    stdin: Option<ChildStdin>,
    stdout: ChildStdout,
}
#[derive(Default)]
pub(crate) struct EngineState {
    pub(crate) updating: AtomicBool,
    pub(crate) process: Mutex<Option<EngineProcess>>,
    pub(crate) sequence: AtomicU64,
    pub(crate) selected_environment: AtomicU8,
    pub(crate) profiles: Mutex<profiles::Bindings>,
    pub(crate) case_profiles: Mutex<cases::Bindings>,
    pub(crate) case_errors: Mutex<std::collections::HashMap<String, &'static str>>,
}

impl EngineState {
    pub(crate) async fn forget_closed_sessions(&self) {
        self.profiles.lock().await.clear();
        self.case_profiles.lock().await.clear();
        self.case_errors.lock().await.clear();
    }

    pub(crate) fn environment(&self) -> Environment {
        Environment::from_code(self.selected_environment.load(Ordering::Acquire))
    }
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

impl EngineProcess {
    fn spawn(resources: PathBuf, environment: Environment) -> Result<Self, &'static str> {
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
            .arg(format!("-Dfbforge.environment={}", environment.name()))
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
            environment,
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
        let parsed = serde_json::from_slice::<serde_json::Value>(&body)
            .map_err(|_| EngineFailure::Fatal("engine_protocol_error"))?;
        if parsed["ok"] == true && !response_environment(&parsed["result"], self.environment) {
            body.fill(0);
            return Err(EngineFailure::Fatal("engine_protocol_error"));
        }
        let response = serde_json::from_value::<EngineResponse<T>>(parsed)
            .map_err(|_| EngineFailure::Fatal("engine_protocol_error"));
        body.fill(0);
        response?.payload(id)
    }

    pub(crate) async fn shutdown(mut self) -> Result<(), &'static str> {
        drop(self.stdin.take()); // EOF lets Java close session-owned files before exiting.
        match tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await {
            Ok(Ok(status)) if status.success() => Ok(()),
            _ => Err("engine_shutdown_failed"), // Drop still kills a child that cannot exit normally.
        }
    }
}

pub(crate) async fn request<T: DeserializeOwned>(
    app: &tauri::AppHandle,
    state: &EngineState,
    mut command: serde_json::Value,
) -> Result<T, &'static str> {
    let mut guard = state.process.try_lock().map_err(|_| "engine_busy")?;
    if state.updating.load(Ordering::Acquire) {
        return Err("update_activity_pending");
    }
    if guard.is_none() {
        let resources = app.path().resource_dir().map_err(|_| "engine_not_staged")?;
        *guard = Some(EngineProcess::spawn(resources, state.environment())?);
    }
    let id = format!("op-{}", state.sequence.fetch_add(1, Ordering::Relaxed));
    let timeout_seconds = match command.get("command").and_then(serde_json::Value::as_str) {
        Some(
            "load_destination"
            | "load_managed_destination"
            | "import_key"
            | "prepare_destination_cleanup"
            | "execute_destination_cleanup"
            | "import_certified_keys"
            | "generate_test_keys"
            | "prepare_destination_rotation"
            | "execute_destination_rotation"
            | "execute_destination_creation"
            | "load_send_schema"
            | "validate_send_data"
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

#[cfg(test)]
mod process_tests {
    use super::*;
    use crate::protocol::{ApiVersion, ProbeResult};

    #[test]
    fn a_closed_engine_does_not_leave_bindings_that_block_reauthentication() {
        tauri::async_runtime::block_on(async {
            let state = EngineState::default();
            state.profiles.lock().await.insert(
                "old-session".into(),
                profiles::Binding {
                    profile_id: "stored-profile".into(),
                    api: ApiVersion::V3,
                    role: crate::protocol::SessionRole::OnlineService,
                    error: None,
                },
            );
            state.case_profiles.lock().await.insert(
                "old-session".into(),
                cases::Binding {
                    profile_id: "stored-profile".into(),
                    api: ApiVersion::V3,
                    role: crate::protocol::SessionRole::OnlineService,
                },
            );
            state
                .case_errors
                .lock()
                .await
                .insert("old-session".into(), "vault_pending");
            state.forget_closed_sessions().await;
            assert!(state.profiles.lock().await.is_empty());
            assert!(state.case_profiles.lock().await.is_empty());
            assert!(state.case_errors.lock().await.is_empty());
        });
    }

    #[test]
    fn packaged_engine_finishes_cleanly_when_native_shutdown_closes_its_input() {
        tauri::async_runtime::block_on(async {
            let mut process =
                EngineProcess::spawn(PathBuf::from(env!("CARGO_MANIFEST_DIR")), Environment::TEST)
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
