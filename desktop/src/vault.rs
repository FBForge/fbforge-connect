//! User-bound encrypted Windows profiles. No plaintext fallback and no renderer access to payloads.
use crate::protocol::{valid_session_id, ApiVersion, SessionRole};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_FILE: usize = 8 * 1024 * 1024;
const MAX_PROFILES: usize = 32;
const BACKUP_MAGIC: &[u8] = b"FIT-Connect Test-Client protected profile v1\n";
pub const MAX_BACKUP_BYTES: usize = MAX_FILE + BACKUP_MAGIC.len();

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub version: u8,
    pub profile_id: String,
    pub name: String,
    pub api_version: ApiVersion,
    pub role: SessionRole,
    pub client_id: String,
    pub client_secret: String,
    pub keys: Vec<serde_json::Value>,
}
impl Drop for Profile {
    fn drop(&mut self) {
        // Best effort: allocator/serialization copies cannot all be guaranteed erased.
        unsafe {
            self.client_secret.as_bytes_mut().fill(0);
        }
        for item in &mut self.keys {
            wipe(item);
        }
    }
}
fn wipe(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(text) => unsafe {
            text.as_bytes_mut().fill(0);
        },
        serde_json::Value::Array(items) => items.iter_mut().for_each(wipe),
        serde_json::Value::Object(items) => items.values_mut().for_each(wipe),
        _ => {}
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub profile_id: String,
    pub name: String,
    pub api_version: Option<ApiVersion>,
    pub role: Option<SessionRole>,
    pub key_count: usize,
    pub available: bool,
}
impl Profile {
    pub fn validate(&self) -> Result<(), &'static str> {
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
            profile_id: self.profile_id.clone(),
            name: self.name.clone(),
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
                    profile_id: id.to_string(),
                    name: "Nicht lesbares Profil".into(),
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
fn write_protected(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
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

#[cfg(not(windows))]
mod protection {
    use super::*;
    pub fn encrypt(_: &[u8]) -> Result<Vec<u8>, &'static str> {
        Err("vault_unsupported")
    }
    pub fn decrypt(_: &[u8]) -> Result<Vec<u8>, &'static str> {
        Err("vault_unsupported")
    }
    pub fn replace(_: &Path, _: &Path) -> Result<(), &'static str> {
        Err("vault_unsupported")
    }
}
#[cfg(windows)]
mod protection {
    use super::*;
    use std::{ffi::c_void, os::windows::ffi::OsStrExt, ptr};
    #[repr(C)]
    struct Blob {
        size: u32,
        data: *mut u8,
    }
    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const Blob,
            description: *const u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const Blob,
            description: *mut *mut u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    fn transform(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_FILE {
            return Err("vault_invalid");
        }
        let input = Blob {
            size: bytes.len() as u32,
            data: bytes.as_ptr() as *mut u8,
        };
        let purpose = b"FIT-Connect Test-Client / user profile / v1";
        let entropy = Blob {
            size: purpose.len() as u32,
            data: purpose.as_ptr() as *mut u8,
        };
        let mut output = Blob {
            size: 0,
            data: ptr::null_mut(),
        };
        // UI forbidden; absence of LOCAL_MACHINE keeps the vault bound to this Windows user.
        let success = unsafe {
            if encrypt {
                CryptProtectData(
                    &input,
                    ptr::null(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    ptr::null_mut(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            }
        };
        if success == 0 {
            return Err("vault_unavailable");
        }
        let result = if output.data.is_null() || output.size as usize > MAX_FILE {
            Err("vault_invalid")
        } else {
            Ok(unsafe { std::slice::from_raw_parts(output.data, output.size as usize) }.to_vec())
        };
        if !output.data.is_null() {
            unsafe {
                std::slice::from_raw_parts_mut(output.data, output.size as usize).fill(0);
                LocalFree(output.data.cast());
            }
        }
        result
    }
    pub fn encrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        transform(bytes, true)
    }
    pub fn decrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        transform(bytes, false)
    }
    pub fn replace(source: &Path, destination: &Path) -> Result<(), &'static str> {
        let from: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        // REPLACE_EXISTING | WRITE_THROUGH, source and destination reside in the same directory.
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 1 | 8) } == 0 {
            Err("vault_unavailable")
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Profile {
        Profile {
            version: 1,
            profile_id: "11111111-1111-4111-8111-111111111111".into(),
            name: "TEST-Arbeitsplatz".into(),
            api_version: ApiVersion::V3,
            role: SessionRole::OnlineService,
            client_id: "synthetic-client".into(),
            client_secret: "synthetic-secret-marker".into(),
            keys: vec![],
        }
    }
    #[test]
    fn profile_validation_and_paths_are_strict() {
        let vault = Vault::new(std::env::temp_dir().join("fit-connect-vault-validation"));
        assert!(vault.path("../../elsewhere").is_err());
        let mut profile = sample();
        assert!(profile.validate().is_ok());
        profile.version = 2;
        assert!(profile.validate().is_err());
        profile.version = 1;
        profile.name = "bad\nname".into();
        assert!(profile.validate().is_err());
        let summary = serde_json::to_string(&sample().summary()).unwrap();
        assert!(!summary.contains("synthetic-client"));
        assert!(!summary.contains("synthetic-secret-marker"));
    }
    #[test]
    fn malformed_backup_never_becomes_a_profile() {
        let store = Vault::new(std::env::temp_dir().join("fit-connect-invalid-backup"));
        assert!(store.restore_backup(b"synthetic-plaintext-secret").is_err());
        assert!(store
            .restore_backup(&vec![0; MAX_BACKUP_BYTES + 1])
            .is_err());
    }
    #[cfg(windows)]
    #[test]
    fn protected_backup_roundtrip_conflict_tamper_and_atomic_file() {
        let root = std::env::temp_dir().join(format!("fit-connect-backup-{}", std::process::id()));
        let source = Vault::new(root.join("source"));
        let destination = Vault::new(root.join("destination"));
        let profile = sample();
        source.save(&profile).unwrap();
        let backup = source.backup(&profile.profile_id).unwrap();
        assert!(!backup
            .windows(b"synthetic-secret-marker".len())
            .any(|chunk| chunk == b"synthetic-secret-marker"));
        assert_eq!(
            destination.restore_backup(&backup).unwrap().profile_id,
            profile.profile_id
        );
        assert_eq!(
            destination.load(&profile.profile_id).unwrap().client_secret,
            profile.client_secret
        );
        assert_eq!(
            destination.restore_backup(&backup).err(),
            Some("vault_conflict")
        );
        let path = root.join("saved.fctest-profile");
        Vault::write_backup(&path, &backup).unwrap();
        Vault::write_backup(&path, &backup).unwrap();
        assert_eq!(read_bounded(&path, MAX_BACKUP_BYTES).unwrap(), backup);
        destination.forget(&profile.profile_id).unwrap();
        let mut damaged = backup;
        let last = damaged.len() - 1;
        damaged[last] ^= 1;
        assert!(destination.restore_backup(&damaged).is_err());
        assert!(destination.list().unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(not(windows))]
    #[test]
    fn unsupported_platform_cannot_fall_back_to_plaintext() {
        assert_eq!(
            protection::encrypt(b"synthetic-secret-marker").unwrap_err(),
            "vault_unsupported"
        );
    }
    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip_tamper_atomic_update_and_forget() {
        let directory =
            std::env::temp_dir().join(format!("fit-connect-vault-{}", std::process::id()));
        let vault = Vault::new(directory.clone());
        let mut profile = sample();
        vault.save(&profile).unwrap();
        let path = vault.path(&profile.profile_id).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(!bytes
            .windows(b"synthetic-secret-marker".len())
            .any(|v| v == b"synthetic-secret-marker"));
        assert_eq!(
            vault.load(&profile.profile_id).unwrap().client_secret,
            profile.client_secret
        );
        profile.name = "Geändert".into();
        vault.save(&profile).unwrap();
        assert_eq!(vault.list().unwrap()[0].name, "Geändert");
        let mut broken = bytes;
        let last = broken.len() - 1;
        broken[last] ^= 1;
        fs::write(&path, broken).unwrap();
        assert!(vault.load(&profile.profile_id).is_err());
        assert!(!vault.list().unwrap()[0].available);
        vault.forget(&profile.profile_id).unwrap();
        assert!(vault.list().unwrap().is_empty());
        fs::remove_dir_all(directory).unwrap();
    }
}
