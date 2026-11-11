//! One encrypted, bounded unfinished preparation per environment. Never executes a test.
use super::*;
const ID: &str = "00000000-0000-4000-8000-000000000040";
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preparation {
    format: String,
    version: u8,
    definition: Scenario,
    assignment: Assignment,
    variant_id: String,
    environment: String,
    saved_at: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Assignment {
    api_version: String,
    sender_profile_id: String,
    receiver_profile_id: String,
    source_destination: String,
    receiver_destination: String,
}
fn store(library: &TestLibrary, environment: &str) -> Result<TestLibrary, &'static str> {
    if !["TEST", "STAGE", "PROD"].contains(&environment) {
        return Err("scenario_invalid");
    }
    Ok(TestLibrary(
        library.0.join("preparations-v1").join(environment),
    ))
}
impl Preparation {
    fn validate(&self) -> Result<(), &'static str> {
        let a = &self.assignment;
        if self.format != "fbforge-connect-preparation"
            || self.version != 1
            || !["TEST", "STAGE", "PROD"].contains(&self.environment.as_str())
            || !["v2", "v3"].contains(&a.api_version.as_str())
            || [
                &a.sender_profile_id,
                &a.receiver_profile_id,
                &a.source_destination,
                &a.receiver_destination,
            ]
            .iter()
            .any(|v| v.len() > 160)
            || self.saved_at.len() > 40
            || !self.saved_at.contains('T')
            || !valid_session_id(&self.variant_id)
            || !self
                .definition
                .variants
                .iter()
                .any(|v| v.id == self.variant_id)
        {
            return Err("scenario_invalid");
        }
        let value = serde_json::to_value(&self.definition).map_err(|_| "scenario_invalid")?;
        let mut normalized: Scenario =
            serde_json::from_value(value).map_err(|_| "scenario_invalid")?;
        fn placeholder(value: &mut String, max: usize) -> Result<(), &'static str> {
            if value.len() > max {
                return Err("scenario_invalid");
            }
            if value.trim().is_empty() {
                *value = "Vorbereitung".into();
            }
            Ok(())
        }
        placeholder(&mut normalized.name, 160)?;
        placeholder(&mut normalized.pack.name, 160)?;
        for c in &mut normalized.pack.cases {
            placeholder(&mut c.name, 160)?;
        }
        for f in normalized.followups.iter_mut().flatten() {
            placeholder(&mut f.name, 160)?;
        }
        for v in &mut normalized.variables {
            placeholder(&mut v.label, 160)?;
            placeholder(&mut v.path, 1024)?;
        }
        for r in &mut normalized.rules {
            placeholder(&mut r.path, 1024)?;
        }
        for v in &mut normalized.variants {
            placeholder(&mut v.name, 160)?;
        }
        if normalized.expected_problem.len() > 4096 {
            return Err("scenario_invalid");
        }
        normalized.expected_problem.clear();
        if normalized.comparison == "rules" && normalized.rules.is_empty() {
            normalized.comparison = "exact".into();
        }
        normalized.validate()
    }
}
pub(crate) fn execute(
    library: &TestLibrary,
    request: LibraryRequest,
) -> Result<Value, &'static str> {
    match request {
        LibraryRequest::PreparationRead { environment } => {
            let store = store(library, &environment)?;
            if !store
                .path(ID)?
                .try_exists()
                .map_err(|_| "vault_unavailable")?
            {
                return Ok(Value::Null);
            }
            let p: Preparation =
                serde_json::from_value(store.read_document(ID)?).map_err(|_| "scenario_invalid")?;
            p.validate()?;
            if p.environment != environment {
                return Err("scenario_invalid");
            }
            serde_json::to_value(p).map_err(|_| "scenario_invalid")
        }
        LibraryRequest::PreparationSave { document } => {
            document.validate()?;
            let store = store(library, &document.environment)?;
            store.upsert_document(
                ID,
                &serde_json::to_value(document).map_err(|_| "scenario_invalid")?,
            )?;
            Ok(Value::Null)
        }
        LibraryRequest::PreparationDelete { environment } => {
            let path = store(library, &environment)?.path(ID)?;
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("vault_unavailable"),
            }
            Ok(Value::Null)
        }
        _ => Err("scenario_invalid"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Value {
        let mut definition = super::super::tests::scenario();
        definition["name"] = json!("");
        definition["pack"]["cases"][0]["request"]["data"] = json!("{\"unfinished\":");
        json!({"format":"fbforge-connect-preparation","version":1,"definition":definition,"assignment":{"apiVersion":"v3","senderProfileId":"","receiverProfileId":"","sourceDestination":"","receiverDestination":""},"variantId":"22222222-2222-4222-8222-222222222222","environment":"TEST","savedAt":"2026-11-11T10:00:00Z"})
    }
    #[test]
    fn preparation_accepts_unfinished_data_but_rejects_credentials_and_unknown_environments() {
        let p = sample();
        serde_json::from_value::<Preparation>(p.clone())
            .unwrap()
            .validate()
            .unwrap();
        for field in ["clientSecret", "password", "sessionId"] {
            let mut bad = p.clone();
            bad["assignment"][field] = json!("forbidden");
            assert!(serde_json::from_value::<Preparation>(bad).is_err());
        }
        let mut bad = p;
        bad["environment"] = json!("../outside");
        assert!(serde_json::from_value::<Preparation>(bad)
            .unwrap()
            .validate()
            .is_err());
    }
    #[test]
    fn preparation_storage_is_environment_bound_and_never_falls_back_to_plaintext() {
        let root = std::env::temp_dir().join(format!(
            "fbforge-preparation-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let library = TestLibrary(root.clone());
        assert_eq!(
            execute(
                &library,
                LibraryRequest::PreparationRead {
                    environment: "TEST".into()
                }
            )
            .unwrap(),
            Value::Null
        );
        let result = execute(
            &library,
            LibraryRequest::PreparationSave {
                document: serde_json::from_value(sample()).unwrap(),
            },
        );
        if cfg!(windows) {
            result.unwrap();
            let value = execute(
                &library,
                LibraryRequest::PreparationRead {
                    environment: "TEST".into(),
                },
            )
            .unwrap();
            assert_eq!(
                value["definition"]["pack"]["cases"][0]["request"]["data"],
                json!("{\"unfinished\":")
            );
            assert_eq!(
                execute(
                    &library,
                    LibraryRequest::PreparationRead {
                        environment: "STAGE".into()
                    }
                )
                .unwrap(),
                Value::Null
            );
        } else {
            assert_eq!(result, Err("vault_unsupported"));
            assert!(!root.exists());
        }
        execute(
            &library,
            LibraryRequest::PreparationDelete {
                environment: "TEST".into(),
            },
        )
        .unwrap();
        execute(
            &library,
            LibraryRequest::PreparationDelete {
                environment: "TEST".into(),
            },
        )
        .unwrap();
        let _ = fs::remove_dir_all(root);
    }
}
