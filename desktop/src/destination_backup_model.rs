//! A destination snapshot contains no login credentials or reply-channel keys.
use crate::{environments::Environment, portable_archive, protocol::valid_session_id};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrivateKey {
    pub kid: String,
    pub purpose: String,
    pub private_jwk: String,
}
impl Drop for PrivateKey {
    fn drop(&mut self) {
        crate::vault::wipe_string(&mut self.private_jwk);
    }
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
    pub keys: Vec<PrivateKey>,
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
fn private_matches(key: &PrivateKey, public: &Value) -> bool {
    if public["kid"] != key.kid {
        return false;
    }
    let Ok(value) = serde_json::from_str::<Value>(&key.private_jwk) else {
        return false;
    };
    value["kid"] == key.kid
        && value["kty"] == "RSA"
        && public["kty"] == "RSA"
        && value["n"].as_str().is_some_and(|s| !s.is_empty())
        && value["e"].as_str().is_some_and(|s| !s.is_empty())
        && public["n"] == value["n"]
        && public["e"] == value["e"]
        && value["d"].as_str().is_some_and(|s| !s.is_empty())
        && public["alg"]
            == if key.purpose == "decrypt" {
                "RSA-OAEP-256"
            } else {
                "PS512"
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
        ];
        if self.format != "fbforge-connect-destination-backup"
            || self.version != 1
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
            || !config.keys().all(|k| fields.contains(&k.as_str()))
            || !safe_public(&self.configuration, 0)
            || serde_json::to_vec(&self.configuration).map_or(true, |v| v.len() > 44000)
            || self.public_keys.len() > 128
            || self.keys.len() > 128
            || self.public_keys.iter().enumerate().any(|(i, key)| {
                !key.is_object()
                    || !safe_public(key, 0)
                    || key["kid"]
                        .as_str()
                        .is_none_or(|s| s.is_empty() || s.len() > 512)
                    || self.public_keys[..i].iter().any(|p| p["kid"] == key["kid"])
            })
            || self.keys.iter().enumerate().any(|(i, key)| {
                key.private_jwk.len() > 24000
                    || !matches!(key.purpose.as_str(), "decrypt" | "sign")
                    || !self.public_keys.iter().any(|p| private_matches(key, p))
                    || self.keys[..i].iter().any(|p| p.kid == key.kid)
            })
            || serde_json::to_vec(self).map_or(true, |v| v.len() > portable_archive::MAX_PLAIN)
        {
            return Err("backup_invalid");
        }
        Ok(())
    }
    pub fn summary(&self) -> Value {
        let needed: Vec<_> = self.public_keys.iter().collect();
        let missing: Vec<_> = needed
            .iter()
            .filter(|key| !self.keys.iter().any(|p| private_matches(p, key)))
            .map(|k| k["kid"].clone())
            .collect();
        json!({"id":self.id,"name":self.name,"environment":self.environment,"sourceDestinationId":self.source_destination_id,"capturedAt":self.captured_at,"destinationName":self.configuration["name"],"type":self.configuration["type"],"privateKeyCount":self.keys.len(),"registeredKeyCount":needed.len(),"missingKeys":missing,"complete":missing.is_empty(),"canReuseKeys":self.pair().is_ok(),"callbackSecretMissing":self.configuration["callback"]["url"].is_string()})
    }
    pub fn pair(&self) -> Result<[(&PrivateKey, &Value); 2], &'static str> {
        let encryption = self
            .keys
            .iter()
            .filter(|k| k.purpose == "decrypt" && self.configuration["encryptionKid"] == k.kid)
            .find_map(|k| {
                self.public_keys
                    .iter()
                    .find(|p| private_matches(k, p))
                    .map(|p| (k, p))
            });
        let signing = self
            .keys
            .iter()
            .filter(|k| k.purpose == "sign")
            .find_map(|k| {
                self.public_keys
                    .iter()
                    .find(|p| private_matches(k, p))
                    .map(|p| (k, p))
            });
        match (encryption, signing) {
            (Some(a), Some(b)) => Ok([a, b]),
            _ => Err("backup_keys_missing"),
        }
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
