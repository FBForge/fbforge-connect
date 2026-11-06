use super::*;
pub(super) fn scenario() -> Value {
    json!({"format":"fbforge-connect-scenario","version":2,"id":"11111111-1111-4111-8111-111111111111","name":"Fiktiver Test","mode":"both","sharedCase":false,"pack":serde_json::from_str::<Value>(include_str!("../../frontend/src/examples/integration.fctest.json")).unwrap(),"variables":[],"variants":[{"id":"22222222-2222-4222-8222-222222222222","name":"Standard","values":[]}],"rules":[],"comparison":"exact","expectedProblem":""})
}
pub(super) fn run() -> Value {
    let scenario = scenario();
    json!({"format":"fbforge-connect-scenario-run","version":2,"id":"33333333-3333-4333-8333-333333333333","definition":scenario,"fingerprint":"a".repeat(64),"variantId":"22222222-2222-4222-8222-222222222222","environment":"TEST","assignment":{"apiVersion":"v3","senderProfileId":"","receiverProfileId":"","sourceDestination":"","receiverDestination":""},"startedAt":"2026-11-06T12:00:00Z","pack":scenario["pack"],"cursor":0,"attempts":[],"bindings":[],"reference":false,"references":[]})
}
#[test]
fn checkpoints_reject_false_references_unknown_proof_steps_and_credentials() {
    let valid = run();
    serde_json::from_value::<ScenarioRun>(valid.clone())
        .unwrap()
        .validate()
        .unwrap();
    for (field, value) in [
        ("cursor", json!(1)),
        ("reference", json!(true)),
        ("environment", json!("arbitrary")),
        (
            "references",
            json!([{"testCaseId":"foreign","path":"/x","raw":"1"}]),
        ),
    ] {
        let mut document = valid.clone();
        document[field] = value;
        assert!(serde_json::from_value::<ScenarioRun>(document)
            .unwrap()
            .validate()
            .is_err());
    }
    for field in ["sessionId", "clientSecret", "token"] {
        let mut document = valid.clone();
        document["assignment"][field] = json!("forbidden");
        assert!(serde_json::from_value::<ScenarioRun>(document).is_err());
    }
    for shared in [false, true] {
        let mut document = valid.clone();
        document["definition"]["sharedCase"] = json!(shared);
        document["bindings"] = json!([
            {"testCaseId":"antrag-mit-antwort","caseId":"11111111-1111-4111-8111-111111111111","submissionId":null,"replyId":null},
            {"testCaseId":"xml-antrag","caseId":"22222222-2222-4222-8222-222222222222","submissionId":null,"replyId":null}
        ]);
        assert_eq!(
            serde_json::from_value::<ScenarioRun>(document)
                .unwrap()
                .validate()
                .is_ok(),
            !shared
        );
    }
}
#[test]
fn scenarios_reject_credentials_unknown_fields_unsupported_versions_and_dangling_variants() {
    let valid = scenario();
    serde_json::from_value::<Scenario>(valid.clone())
        .unwrap()
        .validate()
        .unwrap();
    for field in ["clientSecret", "sessionId", "path"] {
        let mut v = valid.clone();
        v[field] = json!("forbidden");
        assert!(serde_json::from_value::<Scenario>(v).is_err());
    }
    for (field, value) in [
        ("version", json!(3)),
        ("mode", json!("arbitrary")),
        ("comparison", json!("execute")),
        ("variants", json!([])),
    ] {
        let mut v = valid.clone();
        v[field] = value;
        assert!(serde_json::from_value::<Scenario>(v)
            .unwrap()
            .validate()
            .is_err());
    }
    let mut v = valid;
    v["variants"][0]["values"] =
        json!([{"variableId":"33333333-3333-4333-8333-333333333333","value":"unknown"}]);
    assert!(serde_json::from_value::<Scenario>(v)
        .unwrap()
        .validate()
        .is_err());
}
#[test]
fn scenario_requests_have_strict_native_actions_and_no_plaintext_fallback() {
    let document = scenario();
    let request: LibraryRequest =
        serde_json::from_value(json!({"action":"scenario_save","document":document})).unwrap();
    let root = std::env::temp_dir().join(format!("fbforge-scenario-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let result = TestLibrary(root.clone()).execute(request);
    #[cfg(not(windows))]
    {
        assert_eq!(result, Err("vault_unsupported"));
        assert!(!root.exists());
    }
    #[cfg(windows)]
    {
        assert!(result.is_ok());
        let store = TestLibrary(root.clone());
        let result = store.execute(LibraryRequest::ScenarioList {}).unwrap();
        assert_eq!(result.as_array().unwrap().len(), 1);
        let mut checkpoint = run();
        let scenario: Scenario = serde_json::from_value(scenario()).unwrap();
        let steps = scenario.steps();
        checkpoint["cursor"] = json!(steps.len());
        checkpoint["reference"] = json!(true);
        checkpoint["attempts"] = json!(steps.iter().map(|step| json!({"stepId":step,"at":"2026-11-06T12:00:01Z","status":"passed","detail":"Fiktiver Nachweis","recordId":null})).collect::<Vec<_>>());
        store
            .execute(
                serde_json::from_value(json!({"action":"scenario_run_save","document":checkpoint}))
                    .unwrap(),
            )
            .unwrap();
        let id = checkpoint["id"].as_str().unwrap().to_owned();
        assert_eq!(
            store
                .execute(LibraryRequest::ScenarioRunRead { id: id.clone() })
                .unwrap(),
            checkpoint
        );
        assert_eq!(
            store.execute(LibraryRequest::ScenarioRunDelete { id: id.clone() }),
            Err("scenario_reference_protected")
        );
        checkpoint["reference"] = json!(false);
        store
            .execute(
                serde_json::from_value(json!({"action":"scenario_run_save","document":checkpoint}))
                    .unwrap(),
            )
            .unwrap();
        store
            .execute(LibraryRequest::ScenarioRunDelete { id })
            .unwrap();
        let _ = fs::remove_dir_all(root);
    }
    assert!(serde_json::from_value::<LibraryRequest>(
        json!({"action":"scenario_read","id":"../outside","clientSecret":"forbidden"})
    )
    .is_err());
}

fn with_responses() -> Value {
    let mut s = scenario();
    s["followups"] = json!([
        {"id":"44444444-4444-4444-8444-444444444444","caseId":"antrag-mit-antwort","name":"Weitere Rückmeldung","message":s["pack"]["cases"][0]["reply"]},
        {"id":"55555555-5555-4555-8555-555555555555","caseId":"antrag-mit-antwort","name":"Abschluss","message":s["pack"]["cases"][0]["reply"]}
    ]);
    s
}

#[test]
fn response_sequences_keep_legacy_step_ids_and_reject_duplicate_or_incompatible_messages() {
    let valid = with_responses();
    let s: Scenario = serde_json::from_value(valid.clone()).unwrap();
    s.validate().unwrap();
    assert!(s
        .steps()
        .contains(&"antrag-mit-antwort:check_reply".to_owned()));
    assert!(s.steps().contains(
        &"antrag-mit-antwort:check_reply:44444444-4444-4444-8444-444444444444".to_owned()
    ));
    assert_eq!(s.steps().len(), 14);
    for (pointer, value) in [
        (
            "/followups/1/id",
            json!("44444444-4444-4444-8444-444444444444"),
        ),
        ("/followups/0/caseId", json!("foreign")),
        ("/followups/0/message/schemaUri", json!("urn:foreign")),
        ("/followups/0/name", json!("")),
    ] {
        let mut input = valid.clone();
        *input.pointer_mut(pointer).unwrap() = value;
        assert!(serde_json::from_value::<Scenario>(input)
            .unwrap()
            .validate()
            .is_err());
    }
    let mut input = valid;
    input["followups"][0]["clientSecret"] = json!("forbidden");
    assert!(serde_json::from_value::<Scenario>(input).is_err());
}

#[test]
fn resolved_response_checkpoints_and_comparison_details_are_bounded_and_strict() {
    let mut valid = run();
    let s = with_responses();
    valid["definition"] = s.clone();
    valid["followups"] = s["followups"].clone();
    valid["replyBindings"] = json!([
        {"messageId":"first:antrag-mit-antwort","replyId":"66666666-6666-4666-8666-666666666666"},
        {"messageId":"44444444-4444-4444-8444-444444444444","replyId":"77777777-7777-4777-8777-777777777777"}
    ]);
    valid["attempts"] = json!([{"stepId":"antrag-mit-antwort:send","status":"failed","at":"2026-11-06T12:00:01Z","detail":"Inhalt weicht ab","recordId":null,"differences":[{"path":"/status","expected":"eingegangen","actual":"abgeschlossen"}],"differencesOmitted":false,"context":{"caseId":"66666666-6666-4666-8666-666666666666","submissionId":null,"replyId":null}}]);
    let parsed: ScenarioRun = serde_json::from_value(valid.clone()).unwrap();
    parsed.validate().unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), valid);
    for (pointer, value) in [
        (
            "/followups/1/id",
            json!("44444444-4444-4444-8444-444444444444"),
        ),
        (
            "/replyBindings/1/replyId",
            json!("66666666-6666-4666-8666-666666666666"),
        ),
        ("/replyBindings/1/messageId", json!("foreign")),
        ("/attempts/0/differences/0/path", json!("")),
        ("/attempts/0/differences/0/actual", json!("x".repeat(513))),
        ("/attempts/0/context/caseId", json!("../outside")),
    ] {
        let mut input = valid.clone();
        *input.pointer_mut(pointer).unwrap() = value;
        assert!(serde_json::from_value::<ScenarioRun>(input)
            .unwrap()
            .validate()
            .is_err());
    }
    let mut large = valid.clone();
    large["attempts"][0]["differences"] = json!((0..21)
        .map(|_| json!({"path":"/x","expected":"a","actual":"b"}))
        .collect::<Vec<_>>());
    assert!(serde_json::from_value::<ScenarioRun>(large)
        .unwrap()
        .validate()
        .is_err());
    let mut large = valid;
    let row = json!({"stepId":"antrag-mit-antwort:send","status":"failed","at":"2026-11-06T12:00:01Z","detail":"Abweichung","recordId":null,"differences":[{"path":"/x","expected":"a".repeat(512),"actual":"b".repeat(512)}]});
    large["attempts"] = json!((0..150).map(|_| row.clone()).collect::<Vec<_>>());
    assert!(serde_json::from_value::<ScenarioRun>(large)
        .unwrap()
        .validate()
        .is_err());
}

#[test]
fn summary_outcomes_never_treat_a_partial_or_manual_run_as_fully_proven() {
    let mut value = run();
    let steps = serde_json::from_value::<ScenarioRun>(value.clone())
        .unwrap()
        .definition
        .steps();
    value["attempts"] = json!(steps.iter().map(|step|json!({"stepId":step,"status":"passed","at":"2026-11-06T12:00:01Z","detail":"Fiktiver Nachweis","recordId":null})).collect::<Vec<_>>());
    assert_eq!(
        serde_json::from_value::<ScenarioRun>(value.clone())
            .unwrap()
            .outcome(),
        "pending"
    );
    value["cursor"] = json!(steps.len());
    assert_eq!(
        serde_json::from_value::<ScenarioRun>(value.clone())
            .unwrap()
            .outcome(),
        "passed"
    );
    value["attempts"][0]["status"] = json!("manual");
    assert_eq!(
        serde_json::from_value::<ScenarioRun>(value)
            .unwrap()
            .outcome(),
        "manual"
    );
}
