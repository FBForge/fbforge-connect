use crate::{
    profiles,
    protocol::{ApiVersion, SessionRole},
    request,
    vault::ProfileSummary,
    EngineState,
};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CredentialCheck {
    api_version: ApiVersion,
    environment: String,
    valid: bool,
}

#[tauri::command]
pub async fn copy_profile_for_api(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    profile_id: String,
    target_profile_id: String,
    api_version: ApiVersion,
) -> Result<ProfileSummary, &'static str> {
    let store = profiles::vault(&app)?;
    let source = store.load(&profile_id)?;
    if source.environment != state.environment() {
        return Err("environment_mismatch");
    }
    // Flush only the target's current archive before updating its credentials.
    let sessions: Vec<(String, ApiVersion, SessionRole)> = state
        .profiles
        .lock()
        .await
        .iter()
        .filter(|(_, binding)| binding.profile_id == target_profile_id)
        .map(|(id, binding)| (id.clone(), binding.api, binding.role))
        .collect();
    for (id, api, _) in sessions {
        profiles::checkpoint(&app, &state, api, &id).await?;
    }
    let existing = if store.contains(&target_profile_id)? {
        Some(store.load(&target_profile_id)?)
    } else {
        None
    };
    let target =
        crate::profile_versions::for_api(&source, api_version, &target_profile_id, existing)?;
    let checked: CredentialCheck = request(&app, &state, serde_json::json!({"command":"validate_profile_credentials", "apiVersion":api_version, "clientId":target.client_id, "clientSecret":target.client_secret})).await?;
    if checked.api_version != api_version
        || checked.environment != state.environment().name()
        || !checked.valid
    {
        return Err("engine_protocol_error");
    }
    store.save(&target)?;
    Ok(target.summary())
}
