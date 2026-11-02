use super::*;
use serde_json::json;
use std::collections::VecDeque;
const SESSION: &str = "710f7b8d-b2d9-49eb-82ec-2e42a748286b";
fn response(data: Value) -> SessionResource {
    SessionResource {
        api_version: ApiVersion::V2,
        session_id: SESSION.into(),
        environment: "TEST".into(),
        data,
    }
}
#[tokio::test]
async fn archives_are_complete_bounded_and_ordered_including_empty_and_maximum_size() {
    for api in [ApiVersion::V2, ApiVersion::V3] {
        for total in [0, 1, 176] {
            let mut next = 0;
            let keys=read(api,SESSION,|command| {
                assert_eq!(command,json!({"command":"export_session_item","apiVersion":api,"sessionId":SESSION,"offset":next}));
                let page=json!({"offset":next,"total":total,"item":if next==total {Value::Null} else {json!({"keyId":format!("private-{next}")})}});
                next+=1;
                std::future::ready(Ok(SessionResource {api_version:api,..response(page)}))
            }).await.unwrap();
            assert_eq!(next, total + 1);
            assert_eq!(keys.len(), total);
            for (i, key) in keys.iter().enumerate() {
                assert_eq!(key["keyId"], format!("private-{i}"));
            }
        }
    }
}
#[tokio::test]
async fn corrupted_partial_or_inconsistent_archive_never_returns_partial_keys() {
    let first = json!({"offset":0,"total":2,"item":{"keyId":"first"}});
    for second in [
        json!({"offset":0,"total":2,"item":{}}),
        json!({"offset":1,"total":1,"item":null}),
        json!({"offset":1,"total":177,"item":{}}),
        json!({"offset":1,"total":2,"item":null}),
        json!({"offset":1,"total":2,"item":[]}),
        json!({"offset":1,"total":2,"item":"secret"}),
        json!({"offset":1,"total":2,"item":{},"extra":true}),
        json!({"offset":-1,"total":2,"item":{}}),
        json!({"total":2,"item":{}}),
        Value::Null,
    ] {
        let mut pages = VecDeque::from([response(first.clone()), response(second)]);
        let result = read(ApiVersion::V2, SESSION, |_| {
            std::future::ready(Ok(pages.pop_front().expect("must stop at corrupt page")))
        })
        .await;
        assert_eq!(result, Err("engine_protocol_error"));
        assert!(pages.is_empty());
    }
    for page in [
        json!({"offset":0,"total":0,"item":{}}),
        json!({"offset":0,"total":177,"item":{}}),
    ] {
        assert_eq!(
            read(ApiVersion::V2, SESSION, |_| std::future::ready(Ok(
                response(page.clone())
            )))
            .await,
            Err("engine_protocol_error")
        );
    }
}
#[tokio::test]
async fn foreign_api_session_and_invalid_environment_do_not_leak_archive_items() {
    for field in ["api", "session", "environment"] {
        let mut value = response(json!({"offset":0,"total":0,"item":null}));
        match field {
            "api" => value.api_version = ApiVersion::V3,
            "session" => value.session_id = "810f7b8d-b2d9-49eb-82ec-2e42a748286b".into(),
            _ => value.environment = "LOCAL".into(),
        }
        let mut value = Some(value);
        assert_eq!(
            read(ApiVersion::V2, SESSION, |_| std::future::ready(Ok(value
                .take()
                .unwrap())))
            .await,
            Err("engine_protocol_error")
        );
    }
}
#[tokio::test]
async fn transport_failure_mid_archive_is_propagated_without_partial_success_or_retry() {
    let mut calls = 0;
    assert_eq!(
        read(ApiVersion::V2, SESSION, |_| {
            calls += 1;
            std::future::ready(if calls == 1 {
                Ok(response(
                    json!({"offset":0,"total":2,"item":{"keyId":"private"}}),
                ))
            } else {
                Err("engine_timeout")
            })
        })
        .await,
        Err("engine_timeout")
    );
    assert_eq!(calls, 2);
}
