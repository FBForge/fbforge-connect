//! Keys commands. All resource calls pass through the central policy.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::resource_action;
use crate::EngineState;
use tauri::State;

#[tauri::command]
pub(crate) async fn import_key(
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
pub(crate) async fn loaded_keys(
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
pub(crate) async fn discard_keys(
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
pub(crate) async fn import_certified_keys(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    key_document: String,
) -> Result<SessionResource, &'static str> {
    if api_version != ApiVersion::V3
        || !state.environment().requires_vpki()
        || key_document.len() > 48 * 1024
    {
        return Err("invalid_input");
    }
    resource_action(
        &app,
        &state,
        api_version,
        &session_id,
        serde_json::json!({"command":"import_certified_keys","keyDocument":key_document}),
    )
    .await
}

#[tauri::command]
pub(crate) async fn generate_test_keys(
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
pub(crate) async fn list_key_inventory(
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
pub(crate) async fn remove_key_inventory_item(
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
pub(crate) async fn list_generated_keys(
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
pub(crate) async fn use_generated_keys(
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
