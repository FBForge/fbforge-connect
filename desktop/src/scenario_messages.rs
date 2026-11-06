use super::*;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Followup {
    pub(super) id: String,
    pub(super) case_id: String,
    pub(super) name: String,
    pub(super) message: Value,
}
impl Scenario {
    pub(super) fn message(&self, id: &str, scope: &str) -> Option<&Value> {
        let c = self.pack.cases.iter().find(|c| c.id == id)?;
        match scope {
            "request" => Some(&c.request),
            "reply" => c.reply.as_ref(),
            _ => self
                .followups
                .iter()
                .flatten()
                .find(|f| f.case_id == id && scope == format!("reply:{}", f.id))
                .map(|f| &f.message),
        }
    }
    pub(super) fn requires_v3(&self) -> bool {
        self.shared_case
            || self.pack.cases.iter().any(|c| {
                c.request
                    .get("processMessage")
                    .is_some_and(|v| !v.is_null())
                    || c.request
                        .get("replyOffer")
                        .and_then(|v| v.get("processMessages"))
                        .and_then(Value::as_array)
                        .is_some_and(|v| !v.is_empty())
                    || c.reply
                        .as_ref()
                        .and_then(|v| v.get("processMessage"))
                        .is_some_and(|v| !v.is_null())
            })
            || self.followups.iter().flatten().any(|f| {
                f.message
                    .get("processMessage")
                    .is_some_and(|v| !v.is_null())
            })
    }
    pub(super) fn validate_messages(&self) -> Result<(), &'static str> {
        if self.followups.as_ref().is_some_and(|f| f.len() > 16) {
            return Err("scenario_invalid");
        }
        let mut ids = HashSet::new();
        for f in self.followups.iter().flatten() {
            let c = self
                .pack
                .cases
                .iter()
                .find(|c| c.id == f.case_id)
                .ok_or("scenario_invalid")?;
            let reply = c.reply.as_ref().ok_or("scenario_invalid")?;
            if !valid_session_id(&f.id)
                || !ids.insert(&f.id)
                || !name(&f.name, 160)
                || c.request.get("replyOffer").is_none_or(|v| v.is_null())
                || f.message.get("schemaUri") != reply.get("schemaUri")
                || f.message.get("mimeType") != reply.get("mimeType")
            {
                return Err("scenario_invalid");
            }
            Pack {
                format: self.pack.format.clone(),
                version: self.pack.version,
                name: self.pack.name.clone(),
                cases: vec![TestCase {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    request: c.request.clone(),
                    reply: Some(f.message.clone()),
                    receipt: c.receipt.clone(),
                    schemas: vec![],
                }],
            }
            .validate()?;
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Difference {
    path: String,
    expected: String,
    actual: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AttemptContext {
    case_id: Option<String>,
    submission_id: Option<String>,
    reply_id: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ReplyBinding {
    message_id: String,
    reply_id: String,
}
impl ScenarioRun {
    pub(super) fn validate_details(&self) -> Result<(), &'static str> {
        let expected = self.definition.followups.as_deref().unwrap_or_default();
        let resolved = self.followups.as_deref().unwrap_or_default();
        if expected.len() != resolved.len() {
            return Err("scenario_invalid");
        }
        let mut ids = HashSet::new();
        for f in resolved {
            if !ids.insert(&f.id)
                || !expected.iter().any(|e| {
                    e.id == f.id
                        && e.case_id == f.case_id
                        && e.name == f.name
                        && e.message.get("schemaUri") == f.message.get("schemaUri")
                        && e.message.get("mimeType") == f.message.get("mimeType")
                })
            {
                return Err("scenario_invalid");
            }
            let c = self
                .pack
                .cases
                .iter()
                .find(|c| c.id == f.case_id)
                .ok_or("scenario_invalid")?;
            Pack {
                format: self.pack.format.clone(),
                version: self.pack.version,
                name: self.pack.name.clone(),
                cases: vec![TestCase {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    request: c.request.clone(),
                    reply: Some(f.message.clone()),
                    receipt: c.receipt.clone(),
                    schemas: vec![],
                }],
            }
            .validate()?;
        }
        let bindings = self.reply_bindings.as_deref().unwrap_or_default();
        if bindings.len() > 36 {
            return Err("scenario_invalid");
        }
        let mut keys = HashSet::new();
        let mut replies = HashSet::new();
        for b in bindings {
            let known = self
                .definition
                .pack
                .cases
                .iter()
                .any(|c| c.reply.is_some() && b.message_id == format!("first:{}", c.id))
                || expected.iter().any(|f| f.id == b.message_id);
            if !known
                || !valid_session_id(&b.reply_id)
                || !keys.insert(&b.message_id)
                || !replies.insert(&b.reply_id)
            {
                return Err("scenario_invalid");
            }
        }
        let mut bytes = 0;
        for a in &self.attempts {
            if let Some(rows) = &a.differences {
                if rows.len() > 20 {
                    return Err("scenario_invalid");
                }
                bytes += serde_json::to_vec(rows)
                    .map_err(|_| "scenario_invalid")?
                    .len();
                for d in rows {
                    if d.path.is_empty()
                        || d.path.chars().count() > 1024
                        || d.expected.chars().count() > 512
                        || d.actual.chars().count() > 512
                    {
                        return Err("scenario_invalid");
                    }
                }
            }
            if let Some(c) = &a.context {
                for id in [&c.case_id, &c.submission_id, &c.reply_id]
                    .into_iter()
                    .flatten()
                {
                    if !valid_session_id(id) {
                        return Err("scenario_invalid");
                    }
                }
            }
        }
        if bytes > 128 * 1024 {
            return Err("scenario_invalid");
        }
        Ok(())
    }
    pub(super) fn outcome(&self) -> &str {
        let steps = self.definition.steps();
        if self.cursor == steps.len()
            && steps.iter().all(|s| {
                self.attempts
                    .iter()
                    .rev()
                    .find(|a| &a.step_id == s)
                    .is_some_and(|a| a.status == "passed")
            })
        {
            return "passed";
        }
        if self.cursor == steps.len() {
            return "manual";
        }
        steps
            .get(self.cursor)
            .and_then(|s| self.attempts.iter().rev().find(|a| &a.step_id == s))
            .map(|a| a.status.as_str())
            .filter(|status| ["failed", "blocked", "cancelled"].contains(status))
            .unwrap_or("pending")
    }
}
