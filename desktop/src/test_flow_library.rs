use super::*;
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Flow {
    format: String,
    version: u8,
    name: String,
    pack: Pack,
    steps: Vec<Step>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Step {
    case_id: String,
    #[serde(rename = "type")]
    kind: String,
}
impl Flow {
    fn validate(&self) -> Result<(), &'static str> {
        self.pack.validate()?;
        if self.format != "fbforge-connect-testflow"
            || self.version != 1
            || !name(&self.name, 160)
            || self.steps.is_empty()
            || self.steps.len() > 120
            || self
                .pack
                .cases
                .iter()
                .map(|c| &c.id)
                .collect::<HashSet<_>>()
                .len()
                != self.pack.cases.len()
        {
            return Err("test_flow_invalid");
        }
        let mut positions = HashMap::new();
        for step in &self.steps {
            let case = self
                .pack
                .cases
                .iter()
                .find(|c| c.id == step.case_id)
                .ok_or("test_flow_invalid")?;
            let mut expected = vec!["send", "receive", "compare"];
            if case.receipt != "none" {
                expected.push("receipt");
            }
            if case.reply.is_some() {
                expected.extend(["reply", "check_reply"]);
            }
            let position = positions
                .entry(&step.case_id)
                .or_insert((0, expected.len()));
            if expected.get(position.0) != Some(&step.kind.as_str()) {
                return Err("test_flow_invalid");
            }
            position.0 += 1;
        }
        if positions
            .values()
            .any(|(actual, expected)| actual != expected)
        {
            return Err("test_flow_invalid");
        }
        Ok(())
    }
    fn summary(&self, id: &str) -> Value {
        json!({"id":id,"name":self.name,"stepCount":self.steps.len(),"caseCount":self.pack.cases.len()})
    }
}
fn read(store: &TestLibrary, id: &str) -> Result<Flow, &'static str> {
    let flow: Flow =
        serde_json::from_value(store.read_document(id)?).map_err(|_| "test_flow_invalid")?;
    flow.validate()?;
    Ok(flow)
}
pub(super) fn execute(
    library: &TestLibrary,
    request: LibraryRequest,
) -> Result<Value, &'static str> {
    // A separate directory keeps old pack listings and their format unchanged.
    let store = TestLibrary(library.0.join("flows"));
    match request {
        LibraryRequest::FlowList {} => store
            .files()?
            .iter()
            .map(|(id, _)| read(&store, id).map(|flow| flow.summary(id)))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        LibraryRequest::FlowRead { id } => {
            serde_json::to_value(read(&store, &id)?).map_err(|_| "test_flow_invalid")
        }
        LibraryRequest::FlowSave { id, flow } => {
            flow.validate()?;
            store.save_document(
                &id,
                &serde_json::to_value(&flow).map_err(|_| "test_flow_invalid")?,
            )?;
            Ok(flow.summary(&id))
        }
        LibraryRequest::FlowDelete { id } => {
            fs::remove_file(store.path(&id)?).map_err(|_| "vault_unavailable")?;
            Ok(Value::Null)
        }
        _ => Err("test_flow_invalid"),
    }
}

#[cfg(test)]
#[path = "test_flow_library_tests.rs"]
mod tests;
