//! Denial markers contain no message content and are bound to the existing profile/API scope.
use super::*;
use std::{
    collections::HashSet,
    sync::{Mutex, OnceLock},
};

#[cfg(test)]
#[path = "case_quarantine_tests.rs"]
mod tests;

// Keep an IO-failure denial across engine/session replacement. A durable control marker is also
// attempted outside the case directory; if every disk write fails, restart durability is impossible.
static DENIED_SCOPES: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
fn denied_scopes() -> &'static Mutex<HashSet<PathBuf>> {
    DENIED_SCOPES.get_or_init(|| Mutex::new(HashSet::new()))
}
fn exists(path: &Path) -> Result<bool, &'static str> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("vault_unavailable"),
    }
}
impl CaseStore {
    fn quarantine_path(&self, id: &str) -> Result<PathBuf, &'static str> {
        self.path(id).map(|path| path.with_extension("blocked"))
    }
    fn scope_quarantined(&self) -> Result<bool, &'static str> {
        Ok(denied_scopes()
            .lock()
            .map_err(|_| "vault_unavailable")?
            .contains(&self.root)
            || exists(&self.quarantine_control)?)
    }
    pub(super) fn is_quarantined(&self, id: &str) -> Result<bool, &'static str> {
        let marker = self.quarantine_path(id)?;
        Ok(self.scope_quarantined()? || exists(&marker)?)
    }
    pub(super) fn quarantine_warning(&self, id: &str) -> Result<&'static str, &'static str> {
        if !self.scope_quarantined()?
            && crate::vault::read_bounded(&self.quarantine_path(id)?, 32)
                .ok()
                .as_deref()
                == Some(b"blocked-v1")
        {
            Ok("MALWARE_DETECTED")
        } else {
            Ok("MALWARE_REVIEW_REQUIRED")
        }
    }
    pub(super) fn clear_quarantine(&self, id: &str) -> Result<(), &'static str> {
        let path = self.quarantine_path(id)?;
        if exists(&path)? {
            fs::remove_file(path).map_err(|_| "vault_unavailable")?;
        }
        Ok(())
    }
    pub fn clear_quarantine_scope(&self) -> Result<(), &'static str> {
        if !self.records()?.is_empty() {
            return Err("vault_unavailable");
        }
        if exists(&self.quarantine_control)? {
            fs::remove_file(&self.quarantine_control).map_err(|_| "vault_unavailable")?;
        }
        denied_scopes()
            .lock()
            .map_err(|_| "vault_unavailable")?
            .remove(&self.root);
        Ok(())
    }
    fn quarantine_scope(&self) -> Result<(), &'static str> {
        denied_scopes()
            .lock()
            .map_err(|_| "vault_unavailable")?
            .insert(self.root.clone());
        fs::create_dir_all(
            self.quarantine_control
                .parent()
                .ok_or("vault_unavailable")?,
        )
        .map_err(|_| "vault_unavailable")?;
        crate::vault::write_protected(&self.quarantine_control, b"review-v1")
    }
    pub(super) fn quarantine_record(&self, id: &str, confirmed: bool) -> Result<(), &'static str> {
        if self.is_quarantined(id)? {
            return Ok(());
        }
        let marker = self.quarantine_path(id)?;
        let verdict: &[u8] = if confirmed {
            b"blocked-v1"
        } else {
            b"review-v1"
        };
        // A separate marker can deny an older encrypted file even when replacement is locked.
        if crate::vault::write_protected(&marker, verdict).is_ok() {
            return Ok(());
        }
        if fs::remove_file(self.path(id)?).is_ok() {
            return Ok(());
        }
        self.quarantine_scope()
    }
    pub fn quarantine_message(
        &self,
        kind: &str,
        subject: &str,
        context: &str,
    ) -> Result<(), &'static str> {
        if !["submission", "reply"].contains(&kind)
            || !valid_session_id(subject)
            || !valid_session_id(context)
        {
            return Err("invalid_input");
        }
        let subject_key = if kind == "reply" {
            "replyId"
        } else {
            "submissionId"
        };
        let context_key = if kind == "reply" {
            "caseId"
        } else {
            "destinationId"
        };
        let records = match self.records() {
            Ok(records) => records,
            Err(_) => return self.quarantine_scope(),
        };
        for record in records {
            let uncertain = record["available"] == false;
            if uncertain
                || (record["kind"] == kind
                    && record["direction"] == "received"
                    && record[subject_key] == subject
                    && record[context_key] == context)
            {
                if self
                    .quarantine_record(
                        record["recordId"].as_str().ok_or("vault_invalid")?,
                        !uncertain,
                    )
                    .is_err()
                {
                    return self.quarantine_scope();
                }
            }
        }
        Ok(())
    }
}
