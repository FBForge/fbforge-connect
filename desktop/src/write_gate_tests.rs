use super::*;
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::sync::{
    atomic::{AtomicBool, AtomicU8, Ordering},
    Mutex,
};
pub(super) const SESSION: &str = "710f7b8d-b2d9-49eb-82ec-2e42a748286b";
pub(super) const OTHER: &str = "810f7b8d-b2d9-49eb-82ec-2e42a748286b";

#[derive(Default)]
pub(super) struct Fake {
    environment: AtomicU8,
    switch_on_confirm: AtomicBool,
    events: Mutex<Vec<Value>>,
    pub(super) responses: Mutex<VecDeque<Result<SessionResource, &'static str>>>,
    failures: Mutex<HashMap<&'static str, VecDeque<Result<(), &'static str>>>>,
}
pub(super) fn response(data: Value) -> SessionResource {
    SessionResource {
        api_version: ApiVersion::V2,
        session_id: SESSION.into(),
        environment: "TEST".into(),
        data,
    }
}
impl Fake {
    pub(super) fn with(data: Vec<Value>) -> Self {
        Self {
            responses: Mutex::new(data.into_iter().map(|v| Ok(response(v))).collect()),
            ..Self::default()
        }
    }
    pub(super) fn fail(&self, name: &'static str, results: Vec<Result<(), &'static str>>) {
        self.failures.lock().unwrap().insert(name, results.into());
    }
    pub(super) fn events(&self) -> Vec<Value> {
        self.events.lock().unwrap().clone()
    }
    pub(super) fn commands(&self) -> Vec<Value> {
        self.events()
            .into_iter()
            .filter(|v| v.get("command").is_some())
            .collect()
    }
    pub(super) async fn run(&self, operation: &str) -> Result<Value, &'static str> {
        run(
            self,
            ApiVersion::V2,
            SESSION,
            json!({"command":operation,"attemptId":"attempt"}),
        )
        .await
        .map(|v| v.data)
    }
}
impl Context for Fake {
    fn environment(&self) -> Environment {
        Environment::from_code(self.environment.load(Ordering::Relaxed))
    }
    async fn request(&self, command: Value) -> Result<SessionResource, &'static str> {
        self.events.lock().unwrap().push(command);
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected engine call")
    }
    async fn effect(&self, effect: Effect<'_>) -> Result<(), &'static str> {
        let (name, detail) = match effect {
            Effect::EnsureScanner => ("scanner", Value::Null),
            Effect::ConfirmProduction(action) => {
                if self.switch_on_confirm.load(Ordering::Relaxed) {
                    self.environment.store(0, Ordering::Relaxed);
                }
                ("production", json!(action))
            }
            Effect::RequireProfile => ("profile", Value::Null),
            Effect::CheckpointProfile => ("save_profile", Value::Null),
            Effect::CheckpointCases => ("save_cases", Value::Null),
            Effect::ConfirmAttachments(count) => ("attachments", json!(count)),
            Effect::ConfirmSchema => ("schema", Value::Null),
            Effect::MarkRunning(attempt) => ("running", json!(attempt)),
            Effect::InvalidateEngine => ("invalidate", Value::Null),
            Effect::Journal(data) => ("journal", data.clone()),
            Effect::RecordCaseError(error) => ("case_error", json!(error)),
        };
        self.events
            .lock()
            .unwrap()
            .push(json!({"effect":name,"detail":detail}));
        self.failures
            .lock()
            .unwrap()
            .get_mut(name)
            .and_then(|v| v.pop_front())
            .unwrap_or(Ok(()))
    }
}
pub(super) fn effect(name: &str) -> Value {
    json!({"effect":name,"detail":null})
}
pub(super) fn intent(status: &str) -> Value {
    json!({"attemptId":"attempt","status":status,"bundleId":null,"configurationJson":"{\"type\":\"C\"}"})
}

#[tokio::test]
async fn session_and_api_come_from_native_context_and_invalid_sessions_never_reach_io() {
    for api in [ApiVersion::V2, ApiVersion::V3] {
        let fake = Fake::default();
        fake.responses
            .lock()
            .unwrap()
            .push_back(Ok(SessionResource {
                api_version: api,
                ..response(json!({}))
            }));
        run(
            &fake,
            api,
            SESSION,
            json!({"command":"load_destination","apiVersion":"v999","sessionId":OTHER}),
        )
        .await
        .unwrap();
        assert_eq!(
            fake.commands(),
            vec![json!({"command":"load_destination","apiVersion":api,"sessionId":SESSION})]
        );
        assert_eq!(
            run(&fake, api, "../session", json!({"command":"execute_send"}))
                .await
                .err(),
            Some("session_missing")
        );
        assert_eq!(fake.events().len(), 1);
    }
}

#[tokio::test]
async fn scanner_failure_blocks_all_content_operations_before_dispatch() {
    for operation in [
        "verify_submission",
        "verify_reply",
        "prepare_send",
        "prepare_reply",
        "execute_send",
        "execute_reply",
    ] {
        let fake = Fake::default();
        fake.fail("scanner", vec![Err("scanner_unavailable")]);
        assert_eq!(fake.run(operation).await, Err("scanner_unavailable"));
        assert_eq!(fake.events(), vec![effect("scanner")]);
    }
}

#[tokio::test]
async fn every_production_write_requires_native_confirmation_and_rechecks_environment() {
    for operation in [
        "execute_send",
        "execute_reply",
        "execute_receipt",
        "execute_reply_receipt",
        "execute_destination_update",
        "execute_destination_creation",
        "execute_destination_rotation",
        "execute_destination_cleanup",
    ] {
        for switch in [false, true] {
            let fake = Fake::default();
            fake.environment.store(2, Ordering::Relaxed);
            if switch {
                fake.switch_on_confirm.store(true, Ordering::Relaxed);
            } else {
                fake.fail("production", vec![Err("environment_cancelled")]);
            }
            assert_eq!(
                fake.run(operation).await,
                Err(if switch {
                    "environment_mismatch"
                } else {
                    "environment_cancelled"
                })
            );
            assert!(fake.commands().is_empty());
            assert!(fake.events().iter().any(|v| v["effect"] == "production"));
        }
    }
    let fake = Fake::with(vec![json!({})]);
    fake.environment.store(2, Ordering::Relaxed);
    fake.run("load_destination").await.unwrap();
    assert_eq!(fake.events().len(), 1);
}

#[tokio::test]
async fn operations_requiring_durable_keys_fail_without_a_valid_profile() {
    for operation in [
        "import_certified_keys",
        "generate_test_keys",
        "prepare_destination_rotation",
        "execute_destination_rotation",
    ] {
        let fake = Fake::default();
        fake.fail("profile", vec![Err("vault_pending")]);
        assert_eq!(fake.run(operation).await, Err("vault_pending"));
        assert_eq!(fake.events(), vec![effect("profile")]);
    }
    for document in [Value::Null, json!("not json")] {
        let fake = Fake::default();
        assert_eq!(
            run(
                &fake,
                ApiVersion::V2,
                SESSION,
                json!({"command":"prepare_destination_creation","destinationDocument":document})
            )
            .await
            .err(),
            Some("invalid_input")
        );
        assert!(fake.events().is_empty());
    }
    let fake = Fake::default();
    fake.fail("profile", vec![Err("vault_profile_required")]);
    assert_eq!(run(&fake,ApiVersion::V2,SESSION,json!({"command":"prepare_destination_creation","destinationDocument":"{\"configuration\":{\"type\":\"A\"}}"})).await.err(),Some("vault_profile_required"));
    assert!(fake.commands().is_empty());
}

#[tokio::test]
async fn expired_creation_and_rotation_intents_are_saved_without_dispatching_a_write() {
    for operation in [
        "execute_destination_creation",
        "execute_destination_rotation",
    ] {
        let expired = intent("expired");
        let fake = Fake::with(vec![expired.clone()]);
        assert_eq!(fake.run(operation).await, Ok(expired));
        assert_eq!(fake.commands().len(), 1);
        assert!(fake.commands()[0]["command"]
            .as_str()
            .unwrap()
            .starts_with("mark_destination_"));
        assert_eq!(fake.events().last(), Some(&effect("save_profile")));
    }
}

#[tokio::test]
async fn forged_or_malformed_dispatch_intents_never_authorize_a_write() {
    let mut bad = vec![json!({}), intent("running"), intent("uncertain")];
    let mut wrong_id = intent("prepared");
    wrong_id["attemptId"] = json!("other");
    bad.push(wrong_id);
    for configuration in [
        "not json",
        "{\"type\":\"A\"}",
        "{\"type\":\"C\",\"encryptionKid\":null}",
        "{\"type\":\"C\",\"encryptionPublicKey\":{}}",
        "{\"type\":\"C\",\"signingPublicKey\":{}}",
    ] {
        let mut item = intent("prepared");
        item["configurationJson"] = json!(configuration);
        bad.push(item);
    }
    let mut missing = intent("prepared");
    missing.as_object_mut().unwrap().remove("configurationJson");
    bad.push(missing);
    for data in bad {
        let fake = Fake::with(vec![data]);
        assert_eq!(
            fake.run("execute_destination_creation").await,
            Err("engine_protocol_error")
        );
        assert_eq!(fake.commands().len(), 1);
    }
    for operation in [
        "execute_destination_creation",
        "execute_destination_rotation",
    ] {
        for field in ["api", "session", "data"] {
            let fake = Fake::default();
            let mut value = response(intent("prepared"));
            match field {
                "api" => value.api_version = ApiVersion::V3,
                "session" => value.session_id = OTHER.into(),
                _ => value.data = json!([]),
            }
            fake.responses.lock().unwrap().push_back(Ok(value));
            assert_eq!(fake.run(operation).await, Err("engine_protocol_error"));
            assert_eq!(fake.commands().len(), 1);
        }
    }
}

#[tokio::test]
async fn durable_dispatch_intent_precedes_remote_creation_and_profile_failure_blocks_it() {
    for bundle in [Value::Null, json!("bundle")] {
        let mut prepared = intent("prepared");
        prepared["bundleId"] = bundle;
        let fake = Fake::with(vec![prepared.clone(), json!({"status":"succeeded"})]);
        fake.run("execute_destination_creation").await.unwrap();
        let events = fake.events();
        let checkpoint = events
            .iter()
            .position(|v| v["effect"] == "save_profile")
            .unwrap();
        let execute = events
            .iter()
            .position(|v| v["command"] == "execute_destination_creation")
            .unwrap();
        assert!(checkpoint < execute);
        let fake = Fake::with(vec![prepared]);
        fake.fail("save_profile", vec![Err("vault_unavailable")]);
        assert_eq!(
            fake.run("execute_destination_creation").await,
            Err("vault_unavailable")
        );
        assert_eq!(fake.commands().len(), 1);
    }
}

#[tokio::test]
async fn receipt_reviews_are_bound_to_attempt_and_native_confirmation_cannot_be_skipped() {
    for operation in ["execute_receipt", "execute_reply_receipt"] {
        for blocked in [0, 1, 39] {
            let fake = Fake::with(vec![
                json!({"requiresConfirmation":true,"attachmentProblemCount":blocked}),
            ]);
            let name = if blocked == 0 {
                "schema"
            } else {
                "attachments"
            };
            fake.fail(name, vec![Err("review_cancelled")]);
            assert_eq!(fake.run(operation).await, Err("review_cancelled"));
            assert_eq!(
                fake.commands(),
                vec![
                    json!({"command":if operation=="execute_receipt" {"receipt_review"} else {"reply_receipt_review"},"apiVersion":"v2","sessionId":SESSION,"attemptId":"attempt"})
                ]
            );
            assert_eq!(
                fake.events().last().unwrap()["detail"],
                if blocked == 0 {
                    Value::Null
                } else {
                    json!(blocked)
                }
            );
        }
        for review in [
            json!({}),
            json!({"requiresConfirmation":null,"attachmentProblemCount":0}),
            json!({"requiresConfirmation":true,"attachmentProblemCount":40}),
            json!({"requiresConfirmation":true,"attachmentProblemCount":-1}),
            json!({"requiresConfirmation":true,"attachmentProblemCount":"1"}),
            json!({"requiresConfirmation":false,"attachmentProblemCount":0,"extra":true}),
        ] {
            let fake = Fake::with(vec![review]);
            assert_eq!(fake.run(operation).await, Err("engine_protocol_error"));
            assert_eq!(fake.commands().len(), 1);
        }
    }
}
