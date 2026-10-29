//! User/profile/environment/API-bound preferences, templates and local change journal. Never plaintext.
use crate::{
    environments::Environment,
    protocol::{valid_session_id, ApiVersion},
    vault,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    pub templates: Vec<Template>,
    pub history: Vec<Value>,
    pub favorites: Vec<String>,
    pub recent: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub changes: Value,
}

pub fn valid_changes(value: &Value) -> bool {
    let Some(fields) = value.as_object() else {
        return false;
    };
    !fields.is_empty() && fields.len() <= 6 && serde_json::to_vec(value).is_ok_and(|v| v.len() <= 24 * 1024)
        && fields.keys().all(|k| ["name", "status", "contactInformation", "metadataVersions", "publicServices", "processMessages"].contains(&k.as_str()))
        // Nested keys are public configuration fields only; imported credentials/keys are never retained.
        && public_tree(value, 0)
}
fn public_tree(value: &Value, depth: usize) -> bool {
    if depth > 12 {
        return false;
    }
    match value {
        Value::Object(map) => {
            map.len() <= 32
                && map.iter().all(|(key, v)| {
                    [
                        "name",
                        "status",
                        "contactInformation",
                        "metadataVersions",
                        "publicServices",
                        "processMessages",
                        "legalName",
                        "address",
                        "phone",
                        "email",
                        "unit",
                        "cc",
                        "identifier",
                        "regions",
                        "submissionSchemas",
                        "replyChannels",
                        "fitConnect",
                        "processStandards",
                        "schemaUri",
                        "mimeType",
                        "processModelId",
                        "messageId",
                        "schemas",
                    ]
                    .contains(&key.as_str())
                        && public_tree(v, depth + 1)
                })
        }
        Value::Array(values) => {
            values.len() <= 64 && values.iter().all(|v| public_tree(v, depth + 1))
        }
        Value::String(text) => text.len() <= 4096 && !text.chars().any(|c| c == '\0'),
        Value::Null => true,
        _ => false,
    }
}
fn valid_snapshot(value: &Value) -> bool {
    let Some(map) = value.as_object() else {
        return false;
    };
    if map.len() != 3
        || !map
            .keys()
            .all(|k| ["attemptId", "status", "changes"].contains(&k.as_str()))
        || !value["attemptId"].as_str().is_some_and(valid_session_id)
        || !value["status"].as_str().is_some_and(|s| {
            [
                "prepared",
                "running",
                "completed",
                "partial",
                "uncertain",
                "conflict",
                "failed",
                "expired",
                "cancelled",
            ]
            .contains(&s)
        })
    {
        return false;
    }
    let Some(rows) = value["changes"].as_array() else {
        return false;
    };
    rows.len() <= 10
        && rows.iter().all(|row| {
            row.as_object().is_some_and(|r| {
                r.len() == 6
                    && r.keys().all(|k| {
                        [
                            "destinationId",
                            "name",
                            "beforeJson",
                            "afterJson",
                            "status",
                            "error",
                        ]
                        .contains(&k.as_str())
                    })
            }) && row["destinationId"].as_str().is_some_and(valid_session_id)
                && (row["name"].is_null() || row["name"].as_str().is_some_and(|s| s.len() <= 512))
                && (row["error"].is_null()
                    || row["error"].as_str().is_some_and(|s| {
                        s.len() <= 64 && s.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')
                    }))
                && row["status"].as_str().is_some_and(|s| {
                    [
                        "prepared",
                        "unchanged",
                        "updated",
                        "failed",
                        "uncertain",
                        "skipped",
                    ]
                    .contains(&s)
                })
                && ["beforeJson", "afterJson"].iter().all(|key| {
                    row[key].as_str().is_some_and(|s| {
                        s.len() <= 16384
                            && serde_json::from_str::<Value>(s)
                                .is_ok_and(|v| v.is_object() && public_tree(&v, 0))
                    })
                })
        })
}
impl Workspace {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.history.iter().any(|row| {
            row.as_object().is_none_or(|r| r.len() != 2)
                || row["recordedAt"].as_u64().is_none()
                || !valid_snapshot(&row["snapshot"])
        }) {
            return Err("vault_invalid");
        }
        if self.templates.len() > 20
            || self.history.len() > 100
            || self.favorites.len() > 20
            || self.recent.len() > 10
            || self
                .favorites
                .iter()
                .chain(self.recent.iter())
                .any(|id| !valid_session_id(id))
            || self.history.iter().any(|row| {
                row.as_object().is_none_or(|r| r.len() != 2)
                    || row["recordedAt"].as_u64().is_none()
                    || !valid_snapshot(&row["snapshot"])
            })
            || self.templates.iter().any(|t| {
                !valid_session_id(&t.id)
                    || t.name.trim().is_empty()
                    || t.name.len() > 160
                    || t.name.chars().any(char::is_control)
                    || !valid_changes(&t.changes)
            })
            || self
                .templates
                .iter()
                .enumerate()
                .any(|(i, t)| self.templates[..i].iter().any(|p| p.id == t.id))
            || serde_json::to_vec(self).map_err(|_| "vault_invalid")?.len() > 4 * 1024 * 1024
        {
            return Err("vault_invalid");
        }
        Ok(())
    }
    pub fn remember(&mut self, id: String, favorite: Option<bool>) -> Result<(), &'static str> {
        if !valid_session_id(&id) {
            return Err("invalid_input");
        }
        if let Some(enabled) = favorite {
            self.favorites.retain(|item| item != &id);
            if enabled {
                if self.favorites.len() >= 20 {
                    return Err("vault_limit");
                }
                self.favorites.push(id);
            }
        } else {
            self.recent.retain(|item| item != &id);
            self.recent.insert(0, id);
            self.recent.truncate(10);
        }
        self.validate()
    }
    pub fn journal(&mut self, mut snapshot: Value) -> Result<(), &'static str> {
        if !valid_snapshot(&snapshot) {
            return Err("vault_invalid");
        }
        let attempt = snapshot["attemptId"]
            .as_str()
            .ok_or("vault_invalid")?
            .to_string();
        if snapshot["changes"]
            .as_array()
            .is_some_and(|rows| rows.is_empty())
        {
            if let Some(previous) = self
                .history
                .iter()
                .find(|row| row["snapshot"]["attemptId"] == attempt)
            {
                snapshot["changes"] = previous["snapshot"]["changes"].clone();
            }
        }
        self.history
            .retain(|row| row["snapshot"]["attemptId"] != attempt);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "vault_unavailable")?
            .as_millis() as u64;
        self.history
            .insert(0, serde_json::json!({"recordedAt":now,"snapshot":snapshot}));
        self.history.truncate(100);
        while self.history.len() > 1
            && serde_json::to_vec(self).map_err(|_| "vault_invalid")?.len() > 4 * 1024 * 1024
        {
            self.history.pop();
        }
        self.validate()
    }
}
pub struct WorkspaceStore {
    path: PathBuf,
    purpose: Vec<u8>,
}
impl WorkspaceStore {
    pub fn new(
        root: &Path,
        profile: &str,
        environment: Environment,
        api: ApiVersion,
    ) -> Result<Self, &'static str> {
        if !valid_session_id(profile) {
            return Err("invalid_input");
        }
        let api = if api == ApiVersion::V2 { "v2" } else { "v3" };
        Ok(Self {
            path: root
                .join(profile)
                .join(format!("{}-{api}.workspace", environment.name())),
            purpose: format!(
                "FBForge Connect/workspace/v1/{profile}/{}/{api}",
                environment.name()
            )
            .into_bytes(),
        })
    }
    pub fn read(&self) -> Result<Workspace, &'static str> {
        if !self.path.try_exists().map_err(|_| "vault_unavailable")? {
            return Ok(Workspace::default());
        }
        let encrypted = vault::read_bounded(&self.path, 5 * 1024 * 1024)?;
        let mut plain =
            vault::protection::transform_with_purpose(&encrypted, false, &self.purpose)?;
        let result = serde_json::from_slice::<Workspace>(&plain).map_err(|_| "vault_invalid");
        plain.fill(0);
        let data = result?;
        data.validate()?;
        Ok(data)
    }
    pub fn save(&self, workspace: &Workspace) -> Result<(), &'static str> {
        workspace.validate()?;
        let mut plain = serde_json::to_vec(workspace).map_err(|_| "vault_invalid")?;
        let encrypted = vault::protection::transform_with_purpose(&plain, true, &self.purpose);
        plain.fill(0);
        let encrypted = encrypted?;
        std::fs::create_dir_all(self.path.parent().ok_or("vault_invalid")?)
            .map_err(|_| "vault_unavailable")?;
        vault::write_protected(&self.path, &encrypted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "11111111-1111-4111-8111-111111111111";
    #[test]
    fn templates_reject_keys_and_credentials_at_every_level() {
        assert!(valid_changes(
            &serde_json::json!({"name":"Template", "metadataVersions":["3.0.0"]})
        ));
        for value in [
            serde_json::json!({"clientSecret":"no"}),
            serde_json::json!({"publicServices":[{"privateKey":"no"}]}),
            serde_json::json!({"name":true}),
        ] {
            assert!(!valid_changes(&value));
        }
    }
    #[test]
    fn recent_deduplicates_and_favorite_does_not_add_history() {
        let mut data = Workspace::default();
        data.remember(ID.into(), None).unwrap();
        data.remember(ID.into(), None).unwrap();
        data.remember(ID.into(), Some(true)).unwrap();
        assert_eq!(data.recent.len(), 1);
        assert_eq!(data.favorites.len(), 1);
        assert!(data.history.is_empty());
        assert!(data.remember("../another".into(), None).is_err());
    }
    #[test]
    fn storage_is_bound_to_profile_api_and_environment() {
        let a = WorkspaceStore::new(
            Path::new("/tmp/test"),
            ID,
            Environment::TEST,
            ApiVersion::V2,
        )
        .unwrap();
        for (env, api) in [
            (Environment::PROD, ApiVersion::V2),
            (Environment::TEST, ApiVersion::V3),
        ] {
            let b = WorkspaceStore::new(Path::new("/tmp/test"), ID, env, api).unwrap();
            assert_ne!(a.path, b.path);
            assert_ne!(a.purpose, b.purpose);
        }
        assert!(
            WorkspaceStore::new(Path::new("/tmp"), "../x", Environment::TEST, ApiVersion::V2)
                .is_err()
        );
    }
    fn snapshot(status: &str) -> Value {
        serde_json::json!({"attemptId":ID,"status":status,"changes":[{"destinationId":ID,"name":"Synthetic","beforeJson":"{\"name\":\"Before\"}","afterJson":"{\"name\":\"After\"}","status":"prepared","error":null}]})
    }
    #[test]
    fn journal_replaces_attempts_and_keeps_before_after_values_when_cancelled() {
        let mut data = Workspace::default();
        data.journal(snapshot("prepared")).unwrap();
        data.journal(snapshot("completed")).unwrap();
        assert_eq!(data.history.len(), 1);
        data.journal(serde_json::json!({"attemptId":ID,"status":"cancelled","changes":[]}))
            .unwrap();
        assert_eq!(data.history[0]["snapshot"]["status"], "cancelled");
        assert_eq!(
            data.history[0]["snapshot"]["changes"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let mut invalid = snapshot("completed");
        invalid["changes"][0]["afterJson"] = serde_json::json!("{\"clientSecret\":\"never\"}");
        assert!(data.journal(invalid).is_err());
        assert_eq!(data.history[0]["snapshot"]["status"], "cancelled");
    }
    #[test]
    fn retention_is_bounded_and_corrupt_or_unprotected_history_is_rejected() {
        let mut data = Workspace::default();
        for i in 0..105 {
            let mut row = snapshot("completed");
            row["attemptId"] = serde_json::json!(format!("{i:08x}-1111-4111-8111-111111111111"));
            data.journal(row).unwrap();
        }
        assert_eq!(data.history.len(), 100);
        data.history
            .push(serde_json::json!({"recordedAt":0,"snapshot":{"privateKey":"bad"}}));
        assert!(data.validate().is_err());
        #[cfg(not(windows))]
        {
            let root =
                std::env::temp_dir().join(format!("connect-workspace-test-{}", std::process::id()));
            let store = WorkspaceStore::new(&root, ID, Environment::TEST, ApiVersion::V2).unwrap();
            assert_eq!(
                store.save(&Workspace::default()).unwrap_err(),
                "vault_unsupported"
            );
            assert!(!root.exists());
        }
    }
}
