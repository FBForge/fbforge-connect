//! Export capabilities and source identities are bound before any plaintext byte is written.
use crate::protocol::{valid_session_id, ApiVersion, SessionResource};
use serde_json::{json, Value};
use std::path::PathBuf;

pub(crate) struct Permit {
    pub api: ApiVersion,
    pub session: String,
    pub environment: String,
    pub path: PathBuf,
}
impl Permit {
    pub fn validate(
        &self,
        api: ApiVersion,
        session: &str,
        environment: &str,
    ) -> Result<(), &'static str> {
        if self.api != api || self.session != session || self.environment != environment {
            return Err("session_missing");
        }
        Ok(())
    }
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Source {
    pub proof_id: Option<String>,
    pub record_id: Option<String>,
    pub message_id: String,
    pub reply: bool,
}
impl Source {
    pub fn validate(&self) -> bool {
        valid_session_id(&self.message_id)
            && (self.proof_id.is_some() != self.record_id.is_some())
            && self
                .proof_id
                .iter()
                .chain(self.record_id.iter())
                .all(|id| valid_session_id(id))
    }
    pub fn live_command(&self, content: Option<&str>, offset: usize) -> Value {
        let command = match (self.reply, content.is_some()) {
            (false, false) => "list_received_contents",
            (false, true) => "read_received_content",
            (true, false) => "list_received_reply_contents",
            (true, true) => "read_received_reply_content",
        };
        let mut request = json!({"command":command,"proofId":self.proof_id});
        if let Some(id) = content {
            request["contentId"] = id.into();
            request["byteOffset"] = offset.into();
        } else {
            request["offset"] = offset.into();
        }
        request
    }
    pub fn checked(
        &self,
        result: SessionResource,
        api: ApiVersion,
        session: &str,
    ) -> Result<Value, &'static str> {
        if !result.validate(api, session) {
            return Err("engine_protocol_error");
        }
        let identity = if self.record_id.is_some() {
            "recordId"
        } else {
            "proofId"
        };
        if result.data[identity].as_str() != self.record_id.as_deref().or(self.proof_id.as_deref())
        {
            return Err("engine_protocol_error");
        }
        Ok(result.data)
    }
}
#[cfg(test)]
#[path = "export_source_tests.rs"]
mod tests;
