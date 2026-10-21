//! Single write gate for durable keys, current proofs and uncertain outcomes.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use crate::{cases, profiles, request, EngineState};
pub(crate) async fn resource_action(
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
