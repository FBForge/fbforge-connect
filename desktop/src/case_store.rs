//! Separate user-bound content storage, never included in credential/profile backups.
use crate::{protocol::valid_session_id, vault::protection};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
const MAX_RECORD: u64 = 128 * 1024 * 1024;
const MAX_STORE: u64 = 256 * 1024 * 1024;
const MAX_BLOCK: usize = 65536;
const MAGIC: &[u8] = b"FBForge Connect case v1\n";

pub struct CaseStore {
    root: PathBuf,
    purpose: Vec<u8>,
}
impl CaseStore {
    pub fn new(root: PathBuf, profile: &str, api: &str) -> Result<Self, &'static str> {
        if !valid_session_id(profile) || !["v2", "v3"].contains(&api) {
            return Err("invalid_input");
        }
        Ok(Self {
            root: root.join(profile).join(api),
            purpose: format!("FBForge Connect/cases/v1/{profile}/{api}").into_bytes(),
        })
    }
    fn path(&self, id: &str) -> Result<PathBuf, &'static str> {
        if !valid_session_id(id) {
            return Err("invalid_input");
        }
        Ok(self.root.join(format!("{id}.case")))
    }
    pub fn enabled(&self) -> Result<bool, &'static str> {
        let path = self.root.join("settings");
        if !path.try_exists().map_err(|_| "vault_unavailable")? {
            return Ok(cfg!(windows));
        }
        let protected = crate::vault::read_bounded(&path, MAX_BLOCK)?;
        let mut plain = protection::transform_with_purpose(&protected, false, &self.purpose)?;
        let enabled = match plain.as_slice() {
            b"enabled-v1" => Ok(true),
            b"disabled-v1" => Ok(false),
            _ => Err("vault_invalid"),
        };
        plain.fill(0);
        enabled
    }
    pub fn enable(&self, enabled: bool) -> Result<(), &'static str> {
        let path = self.root.join("settings");
        let value: &[u8] = if enabled {
            b"enabled-v1"
        } else {
            b"disabled-v1"
        };
        let bytes = protection::transform_with_purpose(value, true, &self.purpose)?;
        fs::create_dir_all(&self.root).map_err(|_| "vault_unavailable")?;
        crate::vault::write_protected(&path, &bytes)
    }
    pub fn records(&self) -> Result<Vec<Value>, &'static str> {
        if !self.root.try_exists().map_err(|_| "vault_unavailable")? {
            return Ok(vec![]);
        }
        let mut records = vec![];
        for e in fs::read_dir(&self.root).map_err(|_| "vault_unavailable")? {
            let path = e.map_err(|_| "vault_unavailable")?.path();
            if path.extension().is_some_and(|v| v == "case") {
                if records.len() >= 100 {
                    return Err("vault_limit");
                }
                let id = path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .ok_or("vault_invalid")?;
                if !valid_session_id(id) {
                    return Err("vault_invalid");
                }
                records.push(match self.header(id) {
                    Ok(header) => header["summary"].clone(),
                    Err(_) => serde_json::json!({"recordId":id,"revision":id,"kind":"submission","direction":"received","title":"Beschädigte lokale Kopie","createdAt":null,"status":"unavailable","caseId":null,"submissionId":null,"replyId":null,"destinationId":null,"attachmentCount":0,"totalBytes":0,"warnings":[],"available":false}),
                });
            }
        }
        Ok(records)
    }
    fn open(&self, id: &str) -> Result<File, &'static str> {
        let path = self.path(id)?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "vault_unavailable")?;
        if !meta.is_file() || meta.len() > MAX_RECORD {
            return Err("vault_invalid");
        }
        let mut file = File::open(path).map_err(|_| "vault_unavailable")?;
        let mut magic = vec![0; MAGIC.len()];
        file.read_exact(&mut magic).map_err(|_| "vault_invalid")?;
        if magic != MAGIC {
            return Err("vault_invalid");
        }
        Ok(file)
    }
    fn block(
        &self,
        file: &mut File,
        id: &str,
        number: usize,
        revision: Option<&str>,
    ) -> Result<Value, &'static str> {
        let mut size = [0; 4];
        file.read_exact(&mut size).map_err(|_| "vault_invalid")?;
        let length = u32::from_be_bytes(size) as usize;
        if length == 0 || length > MAX_BLOCK {
            return Err("vault_invalid");
        }
        let mut protected = vec![0; length];
        file.read_exact(&mut protected)
            .map_err(|_| "vault_invalid")?;
        let mut plain = protection::transform_with_purpose(
            &protected,
            false,
            &self.block_purpose(id, number, revision),
        )?;
        let result = serde_json::from_slice(&plain).map_err(|_| "vault_invalid");
        plain.fill(0);
        result
    }
    fn block_purpose(&self, id: &str, number: usize, revision: Option<&str>) -> Vec<u8> {
        [
            self.purpose.as_slice(),
            format!("/{id}/{number}/{}", revision.unwrap_or("manifest")).as_bytes(),
        ]
        .concat()
    }
    pub fn header(&self, id: &str) -> Result<Value, &'static str> {
        let value = self.block(&mut self.open(id)?, id, 0, None)?;
        if value["version"] != 1
            || value["summary"]["recordId"] != id
            || !value["pageCount"]
                .as_u64()
                .is_some_and(|n| n > 0 && n <= 21)
        {
            return Err("vault_invalid");
        }
        Ok(value)
    }
    pub fn resource(
        &self,
        id: &str,
        operation: &str,
        content_id: Option<&str>,
        offset: usize,
    ) -> Result<Value, &'static str> {
        let mut file = self.open(id)?;
        let header = self.block(&mut file, id, 0, None)?;
        if header["summary"]["recordId"] != id {
            return Err("vault_invalid");
        }
        let page_count = header["pageCount"]
            .as_u64()
            .filter(|n| *n > 0 && *n <= 21)
            .ok_or("vault_invalid")? as usize;
        let revision = header["summary"]["revision"]
            .as_str()
            .filter(|id| valid_session_id(id))
            .ok_or("vault_invalid")?;
        let mut parts = vec![];
        for number in 1..=page_count {
            let page = self.block(&mut file, id, number, Some(revision))?;
            if page["recordId"] != id {
                return Err("vault_invalid");
            }
            parts.extend(page["parts"].as_array().ok_or("vault_invalid")?.clone());
            if operation == "parts" && page["offset"] == offset {
                return Ok(page);
            }
        }
        if operation != "read" {
            return Err("invalid_input");
        }
        let count = header["blocks"].as_u64().ok_or("vault_invalid")?;
        if count > 5000 {
            return Err("vault_invalid");
        }
        if offset % 24576 != 0 {
            return Err("invalid_input");
        }
        let mut target = page_count + 1;
        let mut found = false;
        for part in parts {
            let length = part["totalBytes"]
                .as_u64()
                .filter(|n| *n <= 32 * 1024 * 1024)
                .ok_or("vault_invalid")? as usize;
            if part["contentId"].as_str() == content_id {
                if offset > length {
                    return Err("invalid_input");
                }
                target += offset / 24576;
                found = true;
                break;
            }
            target += length.div_ceil(24576).max(1);
        }
        if !found || target > page_count + count as usize {
            return Err("invalid_resource");
        }
        for number in page_count + 1..=target {
            if number == target {
                let value = self.block(&mut file, id, number, Some(revision))?;
                if value["recordId"] != id
                    || value["contentId"].as_str() != content_id
                    || value["byteOffset"] != offset
                {
                    return Err("vault_invalid");
                }
                return Ok(value);
            }
            let mut size = [0; 4];
            file.read_exact(&mut size).map_err(|_| "vault_invalid")?;
            let length = u32::from_be_bytes(size) as usize;
            if length == 0 || length > MAX_BLOCK {
                return Err("vault_invalid");
            }
            let position = file
                .seek(SeekFrom::Current(length as i64))
                .map_err(|_| "vault_invalid")?;
            if position > MAX_RECORD {
                return Err("vault_invalid");
            }
        }
        Err("invalid_resource")
    }
    pub fn delete(&self, id: &str) -> Result<(), &'static str> {
        let path = self.path(id)?;
        if path.try_exists().map_err(|_| "vault_unavailable")? {
            fs::remove_file(path).map_err(|_| "vault_unavailable")?;
        }
        Ok(())
    }
    pub fn begin(&self, id: &str, total: u64) -> Result<(File, PathBuf), &'static str> {
        fs::create_dir_all(&self.root).map_err(|_| "vault_unavailable")?;
        let used = fs::read_dir(&self.root)
            .map_err(|_| "vault_unavailable")?
            .try_fold(0u64, |sum, e| {
                let meta = e
                    .map_err(|_| "vault_unavailable")?
                    .metadata()
                    .map_err(|_| "vault_unavailable")?;
                Ok::<_, &'static str>(sum + meta.len())
            })?;
        let destination = self.path(id)?;
        let previous = fs::metadata(&destination).map(|m| m.len()).unwrap_or(0);
        if total > 88 * 1024 * 1024
            || used.saturating_sub(previous) + total * 3 / 2 + 256 * 1024 > MAX_STORE
            || (!destination.exists() && self.records()?.len() >= 100)
        {
            return Err("vault_limit");
        }
        let path = self
            .path(id)?
            .with_extension(format!("pending-{}", std::process::id()));
        // An interrupted encrypted staging file is safe to remove; the previous committed case remains.
        if path.exists() {
            fs::remove_file(&path).map_err(|_| "vault_unavailable")?;
        }
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .map_err(|_| "vault_unavailable")?;
        file.write_all(MAGIC).map_err(|_| "vault_unavailable")?;
        Ok((file, path))
    }
    pub fn write(
        &self,
        file: &mut File,
        id: &str,
        number: usize,
        value: &Value,
        revision: Option<&str>,
    ) -> Result<(), &'static str> {
        let mut plain = serde_json::to_vec(value).map_err(|_| "vault_invalid")?;
        if plain.len() > MAX_BLOCK - 4096 {
            plain.fill(0);
            return Err("vault_invalid");
        }
        let encrypted = protection::transform_with_purpose(
            &plain,
            true,
            &self.block_purpose(id, number, revision),
        );
        plain.fill(0);
        let encrypted = encrypted?;
        file.write_all(&(encrypted.len() as u32).to_be_bytes())
            .and_then(|_| file.write_all(&encrypted))
            .map_err(|_| "vault_unavailable")
    }
    pub fn commit(&self, file: File, temp: &Path, id: &str) -> Result<(), &'static str> {
        file.sync_all().map_err(|_| "vault_unavailable")?;
        if file.metadata().map_err(|_| "vault_unavailable")?.len() > MAX_RECORD {
            return Err("vault_limit");
        }
        drop(file);
        protection::replace(temp, &self.path(id)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PROFILE: &str = "11111111-1111-4111-8111-111111111111";
    const RECORD: &str = "22222222-2222-4222-8222-222222222222";
    const PART: &str = "33333333-3333-4333-8333-333333333333";
    const REVISION: &str = "44444444-4444-4444-8444-444444444444";
    #[cfg(windows)]
    #[test]
    fn persistence_defaults_on_and_explicit_opt_out_survives_restart_with_profile_isolation() {
        let root = std::env::temp_dir().join(format!(
            "connect-retention-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
        assert!(store.enabled().unwrap());
        assert!(!root.exists());
        store.enable(false).unwrap();
        let encrypted = fs::read(store.root.join("settings")).unwrap();
        assert_ne!(encrypted, b"disabled-v1");
        drop(store);
        let reopened = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
        assert!(!reopened.enabled().unwrap());
        assert!(CaseStore::new(root.clone(), PROFILE, "v3")
            .unwrap()
            .enabled()
            .unwrap());
        assert!(CaseStore::new(root.clone(), RECORD, "v2")
            .unwrap()
            .enabled()
            .unwrap());
        reopened.enable(true).unwrap();
        assert!(CaseStore::new(root.clone(), PROFILE, "v2")
            .unwrap()
            .enabled()
            .unwrap());
        let mut corrupt = encrypted;
        corrupt[0] ^= 1;
        fs::write(reopened.root.join("settings"), corrupt).unwrap();
        assert!(reopened.enabled().is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn identity_paths_and_scope_are_fixed() {
        assert!(CaseStore::new(PathBuf::from("."), "../elsewhere", "v3").is_err());
        assert!(CaseStore::new(PathBuf::from("."), PROFILE, "prod").is_err());
        let store = CaseStore::new(PathBuf::from("."), PROFILE, "v3").unwrap();
        assert!(store.path("../elsewhere").is_err());
        assert_ne!(
            store.block_purpose(RECORD, 1, Some(REVISION)),
            store.block_purpose(PART, 1, Some(REVISION))
        );
        assert_ne!(
            store.block_purpose(RECORD, 1, Some(REVISION)),
            store.block_purpose(RECORD, 2, Some(REVISION))
        );
        assert_ne!(
            store.block_purpose(RECORD, 1, Some(REVISION)),
            store.block_purpose(RECORD, 1, Some(PROFILE))
        );
    }
    #[cfg(not(windows))]
    #[test]
    fn no_unencrypted_content_fallback() {
        assert_eq!(
            protection::transform_with_purpose(b"fictional", true, b"cases"),
            Err("vault_unsupported")
        );
    }
    #[cfg(windows)]
    fn saved(store: &CaseStore) {
        let (mut file, temp) = store.begin(RECORD, 100).unwrap();
        let header = serde_json::json!({"version":1,"summary":{"recordId":RECORD,"revision":REVISION},"pageCount":1,"blocks":1});
        let page = serde_json::json!({"recordId":RECORD,"offset":0,"total":1,"parts":[{"contentId":PART,"totalBytes":14}]});
        let chunk = serde_json::json!({"recordId":RECORD,"contentId":PART,"byteOffset":0,"totalBytes":14,"chunk":"RmlrdGl2ZXIgQW50cmFn","complete":true});
        store.write(&mut file, RECORD, 0, &header, None).unwrap();
        store
            .write(&mut file, RECORD, 1, &page, Some(REVISION))
            .unwrap();
        store
            .write(&mut file, RECORD, 2, &chunk, Some(REVISION))
            .unwrap();
        store.commit(file, &temp, RECORD).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn protected_roundtrip_restart_tamper_scope_and_atomic_replacement() {
        let root = std::env::temp_dir().join(format!(
            "connect-case-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
        assert!(store.enabled().unwrap());
        store.enable(true).unwrap();
        saved(&store);
        let encrypted = fs::read(store.path(RECORD).unwrap()).unwrap();
        assert!(!encrypted
            .windows(RECORD.len())
            .any(|b| b == RECORD.as_bytes()));
        assert!(!encrypted.windows(10).any(|b| b == b"RmlrdGl2ZX"));
        drop(store);
        let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
        assert!(store.enabled().unwrap());
        assert_eq!(store.records().unwrap().len(), 1);
        assert_eq!(
            store.resource(RECORD, "read", Some(PART), 0).unwrap()["chunk"],
            "RmlrdGl2ZXIgQW50cmFn"
        );
        assert!(store.resource(RECORD, "read", Some(PROFILE), 0).is_err());
        // Aborted staging leaves the committed copy usable.
        let (file, temp) = store.begin(RECORD, 100).unwrap();
        drop(file);
        fs::remove_file(temp).unwrap();
        assert!(store.header(RECORD).is_ok());
        saved(&store); // Replace existing, not append or create a second logical record.
        let foreign = CaseStore::new(root.clone(), PART, "v3").unwrap();
        fs::create_dir_all(&foreign.root).unwrap();
        fs::copy(store.path(RECORD).unwrap(), foreign.path(RECORD).unwrap()).unwrap();
        assert!(foreign.header(RECORD).is_err());
        let foreign_api = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
        fs::create_dir_all(&foreign_api.root).unwrap();
        fs::copy(
            store.path(RECORD).unwrap(),
            foreign_api.path(RECORD).unwrap(),
        )
        .unwrap();
        assert!(foreign_api.header(RECORD).is_err());
        let mut damaged = encrypted;
        *damaged.last_mut().unwrap() ^= 1;
        fs::write(store.path(RECORD).unwrap(), damaged).unwrap();
        assert!(store.resource(RECORD, "read", Some(PART), 0).is_err());
        assert!(store.begin(PART, 300 * 1024 * 1024).is_err());
        store.delete(RECORD).unwrap();
        assert!(store.records().unwrap().is_empty());
        store.enable(false).unwrap();
        assert!(!store.enabled().unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
