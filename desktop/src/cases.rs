//! Case commands expose read-only copies. Persistence is native-only and profile-bound.
use crate::{
    case_store::CaseStore,
    protocol::{valid_session_id, ApiVersion, SessionResource},
    request, EngineState,
};
use serde_json::{json, Value};
use tauri::{Manager, State};

async fn disk(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<Option<CaseStore>, &'static str> {
    let bindings = state.profiles.lock().await;
    let Some(binding) = bindings.get(session) else {
        return Ok(None);
    };
    if binding.api != api {
        return Err("session_missing");
    }
    Ok(Some(CaseStore::new(
        app.path()
            .app_data_dir()
            .map_err(|_| "vault_unavailable")?
            .join("cases"),
        &binding.profile_id,
        if api == ApiVersion::V2 { "v2" } else { "v3" },
    )?))
}
async fn engine(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
    operation: &str,
    record: Option<&str>,
    content: Option<&str>,
    offset: usize,
) -> Result<SessionResource, &'static str> {
    let document =
        json!({"operation":operation,"recordId":record,"contentId":content,"offset":offset})
            .to_string();
    let value: SessionResource = request(app,state,json!({"command":"case_workspace","apiVersion":api,"sessionId":session,"archiveDocument":document})).await?;
    if !value.validate(api, session) {
        return Err("engine_protocol_error");
    }
    Ok(value)
}
async fn live(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<Vec<Value>, &'static str> {
    let mut records = vec![];
    for offset in (0..100).step_by(10) {
        let data = engine(app, state, api, session, "list", None, None, offset)
            .await?
            .data;
        let total = data["total"]
            .as_u64()
            .filter(|n| *n <= 100)
            .ok_or("engine_protocol_error")? as usize;
        records.extend(
            data["records"]
                .as_array()
                .ok_or("engine_protocol_error")?
                .clone(),
        );
        if records.len() == total {
            return Ok(records);
        }
    }
    Err("engine_protocol_error")
}
pub async fn checkpoint(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<(), &'static str> {
    let Some(store) = disk(app, state, api, session).await? else {
        return Ok(());
    };
    if !store.enabled()? {
        return Ok(());
    }
    for summary in live(app, state, api, session).await? {
        let id = summary["recordId"]
            .as_str()
            .filter(|id| valid_session_id(id))
            .ok_or("engine_protocol_error")?;
        if store
            .header(id)
            .is_ok_and(|h| h["summary"]["revision"] == summary["revision"])
        {
            continue;
        }
        let mut pages = vec![];
        let mut parts = vec![];
        for offset in (0..44).step_by(2) {
            let page = engine(app, state, api, session, "parts", Some(id), None, offset)
                .await?
                .data;
            let total = page["total"]
                .as_u64()
                .filter(|v| *v <= 42)
                .ok_or("engine_protocol_error")? as usize;
            parts.extend(
                page["parts"]
                    .as_array()
                    .ok_or("engine_protocol_error")?
                    .clone(),
            );
            pages.push(page);
            if offset + 2 >= total {
                break;
            }
        }
        let blocks: u64 = parts
            .iter()
            .map(|p| p["totalBytes"].as_u64().unwrap_or(0).div_ceil(24576).max(1))
            .sum();
        let (mut file, temp) = store.begin(
            id,
            summary["totalBytes"]
                .as_u64()
                .ok_or("engine_protocol_error")?,
        )?;
        let result = async {
            store.write(
                &mut file,
                id,
                0,
                &json!({"version":1,"summary":summary,"pageCount":pages.len(),"blocks":blocks}),
                None,
            )?;
            let revision = summary["revision"]
                .as_str()
                .ok_or("engine_protocol_error")?;
            let mut number = 1;
            for page in pages {
                store.write(&mut file, id, number, &page, Some(revision))?;
                number += 1;
            }
            for part in parts {
                let content = part["contentId"].as_str().ok_or("engine_protocol_error")?;
                let size = part["totalBytes"].as_u64().ok_or("engine_protocol_error")? as usize;
                for offset in (0..size.max(1)).step_by(24576) {
                    let data = engine(
                        app,
                        state,
                        api,
                        session,
                        "read",
                        Some(id),
                        Some(content),
                        offset,
                    )
                    .await?
                    .data;
                    store.write(&mut file, id, number, &data, Some(revision))?;
                    number += 1;
                }
            }
            store.commit(file, &temp, id)
        }
        .await;
        if result.is_err() {
            let _ = std::fs::remove_file(temp);
        }
        result?;
    }
    Ok(())
}
#[tauri::command]
pub async fn case_workspace(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    operation: String,
    record_id: Option<String>,
    content_id: Option<String>,
    offset: Option<usize>,
    persistent: Option<bool>,
) -> Result<SessionResource, &'static str> {
    if !valid_session_id(&session_id)
        || record_id.as_ref().is_some_and(|id| !valid_session_id(id))
        || content_id.as_ref().is_some_and(|id| !valid_session_id(id))
        || offset.unwrap_or(0) > 32 * 1024 * 1024
    {
        return Err("invalid_input");
    }
    // Always validate the current session, even when serving an archived copy.
    let mut live = live(&app, &state, api_version, &session_id).await?;
    let store = disk(&app, &state, api_version, &session_id).await?;
    if operation == "storage" {
        let store = store.as_ref().ok_or("vault_profile_required")?;
        store.enable(persistent.ok_or("invalid_input")?)?;
        checkpoint(&app, &state, api_version, &session_id).await?;
    }
    if matches!(operation.as_str(), "list" | "storage") {
        let saved = if let Some(store) = &store {
            store.records()?
        } else {
            vec![]
        };
        for mut record in saved {
            if !live.iter().any(|s| s["recordId"] == record["recordId"]) {
                record["archived"] = true.into();
                live.push(record);
            }
        }
        let enabled_result = store.as_ref().map(|s| s.enabled()).transpose();
        let storage_error = enabled_result.as_ref().err().copied().or(state
            .case_errors
            .lock()
            .await
            .get(&session_id)
            .copied());
        let enabled = enabled_result.ok().flatten().unwrap_or(false);
        return Ok(SessionResource {
            api_version,
            session_id: session_id.clone(),
            environment: "TEST".into(),
            data: json!({"records":live,"persistent":enabled,"canPersist":cfg!(windows) && store.is_some(),"storageError":storage_error}),
        });
    }
    if operation == "clear" {
        if let Some(store) = &store {
            for record in store.records()? {
                store.delete(record["recordId"].as_str().ok_or("vault_invalid")?)?;
            }
        }
        return engine(
            &app,
            &state,
            api_version,
            &session_id,
            "clear",
            None,
            None,
            0,
        )
        .await;
    }
    let id = record_id.as_deref().ok_or("invalid_input")?;
    if operation == "delete" {
        if let Some(store) = &store {
            store.delete(id)?;
        }
        return engine(
            &app,
            &state,
            api_version,
            &session_id,
            "delete",
            Some(id),
            None,
            0,
        )
        .await;
    }
    if !matches!(operation.as_str(), "parts" | "read") {
        return Err("invalid_input");
    }
    if live.iter().any(|s| s["recordId"] == id) {
        return engine(
            &app,
            &state,
            api_version,
            &session_id,
            &operation,
            Some(id),
            content_id.as_deref(),
            offset.unwrap_or(0),
        )
        .await;
    }
    let data = store.ok_or("invalid_resource")?.resource(
        id,
        &operation,
        content_id.as_deref(),
        offset.unwrap_or(0),
    )?;
    Ok(SessionResource {
        api_version,
        session_id,
        environment: "TEST".into(),
        data,
    })
}
