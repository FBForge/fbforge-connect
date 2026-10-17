//! Bridges encrypted profiles and the Java engine. Private archive items never cross the WebView boundary.
use crate::protocol::{
    valid_session_id, ApiVersion, SessionResource, SessionRole, SessionSnapshot,
};
use crate::vault::{Profile, ProfileDefaults, ProfileSummary, Vault};
use crate::{request, EngineState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Manager, State};

pub struct Binding {
    pub profile_id: String,
    pub api: ApiVersion,
    pub role: SessionRole,
    pub error: Option<&'static str>,
}
pub type Bindings = HashMap<String, Binding>;
pub(crate) fn vault(app: &tauri::AppHandle) -> Result<Vault, &'static str> {
    Ok(Vault::new(
        app.path()
            .app_data_dir()
            .map_err(|_| "vault_unavailable")?
            .join("profiles"),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ArchiveItem {
    offset: usize,
    total: usize,
    item: Option<serde_json::Value>,
}
async fn archive(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<Vec<serde_json::Value>, &'static str> {
    let mut keys = vec![];
    let mut expected = None;
    for offset in 0..=176 {
        let response: SessionResource = request(app, state, serde_json::json!({"command":"export_session_item", "apiVersion":api,"sessionId":session,"offset":offset})).await?;
        if !response.validate(api, session) {
            return Err("engine_protocol_error");
        }
        let page: ArchiveItem =
            serde_json::from_value(response.data).map_err(|_| "engine_protocol_error")?;
        if page.offset != offset
            || page.total > 176
            || expected.is_some_and(|total| total != page.total)
        {
            return Err("engine_protocol_error");
        }
        expected = Some(page.total);
        if offset == page.total {
            if page.item.is_some() {
                return Err("engine_protocol_error");
            }
            return Ok(keys);
        }
        let item = page.item.ok_or("engine_protocol_error")?;
        if !item.is_object() {
            return Err("engine_protocol_error");
        }
        keys.push(item);
    }
    Err("engine_protocol_error")
}
pub async fn save_opened(
    app: &tauri::AppHandle,
    state: &EngineState,
    session: &SessionSnapshot,
    id: String,
    name: String,
    client_id: String,
    client_secret: String,
) -> Result<(), &'static str> {
    let profile = Profile {
        defaults: ProfileDefaults::default(),
        version: 1,
        profile_id: id.clone(),
        name,
        api_version: session.api_version,
        role: session.role,
        client_id,
        client_secret,
        keys: archive(app, state, session.api_version, &session.session_id).await?,
    };
    let store = vault(app)?;
    if store.contains(&id)? {
        return Err("vault_conflict");
    }
    store.save(&profile)?;
    state.profiles.lock().await.insert(
        session.session_id.clone(),
        Binding {
            profile_id: id,
            api: session.api_version,
            role: session.role,
            error: None,
        },
    );
    Ok(())
}
pub async fn checkpoint(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<(), &'static str> {
    let mut bindings = state.profiles.lock().await;
    let Some(binding) = bindings.get_mut(session) else {
        return Ok(());
    };
    if binding.api != api {
        return Err("session_missing");
    }
    let result = async {
        let store = vault(app)?;
        let mut profile = store.load(&binding.profile_id)?;
        if profile.api_version != api {
            return Err("vault_invalid");
        }
        profile.keys = archive(app, state, api, session).await?;
        store.save(&profile)
    }
    .await;
    binding.error = result.as_ref().err().copied();
    result
}
pub async fn require_profile(
    state: &EngineState,
    api: ApiVersion,
    session: &str,
) -> Result<(), &'static str> {
    let bindings = state.profiles.lock().await;
    match bindings.get(session) {
        Some(binding) if binding.api == api && binding.error.is_none() => Ok(()),
        Some(_) => Err("vault_pending"),
        None => Err("vault_profile_required"),
    }
}
pub async fn before_open(
    app: &tauri::AppHandle,
    state: &EngineState,
    api: ApiVersion,
    role: SessionRole,
) -> Result<(), &'static str> {
    let existing: Vec<String> = state
        .profiles
        .lock()
        .await
        .iter()
        .filter(|(_, item)| item.api == api && item.role == role)
        .map(|(id, _)| id.clone())
        .collect();
    for id in existing {
        checkpoint(app, state, api, &id).await?;
    }
    Ok(())
}
pub async fn opened(state: &EngineState, api: ApiVersion, role: SessionRole) {
    state
        .profiles
        .lock()
        .await
        .retain(|_, item| item.api != api || item.role != role);
}
#[tauri::command]
pub async fn list_profiles(app: tauri::AppHandle) -> Result<Vec<ProfileSummary>, &'static str> {
    vault(&app)?.list()
}
#[tauri::command]
pub async fn forget_profile(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    profile_id: String,
) -> Result<(), &'static str> {
    if !valid_session_id(&profile_id) {
        return Err("invalid_input");
    }
    let mut bindings = state.profiles.lock().await;
    vault(&app)?.forget(&profile_id)?;
    bindings.retain(|_, binding| binding.profile_id != profile_id);
    Ok(())
}
#[tauri::command]
pub async fn open_saved_profile(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    profile_id: String,
    restore_keys: bool,
) -> Result<SessionSnapshot, &'static str> {
    let profile = vault(&app)?.load(&profile_id)?;
    let api = profile.api_version;
    before_open(&app, &state, api, profile.role)
        .await
        .map_err(|_| "vault_pending")?;
    let session: SessionSnapshot = request(
        &app,
        &state,
        serde_json::json!({"command":"open_session", "apiVersion":api,
        "role":profile.role,"clientId":profile.client_id,"clientSecret":profile.client_secret}),
    )
    .await?;
    if !session.validate(api, Some(profile.role), None, true) {
        return Err("engine_protocol_error");
    }
    opened(&state, api, profile.role).await;
    if restore_keys {
        let restore = async {
            for item in &profile.keys {
                let document = serde_json::to_string(item).map_err(|_| "vault_invalid")?;
                let result: SessionResource = request(
                    &app,
                    &state,
                    serde_json::json!({"command":"restore_session_item","apiVersion":api,
                    "sessionId":session.session_id,"archiveDocument":document}),
                )
                .await?;
                if !result.validate(api, &session.session_id)
                    || result.data != serde_json::json!({"restored":true})
                {
                    return Err("engine_protocol_error");
                }
            }
            Ok::<(), &'static str>(())
        }
        .await;
        if let Err(code) = restore {
            let _: Result<SessionSnapshot,_> = request(&app, &state, serde_json::json!({"command":"close_session","apiVersion":api,"sessionId":session.session_id})).await;
            return Err(
                if matches!(
                    code,
                    "engine_timeout" | "engine_disconnected" | "engine_protocol_error"
                ) {
                    code
                } else {
                    "vault_restore_failed"
                },
            );
        }
        state.profiles.lock().await.insert(
            session.session_id.clone(),
            Binding {
                profile_id,
                api,
                role: session.role,
                error: None,
            },
        );
    }
    // Credential-only use is deliberately session-bound; it must not overwrite saved keys with an empty archive.
    Ok(session)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    profile_id: Option<String>,
    saved: bool,
    error: Option<&'static str>,
}
#[tauri::command]
pub async fn profile_status(
    state: State<'_, EngineState>,
    session_id: String,
) -> Result<StorageStatus, &'static str> {
    if !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    let bindings = state.profiles.lock().await;
    Ok(match bindings.get(&session_id) {
        Some(binding) => StorageStatus {
            profile_id: Some(binding.profile_id.clone()),
            saved: binding.error.is_none(),
            error: binding.error.map(|_| "vault_unavailable"),
        },
        None => StorageStatus {
            profile_id: None,
            saved: false,
            error: None,
        },
    })
}
#[tauri::command]
pub async fn save_profile_state(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<(), &'static str> {
    if !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    checkpoint(&app, &state, api_version, &session_id).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CredentialCheck {
    api_version: ApiVersion,
    environment: String,
    valid: bool,
}
#[tauri::command]
pub async fn update_profile(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    profile_id: String,
    name: String,
    new_secret: Option<String>,
) -> Result<ProfileSummary, &'static str> {
    if !valid_session_id(&profile_id)
        || new_secret
            .as_ref()
            .is_some_and(|secret| secret.trim().is_empty() || secret.len() > 8192)
    {
        return Err("invalid_input");
    }
    let sessions: Vec<_> = state
        .profiles
        .lock()
        .await
        .iter()
        .filter(|(_, binding)| binding.profile_id == profile_id)
        .map(|(session, binding)| (session.clone(), binding.api))
        .collect();
    for (session, api) in sessions {
        checkpoint(&app, &state, api, &session).await?;
    }
    let store = vault(&app)?;
    let mut profile = store.load(&profile_id)?;
    profile.name = name;
    profile.validate()?;
    if let Some(secret) = new_secret {
        let checked: CredentialCheck=request(&app,&state,serde_json::json!({"command":"validate_profile_credentials","apiVersion":profile.api_version,
            "clientId":profile.client_id,"clientSecret":secret})).await?;
        if checked.api_version != profile.api_version
            || checked.environment != "TEST"
            || !checked.valid
        {
            return Err("engine_protocol_error");
        }
        profile.client_secret = secret;
    }
    store.save(&profile)?;
    Ok(profile.summary())
}

#[tauri::command]
pub async fn get_profile_defaults(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
) -> Result<Option<ProfileDefaults>, &'static str> {
    if !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    let bindings = state.profiles.lock().await;
    let Some(binding) = bindings.get(&session_id) else {
        return Ok(None);
    };
    if binding.api != api_version {
        return Err("session_missing");
    }
    let profile = vault(&app)?.load(&binding.profile_id)?;
    if profile.api_version != api_version {
        return Err("vault_invalid");
    }
    Ok(Some(profile.defaults.clone()))
}

#[tauri::command]
pub async fn save_profile_defaults(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    defaults: ProfileDefaults,
) -> Result<ProfileDefaults, &'static str> {
    if !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    defaults
        .validate(api_version)
        .map_err(|_| "invalid_input")?;
    require_profile(&state, api_version, &session_id).await?;
    checkpoint(&app, &state, api_version, &session_id).await?;
    let mut bindings = state.profiles.lock().await;
    let binding = bindings
        .get_mut(&session_id)
        .ok_or("vault_profile_required")?;
    if binding.api != api_version {
        return Err("session_missing");
    }
    let store = vault(&app)?;
    let mut profile = store.load(&binding.profile_id)?;
    if profile.api_version != api_version {
        return Err("vault_invalid");
    }
    profile.defaults = defaults.clone();
    let result = store.save(&profile);
    binding.error = result.as_ref().err().copied();
    result?;
    Ok(defaults)
}
