//! Resumable runs contain public profile references and historical checks, never sessions or credentials.
use super::*;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedRun {
    flow: flows::Flow,
    run: Run,
    context: Context,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Context {
    pub(super) sender_profile_id: String,
    pub(super) receiver_profile_id: String,
    pub(super) api_version: String,
    pub(super) source_destination: String,
    pub(super) receiver_destination: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Run {
    id: String,
    environment: String,
    started_at: u64,
    results: Vec<Check>,
    bindings: std::collections::HashMap<String, Binding>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Binding {
    case_id: String,
    submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_id: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Check {
    step: String,
    test_case_id: String,
    record_id: String,
    case_id: String,
    submission_id: Option<String>,
    reply_id: Option<String>,
    checked_at: String,
    status: String,
}
impl SavedRun {
    fn validate(&self, id: &str) -> Result<(), &'static str> {
        self.flow.validate()?;
        if self.run.id != id
            || !valid_session_id(id)
            || !["TEST", "STAGE", "PROD"].contains(&self.run.environment.as_str())
            || self.run.started_at == 0
            || self.run.results.len() > self.flow.steps.len()
            || self.run.bindings.len() > 20
            || !["v2", "v3"].contains(&self.context.api_version.as_str())
        {
            return Err("test_flow_invalid");
        }
        for value in [
            &self.context.sender_profile_id,
            &self.context.receiver_profile_id,
            &self.context.source_destination,
            &self.context.receiver_destination,
        ] {
            if !value.is_empty() && !valid_session_id(value) {
                return Err("test_flow_invalid");
            }
        }
        for (key, binding) in &self.run.bindings {
            if !self.flow.pack.cases.iter().any(|case| &case.id == key)
                || !valid_session_id(&binding.case_id)
                || [&binding.submission_id, &binding.reply_id]
                    .iter()
                    .any(|v| v.as_ref().is_some_and(|id| !valid_session_id(id)))
            {
                return Err("test_flow_invalid");
            }
        }
        for (check, step) in self.run.results.iter().zip(&self.flow.steps) {
            if check.step != step.kind
                || check.test_case_id != step.case_id
                || check.status != "passed"
                || !valid_session_id(&check.record_id)
                || !valid_session_id(&check.case_id)
                || [&check.submission_id, &check.reply_id]
                    .iter()
                    .any(|v| v.as_ref().is_some_and(|id| !valid_session_id(id)))
                || check.checked_at.len() > 40
                || check.checked_at.is_empty()
            {
                return Err("test_flow_invalid");
            }
        }
        Ok(())
    }
}
pub(super) fn execute(
    library: &TestLibrary,
    request: LibraryRequest,
) -> Result<Value, &'static str> {
    let store = TestLibrary(library.0.join("runs"));
    let read = |id: &str| -> Result<SavedRun, &'static str> {
        let value: SavedRun =
            serde_json::from_value(store.read_document(id)?).map_err(|_| "test_flow_invalid")?;
        value.validate(id)?;
        Ok(value)
    };
    match request {
 LibraryRequest::RunList {} => store.files()?.iter().map(|(id,_)| { let saved=read(id)?; Ok(json!({"id":id,"name":saved.flow.name,"environment":saved.run.environment,"passed":saved.run.results.len(),"total":saved.flow.steps.len()})) }).collect::<Result<Vec<_>,_>>().map(Value::Array),
 LibraryRequest::RunRead {id} => serde_json::to_value(read(&id)?).map_err(|_| "test_flow_invalid"),
 LibraryRequest::RunDelete {id} => { fs::remove_file(store.path(&id)?).map_err(|_| "vault_unavailable")?; Ok(Value::Null) },
 LibraryRequest::RunSave {id,document} => {
 document.validate(&id)?;
 let mut plain=serde_json::to_vec(&document).map_err(|_| "test_flow_invalid")?;
 if plain.len()>MAX_PACK { return Err("test_pack_limit"); }
 let encrypted=protection::transform_with_purpose(&plain,true,&TestLibrary::purpose(&id)); plain.fill(0); let encrypted=encrypted?;
 let files=store.files()?;
 if files.len()>=MAX_ENTRIES && !files.iter().any(|(saved,_)|saved==&id) || files.iter().filter(|(saved,_)| saved!=&id).map(|(_,size)|size).sum::<u64>()+encrypted.len() as u64>MAX_STORE { return Err("vault_limit"); }
 fs::create_dir_all(&store.0).map_err(|_| "vault_unavailable")?;
 crate::vault::write_protected(&store.path(&id)?,&encrypted)?; Ok(Value::Null)
 }, _=>Err("test_flow_invalid") }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "11111111-1111-4111-8111-111111111111";
    fn document() -> Value {
        let pack: Value = serde_json::from_str(include_str!(
            "../../frontend/src/examples/integration.fctest.json"
        ))
        .unwrap();
        let steps: Vec<_> = pack["cases"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|case| {
                let mut kinds = vec!["send", "receive", "compare"];
                if case["receipt"] != "none" {
                    kinds.push("receipt");
                }
                if !case["reply"].is_null() {
                    kinds.extend(["reply", "check_reply"]);
                }
                kinds
                    .into_iter()
                    .map(|kind| json!({"caseId":case["id"],"type":kind}))
                    .collect::<Vec<_>>()
            })
            .collect();
        json!({"flow":{"format":"fbforge-connect-testflow","version":1,"name":"Fiktiver Durchlauf","pack":pack,"steps":steps},"run":{"id":ID,"environment":"TEST","startedAt":1,"results":[],"bindings":{}},"context":{"senderProfileId":ID,"receiverProfileId":"","apiVersion":"v3","sourceDestination":"","receiverDestination":""}})
    }
    #[test]
    fn resumable_runs_reject_sessions_credentials_foreign_results_and_invalid_context() {
        serde_json::from_value::<SavedRun>(document())
            .unwrap()
            .validate(ID)
            .unwrap();
        for field in ["sessionId", "clientSecret", "token"] {
            let mut value = document();
            value["run"][field] = json!("never persist");
            assert!(serde_json::from_value::<SavedRun>(value).is_err());
        }
        let mut value = document();
        value["context"]["senderProfileId"] = json!("not-a-profile");
        assert!(serde_json::from_value::<SavedRun>(value)
            .unwrap()
            .validate(ID)
            .is_err());
        let mut value = document();
        value["run"]["bindings"] =
            json!({"foreign":{"caseId":ID,"submissionId":null,"replyId":null}});
        assert!(serde_json::from_value::<SavedRun>(value)
            .unwrap()
            .validate(ID)
            .is_err());
    }
    #[test]
    fn saving_runs_never_falls_back_to_plaintext_and_windows_can_replace_a_checkpoint() {
        let root = std::env::temp_dir().join(format!(
            "fbforge-runs-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = TestLibrary(root.clone());
        let result = store.execute(LibraryRequest::RunSave {
            id: ID.into(),
            document: serde_json::from_value(document()).unwrap(),
        });
        if cfg!(windows) {
            result.unwrap();
            store
                .execute(LibraryRequest::RunSave {
                    id: ID.into(),
                    document: serde_json::from_value(document()).unwrap(),
                })
                .unwrap();
            let value = store
                .execute(LibraryRequest::RunRead { id: ID.into() })
                .unwrap();
            assert_eq!(value["context"], document()["context"]);
            let bytes = fs::read(root.join("runs").join(format!("{ID}.fctest"))).unwrap();
            assert!(!String::from_utf8_lossy(&bytes).contains("Fiktiver Durchlauf"));
        } else {
            assert_eq!(result, Err("vault_unsupported"));
            assert!(!root.exists());
        }
        let _ = fs::remove_dir_all(root);
    }
}
