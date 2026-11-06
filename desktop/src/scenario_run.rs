use super::*;
impl ScenarioRun {
    pub(super) fn validate(&self) -> Result<(), &'static str> {
        self.definition.validate()?;
        self.pack.validate()?;
        self.validate_details()?;
        let steps = self.definition.steps();
        if self.references.len() > 64 {
            return Err("scenario_invalid");
        }
        for row in &self.references {
            if !self.pack.cases.iter().any(|c| c.id == row.test_case_id)
                || !name(&row.path, 1024)
                || row.raw.len() > 4096
            {
                return Err("scenario_invalid");
            }
            let value: Value = serde_json::from_str(&row.raw).map_err(|_| "scenario_invalid")?;
            if value.is_array() || value.is_object() {
                return Err("scenario_invalid");
            }
        }
        if self.format != "fbforge-connect-scenario-run"
            || self.version != 2
            || !valid_session_id(&self.id)
            || !["TEST", "STAGE", "PROD"].contains(&self.environment.as_str())
            || !self
                .definition
                .variants
                .iter()
                .any(|v| v.id == self.variant_id)
            || self.fingerprint.len() != 64
            || !self.fingerprint.bytes().all(|b| b.is_ascii_hexdigit())
            || !name(&self.started_at, 40)
            || self.cursor > steps.len()
            || self.attempts.len() > 480
            || self.bindings.len() > 20
            || !["v2", "v3"].contains(&self.assignment.api_version.as_str())
            || (self.definition.requires_v3() && self.assignment.api_version != "v3")
            || self.pack.cases.iter().map(|c| &c.id).collect::<Vec<_>>()
                != self
                    .definition
                    .pack
                    .cases
                    .iter()
                    .map(|c| &c.id)
                    .collect::<Vec<_>>()
        {
            return Err("scenario_invalid");
        }
        for value in [
            &self.assignment.sender_profile_id,
            &self.assignment.receiver_profile_id,
            &self.assignment.source_destination,
            &self.assignment.receiver_destination,
        ] {
            if !value.is_empty() && !valid_session_id(value) {
                return Err("scenario_invalid");
            }
        }
        for attempt in &self.attempts {
            if !steps.contains(&attempt.step_id)
                || !["passed", "failed", "blocked", "manual", "cancelled"]
                    .contains(&attempt.status.as_str())
                || !name(&attempt.at, 40)
                || attempt.detail.len() > 2048
                || attempt
                    .record_id
                    .as_ref()
                    .is_some_and(|s| !valid_session_id(s))
            {
                return Err("scenario_invalid");
            }
        }
        for step in steps.iter().take(self.cursor) {
            if !self
                .attempts
                .iter()
                .rev()
                .find(|a| &a.step_id == step)
                .is_some_and(|a| ["passed", "manual"].contains(&a.status.as_str()))
            {
                return Err("scenario_invalid");
            }
        }
        let mut ids = HashSet::new();
        for binding in &self.bindings {
            if !valid_session_id(&binding.case_id)
                || !self.pack.cases.iter().any(|c| c.id == binding.test_case_id)
                || !ids.insert(&binding.test_case_id)
                || (self.definition.shared_case && self.bindings[0].case_id != binding.case_id)
                || [&binding.submission_id, &binding.reply_id]
                    .iter()
                    .any(|v| v.as_ref().is_some_and(|s| !valid_session_id(s)))
            {
                return Err("scenario_invalid");
            }
        }
        if self.reference
            && (self.cursor != steps.len()
                || steps.iter().any(|step| {
                    !self
                        .attempts
                        .iter()
                        .rev()
                        .find(|a| &a.step_id == step)
                        .is_some_and(|a| a.status == "passed")
                }))
        {
            return Err("scenario_invalid");
        }
        Ok(())
    }
    pub(super) fn summary(&self) -> Value {
        json!({"id":self.id,"name":self.definition.name,"scenarioId":self.definition.id,"environment":self.environment,"apiVersion":self.assignment.api_version,"variantId":self.variant_id,"startedAt":self.started_at,"cursor":self.cursor,"total":self.definition.steps().len(),"reference":self.reference,"outcome":self.outcome(),"fingerprint":self.fingerprint})
    }
}
