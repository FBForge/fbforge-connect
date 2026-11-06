use super::*;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioSeries {
    format: String,
    version: u8,
    id: String,
    name: String,
    definition: Scenario,
    fingerprint: String,
    environment: String,
    created_at: String,
    entries: Vec<Entry>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    id: String,
    variant_id: String,
    assignment: runs::Context,
    run_id: Option<String>,
}
impl ScenarioSeries {
    fn validate(&self) -> Result<(), &'static str> {
        self.definition.validate()?;
        if self.format != "fbforge-connect-test-series"
            || self.version != 1
            || !valid_session_id(&self.id)
            || !name(&self.name, 160)
            || !["TEST", "STAGE", "PROD"].contains(&self.environment.as_str())
            || !name(&self.created_at, 40)
            || self.fingerprint.len() != 64
            || !self.fingerprint.bytes().all(|c| c.is_ascii_hexdigit())
            || self.entries.is_empty()
            || self.entries.len() > 32
        {
            return Err("scenario_invalid");
        }
        let mut ids = HashSet::new();
        let mut combinations = HashSet::new();
        let mut runs = HashSet::new();
        for e in &self.entries {
            if !valid_session_id(&e.id)
                || !ids.insert(&e.id)
                || !self
                    .definition
                    .variants
                    .iter()
                    .any(|v| v.id == e.variant_id)
                || !["v2", "v3"].contains(&e.assignment.api_version.as_str())
                || !combinations.insert((&e.variant_id, &e.assignment.api_version))
            {
                return Err("scenario_invalid");
            }
            for v in [
                &e.assignment.sender_profile_id,
                &e.assignment.receiver_profile_id,
                &e.assignment.source_destination,
                &e.assignment.receiver_destination,
            ] {
                if !v.is_empty() && !valid_session_id(v) {
                    return Err("scenario_invalid");
                }
            }
            if let Some(id) = &e.run_id {
                if !valid_session_id(id)
                    || !runs.insert(id)
                    || self.definition.requires_v3() && e.assignment.api_version == "v2"
                {
                    return Err("scenario_invalid");
                }
            }
        }
        Ok(())
    }
    fn summary(&self) -> Value {
        json!({"id":self.id,"name":self.name,"environment":self.environment,"total":self.entries.len()})
    }
    fn check_runs(&self, store: &TestLibrary) -> Result<(), &'static str> {
        for e in &self.entries {
            if let Some(id) = &e.run_id {
                let r = read_run(store, id)?;
                if r.environment != self.environment
                    || r.variant_id != e.variant_id
                    || r.fingerprint != self.fingerprint
                    || serde_json::to_value(&r.definition).ok()
                        != serde_json::to_value(&self.definition).ok()
                    || serde_json::to_value(&r.assignment).ok()
                        != serde_json::to_value(&e.assignment).ok()
                {
                    return Err("scenario_invalid");
                }
            }
        }
        Ok(())
    }
}
pub(super) fn execute(
    library: &TestLibrary,
    request: LibraryRequest,
) -> Result<Value, &'static str> {
    let store = TestLibrary(library.0.join("scenario-series-v1"));
    let read = |id: &str| -> Result<ScenarioSeries, &'static str> {
        let s: ScenarioSeries =
            serde_json::from_value(store.read_document(id)?).map_err(|_| "scenario_invalid")?;
        s.validate()?;
        if s.id != id {
            return Err("scenario_invalid");
        }
        Ok(s)
    };
    match request {
        LibraryRequest::ScenarioSeriesList {} => store
            .files()?
            .iter()
            .map(|(id, _)| read(id).map(|s| s.summary()))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        LibraryRequest::ScenarioSeriesRead { id } => {
            serde_json::to_value(read(&id)?).map_err(|_| "scenario_invalid")
        }
        LibraryRequest::ScenarioSeriesSave { document } => {
            document.validate()?;
            document.check_runs(&TestLibrary(library.0.join("scenario-runs-v2")))?;
            store.upsert_document(
                &document.id,
                &serde_json::to_value(&document).map_err(|_| "scenario_invalid")?,
            )?;
            Ok(document.summary())
        }
        LibraryRequest::ScenarioSeriesDelete { id } => {
            fs::remove_file(store.path(&id)?).map_err(|_| "vault_unavailable")?;
            Ok(Value::Null)
        }
        _ => Err("scenario_invalid"),
    }
}

#[cfg(test)]
#[path = "scenario_series_tests.rs"]
mod tests;
