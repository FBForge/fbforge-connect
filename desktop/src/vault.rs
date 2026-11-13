//! User-bound encrypted Windows profiles. No plaintext fallback and no renderer access to payloads.
use crate::environments::Environment;
use crate::protocol::{valid_session_id, ApiVersion, SessionRole};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_FILE: usize = 8 * 1024 * 1024;
const MAX_PROFILES: usize = 32;
// Persisted v1 format, shared with the renderer. Keep existing backups readable.
const BACKUP_MAGIC: &[u8] = b"FIT-Connect Test-Client protected profile v1\n";
pub const MAX_BACKUP_BYTES: usize = MAX_FILE + BACKUP_MAGIC.len();

/// Public UUID conveniences, stored with the protected profile; they grant no permissions.
#[derive(Serialize, Deserialize, Default, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileDefaults {
    pub source_destination: Option<String>,
    pub receiver_destination: Option<String>,
}
impl ProfileDefaults {
    pub fn validate(&self, api: ApiVersion) -> Result<(), &'static str> {
        if (api == ApiVersion::V2 && self.source_destination.is_some())
            || [&self.source_destination, &self.receiver_destination]
                .iter()
                .any(|value| value.as_ref().is_some_and(|id| !valid_session_id(id)))
        {
            return Err("vault_invalid");
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub version: u8,
    #[serde(default)]
    pub environment: Environment,
    pub profile_id: String,
    pub name: String,
    pub api_version: ApiVersion,
    pub role: SessionRole,
    pub client_id: String,
    pub client_secret: String,
    pub keys: Vec<serde_json::Value>,
    #[serde(default)]
    pub defaults: ProfileDefaults,
    #[serde(default)]
    pub answer_schemas: Vec<crate::answer_schema_model::AnswerSchema>,
}
impl Drop for Profile {
    fn drop(&mut self) {
        // Best effort: allocator/serialization copies cannot all be guaranteed erased.
        wipe_string(&mut self.client_secret);
        for item in &mut self.keys {
            wipe(item);
        }
    }
}
fn wipe(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(text) => wipe_string(text),
        serde_json::Value::Array(items) => items.iter_mut().for_each(wipe),
        serde_json::Value::Object(items) => items.values_mut().for_each(wipe),
        _ => {}
    }
}
pub(crate) fn wipe_string(value: &mut String) {
    // Best effort, like Profile::drop. Serialization and allocator copies cannot all be erased.
    unsafe {
        value.as_bytes_mut().fill(0);
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub environment: Option<Environment>,
    pub profile_id: String,
    pub name: String,
    pub client_id: Option<String>,
    pub api_version: Option<ApiVersion>,
    pub role: Option<SessionRole>,
    pub key_count: usize,
    pub available: bool,
}
impl Profile {
    pub fn validate(&self) -> Result<(), &'static str> {
        self.defaults.validate(self.api_version)?;
        crate::answer_schema_model::validate_library(&self.answer_schemas)?;
        if self.version != 1
            || !valid_session_id(&self.profile_id)
            || self.name.trim().is_empty()
            || self.name.len() > 120
            || self.name.chars().any(char::is_control)
            || self.client_id.trim().is_empty()
            || self.client_id.len() > 512
            || self.client_secret.trim().is_empty()
            || self.client_secret.len() > 8192
            || self.keys.len() > 176
            || self.keys.iter().any(|item| {
                !item.is_object() || serde_json::to_vec(item).map_or(true, |v| v.len() > 56000)
            })
        {
            return Err("vault_invalid");
        }
        Ok(())
    }
    pub fn summary(&self) -> ProfileSummary {
        ProfileSummary {
            environment: Some(self.environment),
            profile_id: self.profile_id.clone(),
            name: self.name.clone(),
            client_id: Some(self.client_id.clone()),
            api_version: Some(self.api_version),
            role: Some(self.role),
            key_count: self.keys.len(),
            available: true,
        }
    }
}
pub struct Vault {
    directory: PathBuf,
}
impl Vault {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }
    fn path(&self, id: &str) -> Result<PathBuf, &'static str> {
        if !valid_session_id(id) {
            return Err("invalid_input");
        }
        Ok(self.directory.join(format!("{}.profile", id)))
    }
    pub fn contains(&self, id: &str) -> Result<bool, &'static str> {
        Ok(self
            .path(id)?
            .try_exists()
            .map_err(|_| "vault_unavailable")?)
    }
    pub fn load(&self, id: &str) -> Result<Profile, &'static str> {
        let path = self.path(id)?;
        let metadata = fs::symlink_metadata(&path).map_err(|_| "vault_unavailable")?;
        if !metadata.is_file() || metadata.len() as usize > MAX_FILE {
            return Err("vault_invalid");
        }
        let protected = read_bounded(&path, MAX_FILE)?;
        if protected.len() > MAX_FILE {
            return Err("vault_invalid");
        }
        let mut plain = protection::decrypt(&protected)?;
        let result = serde_json::from_slice::<Profile>(&plain).map_err(|_| "vault_invalid");
        plain.fill(0);
        let profile = result?;
        profile.validate()?;
        if profile.profile_id != id {
            return Err("vault_invalid");
        }
        Ok(profile)
    }
    pub fn save(&self, profile: &Profile) -> Result<(), &'static str> {
        profile.validate()?;
        let path = self.path(&profile.profile_id)?;
        let mut plain = serde_json::to_vec(profile).map_err(|_| "vault_invalid")?;
        if plain.len() > MAX_FILE - 4096 {
            plain.fill(0);
            return Err("vault_invalid");
        }
        let result = protection::encrypt(&plain);
        plain.fill(0);
        let encrypted = result?;
        fs::create_dir_all(&self.directory).map_err(|_| "vault_unavailable")?;
        if !fs::symlink_metadata(&self.directory)
            .map_err(|_| "vault_unavailable")?
            .is_dir()
        {
            return Err("vault_unavailable");
        }
        let entries = fs::read_dir(&self.directory).map_err(|_| "vault_unavailable")?;
        if entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "profile"))
            .count()
            >= MAX_PROFILES
            && !path.exists()
        {
            return Err("vault_limit");
        }
        write_protected(&path, &encrypted)
    }
    /// Native-only encrypted backup. No command serializes these bytes to the WebView.
    pub fn backup(&self, id: &str) -> Result<Vec<u8>, &'static str> {
        let profile = self.load(id)?;
        let mut plain = serde_json::to_vec(&profile).map_err(|_| "vault_invalid")?;
        let encrypted = protection::encrypt(&plain);
        plain.fill(0);
        let mut result = BACKUP_MAGIC.to_vec();
        result.extend(encrypted?);
        if result.len() > MAX_BACKUP_BYTES {
            return Err("vault_invalid");
        }
        Ok(result)
    }
    /// Imports as the original profile; existing profiles are never silently replaced.
    pub fn restore_backup(&self, protected: &[u8]) -> Result<ProfileSummary, &'static str> {
        if protected.len() > MAX_BACKUP_BYTES || !protected.starts_with(BACKUP_MAGIC) {
            return Err("vault_invalid");
        }
        let mut plain = protection::decrypt(&protected[BACKUP_MAGIC.len()..])?;
        let result = serde_json::from_slice::<Profile>(&plain).map_err(|_| "vault_invalid");
        plain.fill(0);
        let profile = result?;
        profile.validate()?;
        if self.contains(&profile.profile_id)? {
            return Err("vault_conflict");
        }
        self.save(&profile)?;
        Ok(profile.summary())
    }
    pub fn write_backup(path: &Path, protected: &[u8]) -> Result<(), &'static str> {
        if protected.len() > MAX_BACKUP_BYTES || !protected.starts_with(BACKUP_MAGIC) {
            return Err("vault_invalid");
        }
        write_protected(path, protected)
    }
    pub fn list(&self) -> Result<Vec<ProfileSummary>, &'static str> {
        if !self.directory.exists() {
            return Ok(vec![]);
        }
        let mut summaries = Vec::new();
        for entry in fs::read_dir(&self.directory).map_err(|_| "vault_unavailable")? {
            let entry = entry.map_err(|_| "vault_unavailable")?;
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "profile") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|v| v.to_str())
                .ok_or("vault_invalid")?;
            if !valid_session_id(id) || summaries.len() >= MAX_PROFILES {
                return Err("vault_invalid");
            }
            summaries.push(match self.load(id) {
                Ok(profile) => profile.summary(),
                Err(_) => ProfileSummary {
                    environment: None,
                    profile_id: id.to_string(),
                    name: "Nicht lesbares Profil".into(),
                    client_id: None,
                    api_version: None,
                    role: None,
                    key_count: 0,
                    available: false,
                },
            });
        }
        summaries.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(summaries)
    }
    pub fn forget(&self, id: &str) -> Result<(), &'static str> {
        let path = self.path(id)?;
        if path.exists() {
            fs::remove_file(path).map_err(|_| "vault_unavailable")?;
        }
        if self.directory.exists() {
            for entry in fs::read_dir(&self.directory).map_err(|_| "vault_unavailable")? {
                let entry = entry.map_err(|_| "vault_unavailable")?;
                if entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.starts_with(&format!("{}.pending-", id)))
                {
                    fs::remove_file(entry.path()).map_err(|_| "vault_unavailable")?;
                }
            }
        }
        Ok(())
    }
}

pub fn read_bounded(path: &Path, maximum: usize) -> Result<Vec<u8>, &'static str> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "vault_unavailable")?;
    if !metadata.is_file() || metadata.len() as usize > maximum {
        return Err("vault_invalid");
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "vault_unavailable")?
        .take((maximum + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "vault_unavailable")?;
    if bytes.len() > maximum {
        return Err("vault_invalid");
    }
    Ok(bytes)
}
pub(crate) fn write_protected(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    if path.exists()
        && !fs::symlink_metadata(path)
            .map_err(|_| "vault_unavailable")?
            .is_file()
    {
        return Err("vault_unavailable");
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "vault_unavailable")?
        .as_nanos();
    let temp = path.with_extension(format!("pending-{}-{}", std::process::id(), nonce));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| "vault_unavailable")?;
    let result = (|| {
        file.write_all(bytes).map_err(|_| "vault_unavailable")?;
        file.sync_all().map_err(|_| "vault_unavailable")?;
        drop(file);
        protection::replace(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[path = "vault/protection.rs"]
pub(crate) mod protection;

#[cfg(test)]
#[path = "vault_tests.rs"]
mod tests;
