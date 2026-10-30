//! Named local test packs, encrypted for the Windows user. No network or arbitrary paths.
use crate::{protocol::valid_session_id, vault::protection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};

const MAX_PACK: usize = 8 * 1024 * 1024 - 4096;
const MAX_ENTRIES: usize = 32;
const MAX_STORE: u64 = 64 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum LibraryRequest {
    List {},
    Read { id: String },
    Save { id: String, pack: Pack },
    Delete { id: String },
    FlowList {},
    FlowRead { id: String },
    FlowSave { id: String, flow: flows::Flow },
    FlowDelete { id: String },
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pack {
    format: String,
    version: u8,
    name: String,
    cases: Vec<TestCase>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct TestCase {
    id: String,
    name: String,
    request: Value,
    reply: Option<Value>,
    receipt: String,
    schemas: Vec<Schema>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Message {
    schema_uri: String,
    mime_type: String,
    data: String,
    attachments: Vec<Attachment>,
    process_message: Option<Process>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service_identifier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_offer: Option<ReplyOffer>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplyOffer {
    schema_uri: String,
    mime_type: String,
    process_messages: Vec<Process>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Attachment {
    file_name: String,
    mime_type: String,
    description: Option<String>,
    base64: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Process {
    process_model_id: String,
    message_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Schema {
    uri: String,
    mime_type: String,
    content: String,
}
fn name(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}
impl Pack {
    fn validate(&self) -> Result<(), &'static str> {
        if self.format != "fbforge-connect-testpack"
            || self.version != 1
            || !name(&self.name, 160)
            || self.cases.is_empty()
            || self.cases.len() > 20
        {
            return Err("test_pack_invalid");
        }
        for item in &self.cases {
            if !name(&item.name, 160)
                || item.id.is_empty()
                || item.id.len() > 64
                || !item
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                || !["accept", "reject", "none"].contains(&item.receipt.as_str())
                || item.schemas.len() > 20
                || item
                    .schemas
                    .iter()
                    .any(|s| s.uri.len() > 4096 || s.content.len() > 2 * 1024 * 1024)
            {
                return Err("test_pack_invalid");
            }
            for value in std::iter::once(&item.request).chain(item.reply.iter()) {
                let message: Message =
                    serde_json::from_value(value.clone()).map_err(|_| "test_pack_invalid")?;
                if message.data.len() > 512 * 1024
                    || message.schema_uri.len() > 4096
                    || !["application/json", "application/xml"]
                        .contains(&message.mime_type.as_str())
                    || message.attachments.len() > 39
                    || message
                        .attachments
                        .iter()
                        .any(|a| a.base64.len() > 6 * 1024 * 1024)
                {
                    return Err("test_pack_invalid");
                }
            }
        }
        Ok(())
    }
    fn summary(&self, id: &str) -> Value {
        json!({"id":id,"name":self.name,"cases":self.cases.iter()
            .map(|item| json!({"id":item.id,"name":item.name})).collect::<Vec<_>>()})
    }
}
pub struct TestLibrary(pub PathBuf);
impl TestLibrary {
    fn path(&self, id: &str) -> Result<PathBuf, &'static str> {
        if !valid_session_id(id) {
            return Err("test_pack_invalid");
        }
        Ok(self.0.join(format!("{id}.fctest")))
    }
    fn purpose(id: &str) -> Vec<u8> {
        format!("FBForge Connect / test library / v1 / {id}").into_bytes()
    }
    fn files(&self) -> Result<Vec<(String, u64)>, &'static str> {
        if !self.0.try_exists().map_err(|_| "vault_unavailable")? {
            return Ok(vec![]);
        }
        let mut files = vec![];
        for entry in fs::read_dir(&self.0).map_err(|_| "vault_unavailable")? {
            let entry = entry.map_err(|_| "vault_unavailable")?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("fctest") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .ok_or("vault_invalid")?;
            if self.path(id)? != path {
                return Err("vault_invalid");
            }
            let meta = fs::symlink_metadata(&path).map_err(|_| "vault_unavailable")?;
            if !meta.is_file() || meta.len() > 8 * 1024 * 1024 {
                return Err("vault_invalid");
            }
            files.push((id.to_owned(), meta.len()));
            if files.len() > MAX_ENTRIES {
                return Err("vault_limit");
            }
        }
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    }
    fn read_document(&self, id: &str) -> Result<Value, &'static str> {
        let path = self.path(id)?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "vault_unavailable")?;
        if !meta.is_file() || meta.len() > 8 * 1024 * 1024 {
            return Err("vault_invalid");
        }
        let mut encrypted = Vec::new();
        fs::File::open(path)
            .map_err(|_| "vault_unavailable")?
            .take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut encrypted)
            .map_err(|_| "vault_unavailable")?;
        if encrypted.len() > 8 * 1024 * 1024 {
            return Err("vault_invalid");
        }
        let mut plain = protection::transform_with_purpose(&encrypted, false, &Self::purpose(id))?;
        let pack = serde_json::from_slice::<Value>(&plain).map_err(|_| "test_pack_invalid");
        plain.fill(0);
        pack
    }
    fn read(&self, id: &str) -> Result<Pack, &'static str> {
        let pack: Pack =
            serde_json::from_value(self.read_document(id)?).map_err(|_| "test_pack_invalid")?;
        pack.validate()?;
        Ok(pack)
    }
    fn save_document(&self, id: &str, document: &Value) -> Result<(), &'static str> {
        let destination = self.path(id)?;
        let mut plain = serde_json::to_vec(document).map_err(|_| "test_pack_invalid")?;
        if plain.len() > MAX_PACK {
            plain.fill(0);
            return Err("test_pack_limit");
        }
        let encrypted = protection::transform_with_purpose(&plain, true, &Self::purpose(id));
        plain.fill(0);
        let encrypted = encrypted?;
        let files = self.files()?;
        if files.iter().any(|(saved, _)| saved == id) {
            return Err("test_library_conflict");
        }
        if files.len() >= MAX_ENTRIES
            || files.iter().map(|(_, size)| size).sum::<u64>() + encrypted.len() as u64 > MAX_STORE
        {
            return Err("vault_limit");
        }
        fs::create_dir_all(&self.0).map_err(|_| "vault_unavailable")?;
        let temp = destination.with_extension("pending");
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "vault_unavailable")?;
        let result = (|| {
            file.write_all(&encrypted)
                .and_then(|_| file.sync_all())
                .map_err(|_| "vault_unavailable")?;
            drop(file);
            protection::replace(&temp, &destination)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        result
    }
    pub fn execute(&self, request: LibraryRequest) -> Result<Value, &'static str> {
        match request {
            LibraryRequest::FlowList {}
            | LibraryRequest::FlowRead { .. }
            | LibraryRequest::FlowSave { .. }
            | LibraryRequest::FlowDelete { .. } => flows::execute(self, request),
            LibraryRequest::List {} => self
                .files()?
                .iter()
                .map(|(id, _)| self.read(id).map(|p| p.summary(id)))
                .collect::<Result<Vec<_>, _>>()
                .map(Value::Array),
            LibraryRequest::Read { id } => {
                serde_json::to_value(self.read(&id)?).map_err(|_| "vault_invalid")
            }
            LibraryRequest::Delete { id } => {
                fs::remove_file(self.path(&id)?).map_err(|_| "vault_unavailable")?;
                Ok(Value::Null)
            }
            LibraryRequest::Save { id, pack } => {
                pack.validate()?;
                self.save_document(
                    &id,
                    &serde_json::to_value(&pack).map_err(|_| "test_pack_invalid")?,
                )?;
                Ok(pack.summary(&id))
            }
        }
    }
}

#[cfg(test)]
#[path = "test_library_tests.rs"]
mod tests;

#[path = "test_flow_library.rs"]
mod flows;
