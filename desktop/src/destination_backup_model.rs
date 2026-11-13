//! A destination snapshot contains no login credentials or reply-channel keys.
use crate::{environments::Environment, portable_archive, protocol::valid_session_id};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub fn valid_export_filename(name: &str) -> bool {
    name.len() <= 200
        && name.len() > 5
        && name.ends_with(".json")
        && !name.starts_with('.')
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !matches!(
            name.split('.')
                .next()
                .unwrap_or("")
                .to_ascii_uppercase()
                .as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub version: u8,
    pub id: String,
    pub name: String,
    pub environment: Environment,
    pub source_destination_id: String,
    pub captured_at: u64,
    pub configuration: Value,
    pub public_keys: Vec<Value>,
}
fn safe_public(value: &Value, depth: usize) -> bool {
    if depth > 16 {
        return false;
    }
    match value {
        Value::Object(map) => {
            map.len() <= 64
                && map.iter().all(|(k, v)| {
                    ![
                        "privateJwk",
                        "privateKey",
                        "clientSecret",
                        "access_token",
                        "secret",
                        "d",
                        "p",
                        "q",
                        "dp",
                        "dq",
                        "qi",
                        "oth",
                        "k",
                    ]
                    .contains(&k.as_str())
                        && safe_public(v, depth + 1)
                })
        }
        Value::Array(items) => {
            items.len() <= 128 && items.iter().all(|v| safe_public(v, depth + 1))
        }
        Value::String(text) => text.len() <= 32768 && !text.chars().any(|c| c == '\0'),
        _ => true,
    }
}
impl Backup {
    pub fn validate(&self) -> Result<(), &'static str> {
        let Some(config) = self.configuration.as_object() else {
            return Err("backup_invalid");
        };
        let fields = [
            "destinationId",
            "encryptionKid",
            "metadataVersions",
            "publicServices",
            "processMessages",
            "status",
            "type",
            "possibleNextStatus",
            "canBeDecommissionedAt",
            "updatedAt",
            "name",
            "contactInformation",
            "callback",
            "senderAccessRestricted",
            "destinationSignature",
            "publicForRouting",
            "clientCount",
        ];
        if self.format != "fbforge-connect-destination-backup"
            || self.version != 2
            || !valid_session_id(&self.id)
            || !valid_session_id(&self.source_destination_id)
            || self.name.trim().is_empty()
            || self.name.encode_utf16().count() > 160
            || self.name.chars().any(char::is_control)
            || self.captured_at == 0
            || self.captured_at > 8_640_000_000_000_000
            || self.configuration["destinationId"] != self.source_destination_id
            || !(self.configuration["name"].is_null()
                || self.configuration["name"]
                    .as_str()
                    .is_some_and(|name| name.encode_utf16().count() <= 512))
            || !matches!(self.configuration["type"].as_str(), Some("A" | "B" | "C"))
            || !(self.configuration["clientCount"].is_null()
                || self.configuration["clientCount"]
                    .as_u64()
                    .is_some_and(|count| count <= i32::MAX as u64))
            || !config.keys().all(|k| fields.contains(&k.as_str()))
            || !safe_public(&self.configuration, 0)
            || serde_json::to_vec(&self.configuration).map_or(true, |v| v.len() > 44000)
            || self.public_keys.len() > 128
            || self.public_keys.iter().enumerate().any(|(i, key)| {
                !key.is_object()
                    || !safe_public(key, 0)
                    || key["kid"]
                        .as_str()
                        .is_none_or(|s| s.is_empty() || s.len() > 512)
                    || self.public_keys[..i].iter().any(|p| p["kid"] == key["kid"])
            })
            || serde_json::to_vec(self).map_or(true, |v| v.len() > portable_archive::MAX_PLAIN)
        {
            return Err("backup_invalid");
        }
        Ok(())
    }
    pub fn summary(&self) -> Value {
        json!({"id":self.id,"name":self.name,"environment":self.environment,"sourceDestinationId":self.source_destination_id,"capturedAt":self.captured_at,"destinationName":self.configuration["name"],"type":self.configuration["type"],"registeredKeyCount":self.public_keys.len(),"callbackSecretMissing":self.configuration["callback"]["url"].is_string()})
    }
    pub fn draft(&self) -> Value {
        let mut value = serde_json::Map::new();
        for field in [
            "name",
            "type",
            "contactInformation",
            "metadataVersions",
            "publicServices",
            "processMessages",
            "callback",
            "senderAccessRestricted",
            "publicForRouting",
        ] {
            if !self.configuration[field].is_null() {
                value.insert(field.into(), self.configuration[field].clone());
            }
        }
        for field in ["publicServices", "processMessages"] {
            value.entry(field).or_insert(json!([]));
        }
        Value::Object(value)
    }
}
