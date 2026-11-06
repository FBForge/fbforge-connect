use super::*;
fn scenario() -> Value {
    json!({"format":"fbforge-connect-scenario","version":2,"id":"11111111-1111-4111-8111-111111111111","name":"Fiktiver Test","mode":"both","sharedCase":false,"pack":serde_json::from_str::<Value>(include_str!("../../frontend/src/examples/integration.fctest.json")).unwrap(),"variables":[],"variants":[{"id":"22222222-2222-4222-8222-222222222222","name":"Standard","values":[]}],"rules":[],"comparison":"exact","expectedProblem":""})
}
fn run() -> Value {
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
        let _ = fs::remove_dir_all(root);
    }
    assert!(serde_json::from_value::<LibraryRequest>(
        json!({"action":"scenario_read","id":"../outside","clientSecret":"forbidden"})
    )
    .is_err());
}
