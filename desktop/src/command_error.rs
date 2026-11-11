//! Typed SDK details retain the stable code. Legacy native failures still serialize as strings.
use serde::{Deserialize, Serialize, Serializer};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SdkDiagnostic {
    pub stage: String,
    pub r#type: String,
    pub message: String,
}
impl SdkDiagnostic {
    fn valid(&self) -> bool {
        matches!(
            self.stage.as_str(),
            "RECEIVE"
                | "REPLY"
                | "EVENT_LOG"
                | "METADATA"
                | "DATA"
                | "ATTACHMENTS"
                | "REPLY_CHANNEL"
        ) && !self.r#type.is_empty()
            && self.r#type.len() <= 128
            && self.r#type.as_bytes()[0].is_ascii_alphabetic()
            && self
                .r#type
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_$".contains(&c))
            && !self.message.trim().is_empty()
            && self.message.chars().count() <= 1024
            && !self.message.chars().any(char::is_control)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandError {
    code: &'static str,
    diagnostics: Vec<SdkDiagnostic>,
}
impl CommandError {
    pub fn code(&self) -> &'static str {
        self.code
    }
    pub fn detailed(code: &'static str, diagnostics: Vec<SdkDiagnostic>) -> Option<Self> {
        if diagnostics.is_empty()
            || diagnostics.len() > 8
            || !diagnostics.iter().all(SdkDiagnostic::valid)
        {
            return None;
        }
        Some(Self { code, diagnostics })
    }
}
impl From<&'static str> for CommandError {
    fn from(code: &'static str) -> Self {
        Self {
            code,
            diagnostics: Vec::new(),
        }
    }
}
impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if self.diagnostics.is_empty() {
            return serializer.serialize_str(self.code);
        }
        use serde::ser::SerializeStruct;
        let mut value = serializer.serialize_struct("CommandError", 2)?;
        value.serialize_field("code", self.code)?;
        value.serialize_field("diagnostics", &self.diagnostics)?;
        value.end()
    }
}

#[cfg(test)]
#[path = "command_error_tests.rs"]
mod tests;
