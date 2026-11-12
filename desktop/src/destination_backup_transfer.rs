//! Read the private Java snapshot without forwarding any material to the renderer.
use crate::{
    destination_backup_model::Backup,
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
            let backup = Backup {
                format: "fbforge-connect-destination-backup".into(),
                version: 2,
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
            _ => return Err("engine_protocol_error"),
        }
    }
    Err("engine_protocol_error")
}
