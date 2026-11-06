use super::super::tests::{run, scenario};
use super::*;

fn series() -> Value {
    let r = run();
    json!({"format":"fbforge-connect-test-series","version":1,"id":"88888888-8888-4888-8888-888888888888","name":"Fiktive Testserie","definition":scenario(),"fingerprint":"a".repeat(64),"environment":"TEST","createdAt":"2026-11-06T12:00:00Z","entries":[{"id":"99999999-9999-4999-8999-999999999999","variantId":r["variantId"],"assignment":r["assignment"],"runId":null}]})
}

#[test]
fn series_validate_combinations_contexts_and_credentials_before_storage() {
    let valid = series();
    serde_json::from_value::<ScenarioSeries>(valid.clone())
        .unwrap()
        .validate()
        .unwrap();
    for (pointer, value) in [
        ("/entries/0/variantId", json!("foreign")),
        (
            "/entries/0/assignment/receiverProfileId",
            json!("../outside"),
        ),
        ("/entries/0/assignment/apiVersion", json!("v4")),
        ("/environment", json!("OTHER")),
        ("/entries/0/runId", json!("../outside")),
    ] {
        let mut input = valid.clone();
        *input.pointer_mut(pointer).unwrap() = value;
        assert!(serde_json::from_value::<ScenarioSeries>(input)
            .unwrap()
            .validate()
            .is_err());
    }
    let mut duplicate = valid.clone();
    duplicate["entries"]
        .as_array_mut()
        .unwrap()
        .push(valid["entries"][0].clone());
    assert!(serde_json::from_value::<ScenarioSeries>(duplicate)
        .unwrap()
        .validate()
        .is_err());
    for field in ["sessionId", "clientSecret"] {
        let mut input = valid.clone();
        input["entries"][0]["assignment"][field] = json!("forbidden");
        assert!(serde_json::from_value::<ScenarioSeries>(input).is_err());
    }
    let mut input = valid;
    input["definition"]["sharedCase"] = json!(true);
    input["entries"][0]["assignment"]["apiVersion"] = json!("v2");
    input["entries"][0]["runId"] = run()["id"].clone();
    assert!(serde_json::from_value::<ScenarioSeries>(input)
        .unwrap()
        .validate()
        .is_err());
}

#[test]
fn series_use_protected_storage_and_reopen_with_exact_run_links() {
    let root = std::env::temp_dir().join(format!("fbforge-series-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let value = series();
    let request =
        serde_json::from_value(json!({"action":"scenario_series_save","document":value})).unwrap();
    let result = TestLibrary(root.clone()).execute(request);
    #[cfg(not(windows))]
    {
        assert_eq!(result, Err("vault_unsupported"));
        assert!(!root.exists());
    }
    #[cfg(windows)]
    {
        assert!(result.is_ok());
        let mut value = value.clone();
        let r = run();
        let store = TestLibrary(root.clone());
        store
            .execute(
                serde_json::from_value(json!({"action":"scenario_run_save","document":r})).unwrap(),
            )
            .unwrap();
        value["entries"][0]["runId"] = r["id"].clone();
        store
            .execute(
                serde_json::from_value(json!({"action":"scenario_series_save","document":value}))
                    .unwrap(),
            )
            .unwrap();
        let restored = TestLibrary(root.clone())
            .execute(LibraryRequest::ScenarioSeriesRead {
                id: value["id"].as_str().unwrap().to_owned(),
            })
            .unwrap();
        assert_eq!(restored, value);
        let rows = TestLibrary(root.clone())
            .execute(LibraryRequest::ScenarioSeriesList {})
            .unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 1);
        for field in ["environment", "variantId", "fingerprint"] {
            let mut invalid = value.clone();
            if field == "variantId" {
                invalid["entries"][0][field] = json!("11111111-1111-4111-8111-111111111111");
            } else if field == "fingerprint" {
                invalid[field] = json!("b".repeat(64));
            } else {
                invalid[field] = json!("STAGE");
            }
            assert!(store
                .execute(
                    serde_json::from_value(
                        json!({"action":"scenario_series_save","document":invalid})
                    )
                    .unwrap()
                )
                .is_err());
        }
        store
            .execute(LibraryRequest::ScenarioRunDelete {
                id: r["id"].as_str().unwrap().to_owned(),
            })
            .unwrap();
        // A missing run remains visible as unavailable. Reading never invents a proof.
        assert!(store
            .execute(LibraryRequest::ScenarioSeriesRead {
                id: value["id"].as_str().unwrap().to_owned()
            })
            .is_ok());
        assert!(store
            .execute(
                serde_json::from_value(json!({"action":"scenario_series_save","document":value}))
                    .unwrap()
            )
            .is_err());
        value["entries"][0]["runId"] = Value::Null;
        store
            .execute(
                serde_json::from_value(json!({"action":"scenario_series_save","document":value}))
                    .unwrap(),
            )
            .unwrap();
        store
            .execute(LibraryRequest::ScenarioSeriesDelete {
                id: value["id"].as_str().unwrap().to_owned(),
            })
            .unwrap();
        assert!(store
            .execute(LibraryRequest::ScenarioSeriesList {})
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty());
        let _ = fs::remove_dir_all(root);
    }
    assert!(serde_json::from_value::<LibraryRequest>(
        json!({"action":"scenario_series_read","id":value["id"],"path":"../outside"})
    )
    .is_err());
}
