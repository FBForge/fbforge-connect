//! Separate bounded DPAPI snapshots, bound to the active profile and environment.
use crate::{
    destination_backup_model::Backup, environments::Environment, portable_archive,
    protocol::valid_session_id, vault,
};
use std::path::{Path, PathBuf};
pub struct Store {
    directory: PathBuf,
    profile: String,
    environment: Environment,
}
impl Store {
    pub fn new(root: &Path, profile: &str, environment: Environment) -> Result<Self, &'static str> {
        if !valid_session_id(profile) {
            return Err("invalid_input");
        }
        Ok(Self {
            directory: root.join(profile).join(environment.name()),
            profile: profile.into(),
            environment,
        })
    }
    fn purpose(&self, id: &str) -> Vec<u8> {
        format!(
            "FBForge Connect/destination-backup/v1/{}/{}/{id}",
            self.profile,
            self.environment.name()
        )
        .into_bytes()
    }
    fn path(&self, id: &str) -> Result<PathBuf, &'static str> {
        if !valid_session_id(id) {
            return Err("invalid_input");
        }
        Ok(self.directory.join(format!("{id}.destination")))
    }
    pub fn read(&self, id: &str) -> Result<Backup, &'static str> {
        let file = vault::read_bounded(&self.path(id)?, portable_archive::MAX_PLAIN + 4096)?;
        let mut plain = vault::protection::transform_with_purpose(&file, false, &self.purpose(id))?;
        let parsed =
            serde_json::from_slice::<serde_json::Value>(&plain).map_err(|_| "backup_invalid");
        plain.fill(0);
        let mut document = parsed?;
        // Migrate the unpublished v1 snapshots. Private copies remain solely in the profile.
        let legacy = document["version"] == 1;
        if legacy {
            document
                .as_object_mut()
                .ok_or("backup_invalid")?
                .remove("keys");
            document["version"] = 2.into();
        }
        let backup: Backup = serde_json::from_value(document).map_err(|_| "backup_invalid")?;
        backup.validate()?;
        if backup.id != id || backup.environment != self.environment {
            return Err("backup_invalid");
        }
        if legacy {
            let mut clean = serde_json::to_vec(&backup).map_err(|_| "backup_invalid")?;
            let protected =
                vault::protection::transform_with_purpose(&clean, true, &self.purpose(id));
            clean.fill(0);
            vault::write_protected(&self.path(id)?, &protected?)?;
        }
        Ok(backup)
    }
    pub fn list(&self) -> Result<Vec<serde_json::Value>, &'static str> {
        if !self
            .directory
            .try_exists()
            .map_err(|_| "backup_unavailable")?
        {
            return Ok(vec![]);
        }
        if !std::fs::symlink_metadata(&self.directory)
            .map_err(|_| "backup_unavailable")?
            .is_dir()
        {
            return Err("backup_invalid");
        }
        let mut items = vec![];
        for entry in std::fs::read_dir(&self.directory).map_err(|_| "backup_unavailable")? {
            let entry = entry.map_err(|_| "backup_unavailable")?;
            if entry.path().extension().is_some_and(|e| e == "destination") {
                if !entry
                    .file_type()
                    .map_err(|_| "backup_unavailable")?
                    .is_file()
                    || items.len() >= 20
                {
                    return Err("backup_invalid");
                }
                let id = entry
                    .path()
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .ok_or("backup_invalid")?
                    .to_owned();
                items.push(self.read(&id)?.summary());
            }
        }
        items.sort_by_key(|v| std::cmp::Reverse(v["capturedAt"].as_u64().unwrap_or(0)));
        Ok(items)
    }
    pub fn save_new(&self, backup: &Backup) -> Result<(), &'static str> {
        backup.validate()?;
        if backup.environment != self.environment {
            return Err("environment_mismatch");
        }
        let path = self.path(&backup.id)?;
        if path.try_exists().map_err(|_| "backup_unavailable")? {
            return Err("vault_conflict");
        }
        if self.list()?.len() >= 20 {
            return Err("vault_limit");
        }
        let mut plain = serde_json::to_vec(backup).map_err(|_| "backup_invalid")?;
        let result =
            vault::protection::transform_with_purpose(&plain, true, &self.purpose(&backup.id));
        plain.fill(0);
        let encrypted = result?;
        std::fs::create_dir_all(&self.directory).map_err(|_| "backup_unavailable")?;
        vault::write_protected(&path, &encrypted)
    }
    pub fn delete(&self, id: &str) -> Result<(), &'static str> {
        self.read(id)?;
        std::fs::remove_file(self.path(id)?).map_err(|_| "backup_unavailable")
    }
}
