use super::tests::*;
use super::*;
use serde_json::json;

#[tokio::test]
async fn malware_verdict_quarantines_only_the_affected_message_without_replaying_the_request() {
    for operation in ["verify_submission", "verify_reply"] {
        for storage_failure in [false, true] {
            let fake = Fake::default();
            fake.responses
                .lock()
                .unwrap()
                .push_back(Err("malware_detected"));
            if storage_failure {
                fake.fail("quarantine_case", vec![Err("vault_unavailable")]);
            }
            let command = json!({"command":operation,"submissionId":OTHER,"destinationId":SESSION,"replyId":OTHER,"caseId":SESSION});
            assert_eq!(
                run(&fake, ApiVersion::V2, SESSION, command).await.err(),
                Some("malware_detected")
            );
            assert_eq!(fake.commands().len(), 1);
            let kind = if operation == "verify_reply" {
                "reply"
            } else {
                "submission"
            };
            assert!(fake.events().contains(&json!({"effect":"quarantine_case","detail":{"kind":kind,"subject":OTHER,"context":SESSION}})));
            assert!(fake.events().contains(&json!({"effect":"case_error","detail":if storage_failure { Some("malware_detected") } else { None }})));
            assert!(!fake.events().contains(&effect("save_cases")));
        }
        let fake = Fake::default();
        fake.responses
            .lock()
            .unwrap()
            .push_back(Err("scanner_unavailable"));
        assert_eq!(fake.run(operation).await, Err("scanner_unavailable"));
        assert!(!fake
            .events()
            .iter()
            .any(|event| event["effect"] == "quarantine_case"));
    }
}

#[tokio::test]
async fn case_save_failure_before_receipt_blocks_acknowledgement() {
    let fake = Fake::with(vec![
        json!({"requiresConfirmation":false,"attachmentProblemCount":0}),
    ]);
    fake.fail("save_cases", vec![Err("case_storage_unavailable")]);
    assert_eq!(
        fake.run("execute_receipt").await,
        Err("case_storage_pending")
    );
    assert_eq!(fake.commands().len(), 1);
}

#[tokio::test]
async fn completed_remote_writes_survive_post_write_storage_failures_without_retry() {
    for operation in [
        "execute_send",
        "execute_reply",
        "execute_receipt",
        "execute_reply_receipt",
    ] {
        let outcome = json!({"status":"succeeded","submissionId":"remote-id"});
        let mut responses = vec![];
        let receipt = operation.contains("receipt");
        if receipt {
            responses.push(json!({"requiresConfirmation":false,"attachmentProblemCount":0}));
        }
        responses.push(outcome.clone());
        let fake = Fake::with(responses);
        fake.fail(
            "save_cases",
            if receipt {
                vec![Ok(()), Err("case_storage_unavailable")]
            } else {
                vec![Err("case_storage_unavailable")]
            },
        );
        fake.fail("save_profile", vec![Err("vault_unavailable")]);
        assert_eq!(fake.run(operation).await, Ok(outcome));
        assert_eq!(
            fake.commands()
                .iter()
                .filter(|v| v["command"] == operation)
                .count(),
            1
        );
        assert!(fake
            .events()
            .contains(&json!({"effect":"case_error","detail":"case_storage_unavailable"})));
    }
    let fake = Fake::with(vec![json!({})]);
    fake.run("verify_reply").await.unwrap();
    assert!(fake.events().contains(&effect("case_error")));
}

#[tokio::test]
async fn preparation_storage_failures_cancel_only_the_prepared_attempt() {
    for (operation, cancel, data) in [
        (
            "prepare_send",
            "cancel_send",
            json!({"attempt":{"attemptId":"prepared"}}),
        ),
        (
            "prepare_destination_creation",
            "cancel_destination_creation",
            json!({"attemptId":"prepared"}),
        ),
        (
            "prepare_destination_rotation",
            "cancel_destination_rotation",
            json!({"attemptId":"prepared"}),
        ),
    ] {
        let fake = Fake::with(vec![data, json!({})]);
        fake.fail("save_profile", vec![Err("vault_unavailable")]);
        let mut command = json!({"command":operation});
        if operation == "prepare_destination_creation" {
            command["destinationDocument"] = json!("{\"configuration\":{\"type\":\"C\"}}");
        }
        assert_eq!(
            run(&fake, ApiVersion::V2, SESSION, command).await.err(),
            Some("vault_unavailable")
        );
        assert_eq!(fake.commands().len(), 2);
        assert_eq!(
            fake.commands()[1],
            json!({"command":cancel,"apiVersion":"v2","sessionId":SESSION,"attemptId":"prepared"})
        );
    }
    for operation in [
        "import_certified_keys",
        "generate_test_keys",
        "remove_key_inventory_item",
    ] {
        let fake = Fake::with(vec![json!({})]);
        fake.fail("save_profile", vec![Err("vault_unavailable")]);
        assert_eq!(fake.run(operation).await, Err("vault_unavailable"));
        assert_eq!(fake.commands().len(), 1);
    }
}

#[tokio::test]
async fn destination_update_journal_is_required_before_execution_but_never_hides_a_remote_result() {
    let fake = Fake::default();
    fake.fail("running", vec![Err("vault_unavailable")]);
    assert_eq!(
        fake.run("execute_destination_update").await,
        Err("vault_unavailable")
    );
    assert!(fake.commands().is_empty());
    for operation in [
        "prepare_destination_update",
        "execute_destination_update",
        "destination_update_state",
        "cancel_destination_update",
    ] {
        let data = json!({"attemptId":"attempt","status":"succeeded"});
        let fake = Fake::with(vec![data.clone()]);
        fake.fail("journal", vec![Err("vault_unavailable")]);
        assert_eq!(
            fake.run(operation).await,
            if operation == "prepare_destination_update" {
                Err("vault_unavailable")
            } else {
                Ok(data)
            }
        );
        assert_eq!(fake.commands().len(), 1);
    }
}

#[tokio::test]
async fn invalid_result_invalidates_engine_and_transport_failures_never_trigger_a_retry() {
    for field in ["api", "session", "environment", "data"] {
        let fake = Fake::default();
        let mut value = response(json!({}));
        match field {
            "api" => value.api_version = ApiVersion::V3,
            "session" => value.session_id = OTHER.into(),
            "environment" => value.environment = "other".into(),
            _ => value.data = json!([]),
        }
        fake.responses.lock().unwrap().push_back(Ok(value));
        assert_eq!(fake.run("execute_send").await, Err("engine_protocol_error"));
        assert_eq!(fake.events().last(), Some(&effect("invalidate")));
        assert_eq!(fake.commands().len(), 1);
    }
    for code in ["engine_timeout", "resource_denied", "engine_protocol_error"] {
        let fake = Fake::default();
        fake.responses.lock().unwrap().push_back(Err(code));
        assert_eq!(fake.run("execute_send").await, Err(code));
        assert_eq!(fake.commands().len(), 1);
    }
}
