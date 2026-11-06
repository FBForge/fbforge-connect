//! Versioned integration scenarios. Native validation and protected, bounded storage.
use super::*;
use std::collections::HashSet;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scenario {
    format: String,
    version: u8,
    id: String,
    name: String,
    mode: String,
    shared_case: bool,
    pack: Pack,
    variables: Vec<Variable>,
    variants: Vec<Variant>,
    rules: Vec<Rule>,
    comparison: String,
    expected_problem: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Variable {
    id: String,
    label: String,
    case_id: String,
    scope: String,
    path: String,
    kind: String,
    value: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Rule {
    id: String,
    case_id: String,
    scope: String,
    path: String,
    operator: String,
    value: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Variant {
    id: String,
    name: String,
    values: Vec<VariantValue>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VariantValue {
    variable_id: String,
    value: String,
}

impl Scenario {
    fn validate(&self) -> Result<(), &'static str> {
        self.pack.validate()?;
        let cases: HashSet<_> = self.pack.cases.iter().map(|c| &c.id).collect();
        if self.format != "fbforge-connect-scenario"
            || self.version != 2
            || !valid_session_id(&self.id)
            || !name(&self.name, 160)
            || !["sender", "receiver", "both"].contains(&self.mode.as_str())
            || !["exact", "xml-structure", "rules"].contains(&self.comparison.as_str())
            || self.expected_problem.len() > 4096
            || self.expected_problem.chars().any(char::is_whitespace)
            || cases.len() != self.pack.cases.len()
            || self.variables.len() > 32
            || self.rules.len() > 64
            || self.variants.is_empty()
            || self.variants.len() > 16
            || self.comparison == "rules" && self.rules.is_empty()
        {
            return Err("scenario_invalid");
        }
        let message = |id: &str, scope: &str| {
            self.pack.cases.iter().any(|c| {
                c.id == id && (scope == "request" || scope == "reply" && c.reply.is_some())
            })
        };
        if self
            .variables
            .iter()
            .filter(|v| v.kind == "reference")
            .count()
            + self
                .rules
                .iter()
                .filter(|r| r.operator == "reference")
                .count()
            > 64
        {
            return Err("scenario_invalid");
        }
        let mut ids = HashSet::new();
        for row in &self.variables {
            if !valid_session_id(&row.id)
                || !ids.insert(&row.id)
                || !name(&row.label, 160)
                || !message(&row.case_id, &row.scope)
                || !name(&row.path, 1024)
                || row.value.len() > 4096
                || !["text", "number", "boolean", "date", "uuid", "reference"]
                    .contains(&row.kind.as_str())
            {
                return Err("scenario_invalid");
            }
        }
        for variant in &self.variants {
            if !valid_session_id(&variant.id)
                || !ids.insert(&variant.id)
                || !name(&variant.name, 160)
                || variant.values.len() > 32
            {
                return Err("scenario_invalid");
            }
            let mut seen = HashSet::new();
            for value in &variant.values {
                if !self.variables.iter().any(|v| v.id == value.variable_id)
                    || !seen.insert(&value.variable_id)
                    || value.value.len() > 4096
                {
                    return Err("scenario_invalid");
                }
            }
        }
        for row in &self.rules {
            if !valid_session_id(&row.id)
                || !ids.insert(&row.id)
                || !message(&row.case_id, &row.scope)
                || !name(&row.path, 1024)
                || row.value.len() > 4096
                || !["equals", "present", "date", "reference"].contains(&row.operator.as_str())
            {
                return Err("scenario_invalid");
            }
        }
        Ok(())
    }
    fn steps(&self) -> Vec<String> {
        self.pack
            .cases
            .iter()
            .flat_map(|c| {
                let mut types = match self.mode.as_str() {
                    "sender" => vec!["send"],
                    "receiver" => vec!["receive", "compare"],
                    _ => vec!["send", "receive", "compare"],
                };
                if c.receipt != "none" {
                    types.push("receipt");
                }
                if c.reply.is_some() {
                    if self.mode != "sender" {
                        types.push("reply");
                    }
                    types.push("check_reply");
                }
                types
                    .into_iter()
                    .map(|kind| format!("{}:{kind}", c.id))
                    .collect::<Vec<_>>()
            })
            .collect()
    }
    fn summary(&self) -> Value {
        json!({"id":self.id,"name":self.name,"mode":self.mode,"caseCount":self.pack.cases.len()})
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioRun {
    format: String,
    version: u8,
    id: String,
    definition: Scenario,
    fingerprint: String,
    variant_id: String,
    environment: String,
    assignment: runs::Context,
    started_at: String,
    pack: Pack,
    cursor: usize,
    attempts: Vec<Attempt>,
    bindings: Vec<Binding>,
    reference: bool,
    references: Vec<ObservedReference>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObservedReference {
    test_case_id: String,
    path: String,
    raw: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Attempt {
    step_id: String,
    status: String,
    at: String,
    detail: String,
    record_id: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Binding {
    case_id: String,
    submission_id: Option<String>,
    reply_id: Option<String>,
    test_case_id: String,
}
impl ScenarioRun {
    fn validate(&self) -> Result<(), &'static str> {
        self.definition.validate()?;
        self.pack.validate()?;
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
    fn summary(&self) -> Value {
        json!({"id":self.id,"name":self.definition.name,"scenarioId":self.definition.id,"environment":self.environment,"apiVersion":self.assignment.api_version,"variantId":self.variant_id,"startedAt":self.started_at,"cursor":self.cursor,"total":self.definition.steps().len(),"reference":self.reference})
    }
}

pub(super) fn execute(
    library: &TestLibrary,
    request: LibraryRequest,
) -> Result<Value, &'static str> {
    let scenarios = TestLibrary(library.0.join("scenarios-v2"));
    let runs = TestLibrary(library.0.join("scenario-runs-v2"));
    fn read_scenario(store: &TestLibrary, id: &str) -> Result<Scenario, &'static str> {
        let s: Scenario =
            serde_json::from_value(store.read_document(id)?).map_err(|_| "scenario_invalid")?;
        s.validate()?;
        if s.id != id {
            return Err("scenario_invalid");
        }
        Ok(s)
    }
    fn read_run(store: &TestLibrary, id: &str) -> Result<ScenarioRun, &'static str> {
        let r: ScenarioRun =
            serde_json::from_value(store.read_document(id)?).map_err(|_| "scenario_invalid")?;
        r.validate()?;
        if r.id != id {
            return Err("scenario_invalid");
        }
        Ok(r)
    }
    match request {
        LibraryRequest::ScenarioList {} => scenarios
            .files()?
            .iter()
            .map(|(id, _)| read_scenario(&scenarios, id).map(|s| s.summary()))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        LibraryRequest::ScenarioRead { id } => {
            serde_json::to_value(read_scenario(&scenarios, &id)?).map_err(|_| "scenario_invalid")
        }
        LibraryRequest::ScenarioSave { document } => {
            document.validate()?;
            scenarios.upsert_document(
                &document.id,
                &serde_json::to_value(&document).map_err(|_| "scenario_invalid")?,
            )?;
            Ok(document.summary())
        }
        LibraryRequest::ScenarioDelete { id } => {
            fs::remove_file(scenarios.path(&id)?).map_err(|_| "vault_unavailable")?;
            Ok(Value::Null)
        }
        LibraryRequest::ScenarioRunList {} => runs
            .files()?
            .iter()
            .map(|(id, _)| read_run(&runs, id).map(|r| r.summary()))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        LibraryRequest::ScenarioRunRead { id } => {
            serde_json::to_value(read_run(&runs, &id)?).map_err(|_| "scenario_invalid")
        }
        LibraryRequest::ScenarioRunSave { document } => {
            document.validate()?;
            runs.upsert_document(
                &document.id,
                &serde_json::to_value(&document).map_err(|_| "scenario_invalid")?,
            )?;
            Ok(document.summary())
        }
        LibraryRequest::ScenarioRunDelete { id } => {
            let r = read_run(&runs, &id)?;
            if r.reference {
                return Err("scenario_reference_protected");
            }
            fs::remove_file(runs.path(&id)?).map_err(|_| "vault_unavailable")?;
            Ok(Value::Null)
        }
        _ => Err("scenario_invalid"),
    }
}

#[cfg(test)]
#[path = "scenario_library_tests.rs"]
mod tests;
