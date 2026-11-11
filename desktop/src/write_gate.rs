//! Shared native write gate. The desktop adapter supplies I/O and native confirmations.
use crate::environments::Environment;
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use serde_json::Value;
use std::future::Future;

pub(crate) enum Effect<'a> {
    EnsureScanner,
    ConfirmProduction(&'static str),
    RequireProfile,
    CheckpointProfile,
    CheckpointCases,
    ConfirmAttachments(u64),
    ConfirmSchema,
    MarkRunning(&'a str),
    InvalidateEngine,
    Journal(&'a Value),
    RecordCaseError(Option<&'static str>),
}
pub(crate) trait Context: Sync {
    type Error: From<&'static str> + Send;
    fn environment(&self) -> Environment;
    fn request(
        &self,
        command: Value,
    ) -> impl Future<Output = Result<SessionResource, Self::Error>> + Send;
    fn effect(&self, effect: Effect<'_>) -> impl Future<Output = Result<(), &'static str>> + Send;
}
pub(crate) async fn run<C: Context>(
    context: &C,
    version: ApiVersion,
    id: &str,
    mut command: Value,
) -> Result<SessionResource, C::Error> {
    if !valid_session_id(id) {
        return Err("session_missing".into());
    }
    command["apiVersion"] = serde_json::to_value(version).map_err(|_| "invalid_input")?;
    command["sessionId"] = id.into();
    let operation = command["command"].as_str().unwrap_or("").to_string();
    if matches!(
        operation.as_str(),
        "verify_submission"
            | "verify_reply"
            | "prepare_send"
            | "prepare_reply"
            | "execute_send"
            | "execute_reply"
    ) {
        context.effect(Effect::EnsureScanner).await?;
    }
    if context.environment() == crate::environments::Environment::PROD {
        if let Some(action) = crate::environments::production_action(&operation) {
            context.effect(Effect::ConfirmProduction(action)).await?;
            if context.environment() != crate::environments::Environment::PROD {
                return Err("environment_mismatch".into());
            }
        }
    }
    if matches!(
        operation.as_str(),
        "import_certified_keys"
            | "generate_test_keys"
            | "prepare_destination_rotation"
            | "execute_destination_rotation"
    ) {
        context.effect(Effect::RequireProfile).await?;
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
            context.effect(Effect::RequireProfile).await?;
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
        let intent: SessionResource = context.request(mark).await?;
        if !intent.validate(version, id)
            || intent.data.get("attemptId") != command.get("attemptId")
            || !matches!(
                intent.data.get("status").and_then(|v| v.as_str()),
                Some("prepared" | "expired")
            )
        {
            return Err("engine_protocol_error".into());
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
                    return Err("engine_protocol_error".into());
                }
            } else {
                context.effect(Effect::RequireProfile).await?;
            }
        }
        context.effect(Effect::CheckpointProfile).await?;
        if intent.data["status"] == "expired" {
            return Ok(intent);
        }
    }
    if matches!(
        operation.as_str(),
        "execute_receipt" | "execute_reply_receipt"
    ) {
        // The host binds review status to this exact attempt and current proof. A renderer cannot
        // suppress the native confirmation by omitting a warning or altering UI state.
        let review: SessionResource = context.request(serde_json::json!({
            "command": if operation == "execute_receipt" { "receipt_review" } else { "reply_receipt_review" },
            "apiVersion": version, "sessionId": id, "attemptId": command["attemptId"]
        })).await?;
        if !review.validate(version, id) || review.data.as_object().map(|o| o.len()) != Some(2) {
            return Err("engine_protocol_error".into());
        }
        let requires_confirmation = review.data["requiresConfirmation"]
            .as_bool()
            .ok_or("engine_protocol_error")?;
        let blocked = review.data["attachmentProblemCount"]
            .as_u64()
            .filter(|n| *n <= 39)
            .ok_or("engine_protocol_error")?;
        if blocked > 0 && !requires_confirmation {
            return Err("engine_protocol_error".into());
        }
        if requires_confirmation {
            if blocked > 0 {
                context.effect(Effect::ConfirmAttachments(blocked)).await?;
            } else {
                context.effect(Effect::ConfirmSchema).await?;
            }
        }
        context
            .effect(Effect::CheckpointCases)
            .await
            .map_err(|_| "case_storage_pending")?;
    }
    if operation == "execute_destination_update" {
        context
            .effect(Effect::MarkRunning(
                command["attemptId"].as_str().ok_or("invalid_input")?,
            ))
            .await?;
    }
    let value: SessionResource = context.request(command).await?;
    if !value.validate(version, id) {
        context.effect(Effect::InvalidateEngine).await?;
        return Err("engine_protocol_error".into());
    }
    if matches!(
        operation.as_str(),
        "prepare_destination_update"
            | "execute_destination_update"
            | "destination_update_state"
            | "cancel_destination_update"
    ) && !value.data["attemptId"].is_null()
    {
        let journal = context.effect(Effect::Journal(&value.data)).await;
        // Failed final persistence leaves the durable intent uncertain; preserve the remote result.
        if operation == "prepare_destination_update" {
            journal?;
        }
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
        let failure = context.effect(Effect::CheckpointCases).await.err();
        context.effect(Effect::RecordCaseError(failure)).await?;
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
            | "import_certified_keys"
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
        if let Err(code) = context.effect(Effect::CheckpointProfile).await {
            if matches!(
                operation.as_str(),
                "import_certified_keys" | "generate_test_keys" | "remove_key_inventory_item"
            ) {
                return Err(code.into());
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
                    let _: Result<SessionResource,_> = context.request(serde_json::json!({"command":cancel,"apiVersion":version,"sessionId":id,"attemptId":attempt})).await;
                }
                return Err(code.into());
            }
            if operation == "prepare_send" {
                // A reply key must be durable before its offer can be dispatched.
                if let Some(attempt) = value
                    .data
                    .get("attempt")
                    .and_then(|v| v.get("attemptId"))
                    .and_then(|v| v.as_str())
                {
                    let _: Result<SessionResource,_> = context.request(serde_json::json!({"command":"cancel_send","apiVersion":version,"sessionId":id,"attemptId":attempt})).await;
                }
                return Err(code.into());
            }
            // Preserve the actual send outcome; profile_status reports a failed checkpoint separately.
        }
    }
    Ok(value)
}

#[cfg(test)]
#[path = "write_gate_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "write_gate_outcome_tests.rs"]
mod outcome_tests;
