use super::*;
use crate::protocol::{EngineFailure, EngineResponse, SessionResource};
use serde_json::json;

fn frame() -> serde_json::Value {
    json!({"protocolVersion":1,"id":"op-1","ok":false,"error":"verification_failed",
        "diagnostics":[{"stage":"METADATA","type":"UnsupportedReplyChannel","message":"Reply channel is not supported by this destination."}]})
}

#[test]
fn sdk_details_survive_java_framing_and_native_error_serialization() {
    let result = serde_json::from_value::<EngineResponse<SessionResource>>(frame())
        .unwrap()
        .payload("op-1");
    let Err(EngineFailure::Detailed(failure)) = result else {
        panic!("SDK details were lost")
    };
    assert_eq!(failure.code(), "verification_failed");
    let encoded = serde_json::to_value(&failure).unwrap();
    assert_eq!(encoded["code"], "verification_failed");
    assert_eq!(encoded["diagnostics"], frame()["diagnostics"]);
    assert_eq!(
        serde_json::to_value(CommandError::from("resource_missing")).unwrap(),
        "resource_missing"
    );
}

#[test]
fn mismatched_mixed_unknown_and_unbounded_sdk_frames_fail_closed() {
    for kind in [
        "unknown-code",
        "mixed-success",
        "mixed-result",
        "too-many",
        "long-message",
        "control",
        "stage",
        "type",
    ] {
        let mut input = frame();
        match kind {
            "unknown-code" => input["error"] = "unapproved-secret".into(),
            "mixed-success" => input["ok"] = true.into(),
            "mixed-result" => {
                input["result"] = json!({"apiVersion":"v2","sessionId":"11111111-1111-4111-8111-111111111111","environment":"TEST","data":{}})
            }
            "too-many" => input["diagnostics"] = json!(vec![input["diagnostics"][0].clone(); 9]),
            "long-message" => input["diagnostics"][0]["message"] = "x".repeat(1025).into(),
            "control" => input["diagnostics"][0]["message"] = "error\u{0000}message".into(),
            "stage" => input["diagnostics"][0]["stage"] = "unapproved-stage".into(),
            "type" => input["diagnostics"][0]["type"] = "https://example.invalid".into(),
            _ => unreachable!(),
        }
        let response = serde_json::from_value::<EngineResponse<SessionResource>>(input).unwrap();
        assert!(
            matches!(
                response.payload("op-1"),
                Err(EngineFailure::Fatal("engine_protocol_error"))
            ),
            "{kind}"
        );
    }
    let response = serde_json::from_value::<EngineResponse<SessionResource>>(frame()).unwrap();
    assert!(matches!(
        response.payload("different-request"),
        Err(EngineFailure::Fatal("engine_protocol_error"))
    ));
}

#[tokio::test]
async fn write_gate_preserves_structured_read_failure_and_never_authorizes_a_write() {
    use crate::write_gate::{Context, Effect};
    struct Native;
    impl Context for Native {
        type Error = CommandError;
        fn environment(&self) -> crate::environments::Environment {
            crate::environments::Environment::TEST
        }
        async fn request(
            &self,
            request: serde_json::Value,
        ) -> Result<SessionResource, CommandError> {
            assert_eq!(request["command"], "verify_submission");
            assert_eq!(request["apiVersion"], "v2");
            assert_eq!(request["sessionId"], "11111111-1111-4111-8111-111111111111");
            Err(CommandError::detailed(
                "verification_failed",
                serde_json::from_value(frame()["diagnostics"].clone()).unwrap(),
            )
            .unwrap())
        }
        async fn effect(&self, effect: Effect<'_>) -> Result<(), &'static str> {
            assert!(matches!(effect, Effect::EnsureScanner));
            Ok(())
        }
    }
    let result = crate::write_gate::run(
        &Native,
        crate::protocol::ApiVersion::V2,
        "11111111-1111-4111-8111-111111111111",
        json!({"command":"verify_submission"}),
    )
    .await;
    let Err(failure) = result else {
        panic!("Failed verification must not become success")
    };
    assert_eq!(
        serde_json::to_value(failure).unwrap()["diagnostics"],
        frame()["diagnostics"]
    );
}
