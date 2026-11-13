//! Bounded public schema definitions stored inside the protected profile.
use crate::protocol::valid_session_id;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnswerSchema {
    pub uri: String,
    pub title: String,
    pub revision: String,
    pub schema: Value,
    pub draft: Value,
}
impl AnswerSchema {
    pub fn validate(&self) -> Result<(), &'static str> {
        let uri = reqwest::Url::parse(&self.uri).map_err(|_| "schema_library_invalid")?;
        if !matches!(uri.scheme(), "https" | "urn")
            || uri.fragment().is_some()
            || !uri.username().is_empty()
            || uri.password().is_some()
            || self.uri.len() > 4096
            || self.uri.chars().any(char::is_whitespace)
            || self.title.trim().is_empty()
            || self.title.len() > 640
            || self.title.chars().any(char::is_control)
            || !valid_session_id(&self.revision)
            || !self.schema.is_object()
            || self.schema["$id"].as_str() != Some(&self.uri)
            || self.draft["format"] != "fbforge-connect-channel-schema"
            || self.draft["version"] != 1
            || self.draft["definition"]["schemaUri"].as_str() != Some(&self.uri)
            || serde_json::to_vec(self).map_or(true, |v| v.len() > 64 * 1024)
        {
            return Err("schema_library_invalid");
        }
        Ok(())
    }
    pub fn summary(&self) -> Value {
        serde_json::json!({"uri":self.uri,"title":self.title,"revision":self.revision})
    }
}
pub fn validate_library(items: &[AnswerSchema]) -> Result<(), &'static str> {
    if items.len() > 32 || serde_json::to_vec(items).map_or(true, |v| v.len() > 1024 * 1024) {
        return Err("schema_library_limit");
    }
    let mut seen = std::collections::HashSet::new();
    for item in items {
        item.validate()?;
        if !seen.insert(&item.uri) {
            return Err("schema_library_invalid");
        }
    }
    Ok(())
}
pub fn save(
    items: &mut Vec<AnswerSchema>,
    entry: AnswerSchema,
    expected: Option<&str>,
) -> Result<(), &'static str> {
    entry.validate()?;
    let previous = items.iter().find(|s| s.uri == entry.uri);
    if previous.map(|s| s.revision.as_str()) != expected {
        return Err("schema_library_conflict");
    }
    let mut next = items
        .iter()
        .filter(|s| s.uri != entry.uri)
        .cloned()
        .collect::<Vec<_>>();
    next.push(entry);
    validate_library(&next)?;
    *items = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn entry() -> AnswerSchema {
        AnswerSchema {
            uri: "urn:test:reply:1".into(),
            title: "Testantwort".into(),
            revision: "11111111-1111-4111-8111-111111111111".into(),
            schema: json!({"$id":"urn:test:reply:1","type":"object"}),
            draft: json!({"format":"fbforge-connect-channel-schema","version":1,"definition":{"schemaUri":"urn:test:reply:1"}}),
        }
    }
    #[test]
    fn replacements_require_the_current_revision_and_failed_changes_leave_the_library_intact() {
        let first = entry();
        let mut items = vec![];
        save(&mut items, first.clone(), None).unwrap();
        let before = serde_json::to_vec(&items).unwrap();
        assert_eq!(
            save(&mut items, first.clone(), None),
            Err("schema_library_conflict")
        );
        assert_eq!(serde_json::to_vec(&items).unwrap(), before);
        let mut next = first.clone();
        next.title = "Neue Bezeichnung".into();
        next.revision = "22222222-2222-4222-8222-222222222222".into();
        save(&mut items, next, Some(&first.revision)).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Neue Bezeichnung");
        assert_eq!(
            save(&mut items, first.clone(), Some(&first.revision)),
            Err("schema_library_conflict")
        );
    }
    #[test]
    fn malformed_foreign_or_oversized_definitions_are_rejected() {
        let mut value = entry();
        value.schema["$id"] = json!("urn:test:foreign");
        assert!(value.validate().is_err());
        value = entry();
        value.uri = "https://user:password@example.invalid/schema".into();
        assert!(value.validate().is_err());
        value = entry();
        value.schema["description"] = json!("x".repeat(64 * 1024));
        assert!(value.validate().is_err());
        assert!(validate_library(&vec![entry(); 33]).is_err());
        assert!(validate_library(&vec![entry(); 2]).is_err());
    }
}
