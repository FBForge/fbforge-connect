use super::*;
const SESSION: &str = "710f7b8d-b2d9-49eb-82ec-2e42a748286b";
const PROOF: &str = "810f7b8d-b2d9-49eb-82ec-2e42a748286b";
const MESSAGE: &str = "910f7b8d-b2d9-49eb-82ec-2e42a748286b";
fn source(local: bool, reply: bool) -> Source {
    Source {
        proof_id: if local { None } else { Some(PROOF.into()) },
        record_id: if local { Some(PROOF.into()) } else { None },
        message_id: MESSAGE.into(),
        reply,
    }
}
#[test]
fn plaintext_export_permits_cannot_cross_session_api_or_environment() {
    let permit = Permit {
        api: ApiVersion::V2,
        session: SESSION.into(),
        environment: "TEST".into(),
        path: PathBuf::from("native-dialog-selection"),
    };
    assert_eq!(permit.validate(ApiVersion::V2, SESSION, "TEST"), Ok(()));
    for (api, id, env) in [
        (ApiVersion::V3, SESSION, "TEST"),
        (ApiVersion::V2, PROOF, "TEST"),
        (ApiVersion::V2, SESSION, "STAGE"),
        (ApiVersion::V2, SESSION, "PROD"),
    ] {
        assert_eq!(permit.validate(api, id, env), Err("session_missing"));
    }
}
#[test]
fn source_requires_exactly_one_native_proof_or_record_and_valid_identifiers() {
    for local in [false, true] {
        for reply in [false, true] {
            assert!(source(local, reply).validate());
        }
    }
    let mut value = source(false, false);
    value.record_id = Some(PROOF.into());
    assert!(!value.validate());
    value.proof_id = None;
    value.record_id = None;
    assert!(!value.validate());
    for field in ["proof", "record", "message"] {
        let mut value = source(field == "record", false);
        match field {
            "proof" => value.proof_id = Some("../proof".into()),
            "record" => value.record_id = Some("../record".into()),
            _ => value.message_id = "../message".into(),
        }
        assert!(!value.validate());
    }
    assert!(serde_json::from_value::<Source>(
        json!({"proofId":PROOF,"messageId":MESSAGE,"reply":false,"path":"C:/arbitrary"})
    )
    .is_err());
}
#[test]
fn original_downloads_use_verified_proof_and_exact_content_offsets_for_submissions_and_replies() {
    for reply in [false, true] {
        let source = source(false, reply);
        assert_eq!(
            source.live_command(None, 2),
            json!({"command":if reply {"list_received_reply_contents"} else {"list_received_contents"},"proofId":PROOF,"offset":2})
        );
        assert_eq!(
            source.live_command(Some(MESSAGE), 24576),
            json!({"command":if reply {"read_received_reply_content"} else {"read_received_content"},"proofId":PROOF,"contentId":MESSAGE,"byteOffset":24576})
        );
    }
}
#[test]
fn substituted_proof_record_session_or_api_cannot_release_bytes() {
    for local in [false, true] {
        let source = source(local, false);
        let identity = if local { "recordId" } else { "proofId" };
        for failure in [
            "none",
            "identity",
            "missing",
            "session",
            "api",
            "environment",
            "data",
        ] {
            let mut result = SessionResource {
                api_version: ApiVersion::V2,
                session_id: SESSION.into(),
                environment: "TEST".into(),
                data: json!({identity:PROOF,"chunk":"c2VjcmV0"}),
            };
            match failure {
                "identity" => result.data[identity] = MESSAGE.into(),
                "missing" => {
                    result.data.as_object_mut().unwrap().remove(identity);
                }
                "session" => result.session_id = MESSAGE.into(),
                "api" => result.api_version = ApiVersion::V3,
                "environment" => result.environment = "LOCAL".into(),
                "data" => result.data = json!([]),
                _ => (),
            }
            let result = source.checked(result, ApiVersion::V2, SESSION);
            if failure == "none" {
                assert_eq!(result.unwrap()["chunk"], "c2VjcmV0");
            } else {
                assert_eq!(result, Err("engine_protocol_error"), "{failure}");
            }
        }
    }
}
