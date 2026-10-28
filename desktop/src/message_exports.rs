//! Export capabilities are bound to the current session and environment. Paths never come from IPC.
use crate::{
    message_export_store as store,
    protocol::{valid_session_id, ApiVersion},
    resource_action, EngineState,
};
use serde_json::{json, Value};
use std::{collections::HashMap, hash::BuildHasher, path::PathBuf};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

struct Permit {
    api: ApiVersion,
    session: String,
    environment: String,
    path: PathBuf,
}
#[derive(Default)]
pub struct MessageExports(tokio::sync::Mutex<HashMap<String, Permit>>);

#[tauri::command]
pub async fn begin_message_export(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    exports: State<'_, MessageExports>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<Option<Value>, &'static str> {
    crate::commands::sessions::check_session(
        app.clone(),
        state.clone(),
        api_version,
        session_id.clone(),
    )
    .await?;
    let window = app.get_webview_window("main").ok_or("export_failed")?;
    let dialog_app = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        let confirmed = dialog_app.dialog().message("Metadaten, Fachdaten und Anlagen werden entschlüsselt gespeichert. Die Dateien sind außerhalb der geschützten Vorgangsablage lesbar und können personenbezogene Daten enthalten. Wählen Sie einen geeigneten Zielordner.")
            .parent(&window).title("Nachrichten herunterladen").kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Zielordner wählen".into(), "Abbrechen".into())).blocking_show();
        if !confirmed { return Ok(None); }
        dialog_app.dialog().file().set_parent(&window).set_title("Zielordner für Nachrichten").blocking_pick_folder()
            .map(|file| file.into_path().map_err(|_| "export_failed")).transpose()
    }).await.map_err(|_| "export_failed")??;
    let Some(path) = path else {
        return Ok(None);
    };
    crate::commands::sessions::check_session(
        app.clone(),
        state.clone(),
        api_version,
        session_id.clone(),
    )
    .await?;
    let root = store::reserve(&path, "FBForge-Connect-Export")?;
    let token = format!(
        "export-{:016x}",
        std::collections::hash_map::RandomState::new().hash_one((&session_id, &root))
    );
    let mut permits = exports.0.lock().await;
    permits.clear();
    let result = json!({"exportId":token,"directory":root.to_string_lossy()});
    permits.insert(
        token,
        Permit {
            api: api_version,
            session: session_id,
            environment: state.environment().name().into(),
            path: root,
        },
    );
    Ok(Some(result))
}

#[tauri::command]
pub async fn finish_message_export(
    exports: State<'_, MessageExports>,
    export_id: String,
) -> Result<(), &'static str> {
    exports.0.lock().await.remove(&export_id);
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    proof_id: Option<String>,
    record_id: Option<String>,
    message_id: String,
    reply: bool,
}
impl Source {
    fn validate(&self) -> bool {
        valid_session_id(&self.message_id)
            && (self.proof_id.is_some() != self.record_id.is_some())
            && self
                .proof_id
                .iter()
                .chain(self.record_id.iter())
                .all(|id| valid_session_id(id))
    }
    async fn read(
        &self,
        app: &tauri::AppHandle,
        state: State<'_, EngineState>,
        api: ApiVersion,
        session: &str,
        content: Option<&str>,
        offset: usize,
    ) -> Result<Value, &'static str> {
        let result = if let Some(record) = &self.record_id {
            crate::cases::case_workspace(
                app.clone(),
                state,
                api,
                session.into(),
                if content.is_some() { "read" } else { "parts" }.into(),
                Some(record.clone()),
                content.map(String::from),
                Some(offset),
                None,
            )
            .await?
        } else {
            let command = match (self.reply, content.is_some()) {
                (false, false) => "list_received_contents",
                (false, true) => "read_received_content",
                (true, false) => "list_received_reply_contents",
                (true, true) => "read_received_reply_content",
            };
            let mut request = json!({"command":command,"proofId":self.proof_id});
            if let Some(id) = content {
                request["contentId"] = id.into();
                request["byteOffset"] = offset.into();
            } else {
                request["offset"] = offset.into();
            }
            resource_action(app, &state, api, session, request).await?
        };
        if !result.validate(api, session) {
            return Err("engine_protocol_error");
        }
        let identity = if self.record_id.is_some() {
            "recordId"
        } else {
            "proofId"
        };
        if result.data[identity].as_str() != self.record_id.as_deref().or(self.proof_id.as_deref())
        {
            return Err("engine_protocol_error");
        }
        Ok(result.data)
    }
}

#[tauri::command]
pub async fn export_message(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    exports: State<'_, MessageExports>,
    api_version: ApiVersion,
    session_id: String,
    export_id: String,
    source: Source,
) -> Result<Value, &'static str> {
    if !source.validate() {
        return Err("invalid_input");
    }
    let permits = exports.0.lock().await;
    let permit = permits.get(&export_id).ok_or("export_expired")?;
    if permit.api != api_version
        || permit.session != session_id
        || permit.environment != state.environment().name()
    {
        return Err("session_missing");
    }
    let prefix = if source.reply {
        "Antwort"
    } else {
        "Einreichung"
    };
    crate::message_export_stream::export(
        &permit.path,
        prefix,
        &source.message_id,
        source.record_id.is_some(),
        &permit.environment,
        |content, offset| {
            let state = state.clone();
            let app = &app;
            let source = &source;
            let session = &session_id;
            async move {
                source
                    .read(app, state, api_version, session, content.as_deref(), offset)
                    .await
            }
        },
    )
    .await
}
