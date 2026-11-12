//! Read the private Java snapshot without forwarding any material to the renderer.
use crate::{
    destination_backup_model::{Backup, PrivateKey},
    environments::Environment,
    portable_archive,
    protocol::{ApiVersion, SessionResource},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::future::Future;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Part {
    offset: usize,
    total: usize,
    item: Option<Item>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Item {
    kind: String,
    value: Value,
}

pub async fn capture<F, Fut>(
    session: &str,
    environment: Environment,
    destination: &str,
    name: String,
    mut request: F,
) -> Result<Backup, &'static str>
where
    F: FnMut(Value) -> Fut,
    Fut: Future<Output = Result<SessionResource, &'static str>>,
{
    let mut configuration = Value::Null;
    let mut public_keys = vec![];
    let mut raw_keys = vec![];
    let mut expected = None;
    for offset in 0..=305 {
        let response = request(json!({"command":"export_destination_item","apiVersion":ApiVersion::V3,"sessionId":session,"destinationId":destination,"offset":offset})).await?;
        if !response.validate(ApiVersion::V3, session) || response.environment != environment.name()
        {
            return Err("engine_protocol_error");
        }
        let part: Part =
            serde_json::from_value(response.data).map_err(|_| "engine_protocol_error")?;
        if part.offset != offset
            || part.total == 0
            || part.total > 305
            || expected.is_some_and(|n| n != part.total)
        {
            return Err("engine_protocol_error");
        }
        expected = Some(part.total);
        if offset == part.total {
            if part.item.is_some() || configuration.is_null() {
                return Err("engine_protocol_error");
            }
            let mut keys = Vec::<PrivateKey>::new();
            for item in raw_keys {
                let item: Value = item;
                let generated = !item["generatedKey"].is_null();
                let reference = &item[if generated {
                    "generatedKey"
                } else {
                    "destinationKey"
                }];
                if !item["replyChannel"].is_null() || reference["destinationId"] != destination {
                    return Err("engine_protocol_error");
                }
                let private_jwk = item["privateJwk"]
                    .as_str()
                    .ok_or("engine_protocol_error")?
                    .to_owned();
                let value: Value =
                    serde_json::from_str(&private_jwk).map_err(|_| "engine_protocol_error")?;
                let kid = value["kid"]
                    .as_str()
                    .ok_or("engine_protocol_error")?
                    .to_owned();
                let purpose = reference["purpose"]
                    .as_str()
                    .ok_or("engine_protocol_error")?
                    .to_owned();
                // Only registered keys belong to this destination. No unrelated reply or ready keys.
                if public_keys.iter().any(|p: &Value| p["kid"] == kid)
                    && !keys.iter().any(|p| p.kid == kid)
                {
                    keys.push(PrivateKey {
                        kid,
                        purpose,
                        private_jwk,
                    });
                }
            }
            let backup = Backup {
                format: "fbforge-connect-destination-backup".into(),
                version: 1,
                id: portable_archive::random_id()?,
                name,
                environment,
                source_destination_id: destination.into(),
                captured_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|_| "backup_unavailable")?
                    .as_millis() as u64,
                configuration,
                public_keys,
                keys,
            };
            backup.validate()?;
            return Ok(backup);
        }
        let item = part.item.ok_or("engine_protocol_error")?;
        match item.kind.as_str() {
            "configuration" if offset == 0 => configuration = item.value,
            "public_key" if !configuration.is_null() && public_keys.len() < 128 => {
                public_keys.push(item.value)
            }
            "private_key" if !configuration.is_null() && raw_keys.len() < 176 => {
                raw_keys.push(item.value)
            }
            _ => return Err("engine_protocol_error"),
        }
    }
    Err("engine_protocol_error")
}

pub fn bundle_document(backup: &Backup) -> Result<Vec<u8>, &'static str> {
    backup.validate()?;
    let mut value = serde_json::Map::new();
    for (key, public) in backup.pair()? {
        let mut private: Value =
            serde_json::from_str(&key.private_jwk).map_err(|_| "backup_invalid")?;
        private["kid"] = json!(portable_archive::random_id()?);
        private["x5c"] = public["x5c"].clone();
        value.insert(
            if key.purpose == "decrypt" {
                "encryption"
            } else {
                "signing"
            }
            .into(),
            private,
        );
    }
    let document = serde_json::to_vec(&value).map_err(|_| "backup_invalid")?;
    if document.len() > 56000 {
        return Err("backup_invalid");
    }
    Ok(document)
}

pub async fn import_bundle<F, Fut>(
    session: &str,
    environment: Environment,
    document: &[u8],
    mut commit: F,
) -> Result<Value, &'static str>
where
    F: FnMut(Value) -> Fut,
    Fut: Future<Output = Result<SessionResource, &'static str>>,
{
    if document.is_empty() || document.len() > 56000 {
        return Err("backup_invalid");
    }
    let text = std::str::from_utf8(document).map_err(|_| "backup_invalid")?;
    let command = json!({"command":"import_backup_bundle","apiVersion":ApiVersion::V3,"sessionId":session,"keyDocument":text});
    if serde_json::to_vec(&command)
        .map_err(|_| "backup_invalid")?
        .len()
        > crate::protocol::MAX_FRAME_BYTES - 128
    {
        return Err("backup_invalid");
    }
    let response = commit(command).await?;
    if !response.validate(ApiVersion::V3, session) || response.environment != environment.name() {
        return Err("engine_protocol_error");
    }
    let id = response.data["bundleId"]
        .as_str()
        .filter(|id| crate::protocol::valid_session_id(id))
        .ok_or("engine_protocol_error")?;
    Ok(json!({"bundleId":id}))
}
