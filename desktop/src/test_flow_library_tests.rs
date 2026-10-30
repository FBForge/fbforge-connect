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
    json!({"format":"fbforge-connect-testflow","version":1,"name":"Lokaler Prüflauf","pack":pack,"steps":steps})
}
fn flow() -> Flow {
    serde_json::from_value(document()).unwrap()
}
fn root() -> PathBuf {
    std::env::temp_dir().join(format!(
        "fbforge-flow-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}
#[test]
fn stored_flows_reject_incomplete_out_of_order_foreign_and_credential_bearing_steps() {
    flow().validate().unwrap();
    assert_eq!(serde_json::to_value(flow()).unwrap(), document());
    for change in ["order", "foreign", "incomplete", "duplicate"] {
        let mut value = document();
        match change {
            "order" => value["steps"][0]["type"] = json!("receive"),
            "foreign" => value["steps"][0]["caseId"] = json!("not-in-pack"),
            "incomplete" => {
                value["steps"].as_array_mut().unwrap().pop();
            }
            _ => {
                let last = value["steps"].as_array().unwrap().last().unwrap().clone();
                value["steps"].as_array_mut().unwrap().push(last);
            }
        }
        assert_eq!(
            serde_json::from_value::<Flow>(value).unwrap().validate(),
            Err("test_flow_invalid")
        );
    }
    let mut value = document();
    value["run"] = json!({"sessionId":"must-not-be-persisted"});
    assert!(serde_json::from_value::<Flow>(value).is_err());
    let mut value = document();
    value["pack"]["cases"][0]["request"]["clientSecret"] = json!("must-not-be-persisted");
    assert!(serde_json::from_value::<Flow>(value)
        .unwrap()
        .validate()
        .is_err());
    assert!(serde_json::from_value::<LibraryRequest>(
        json!({"action":"flow_read","id":ID,"path":"C:/"})
    )
    .is_err());
    let store = TestLibrary(root());
    assert_eq!(
        store.execute(LibraryRequest::FlowRead {
            id: "../outside".into()
        }),
        Err("test_pack_invalid")
    );
    assert_eq!(
        store.execute(LibraryRequest::FlowList {}).unwrap(),
        json!([])
    );
    assert!(!store.0.exists());
}
#[cfg(not(windows))]
#[test]
fn unsupported_flow_storage_never_falls_back_to_plaintext() {
    let store = TestLibrary(root());
    assert_eq!(
        store.execute(LibraryRequest::FlowSave {
            id: ID.into(),
            flow: flow()
        }),
        Err("vault_unsupported")
    );
    assert!(!store.0.exists());
}
#[cfg(windows)]
#[test]
fn flow_survives_restart_is_encrypted_and_does_not_change_the_pack_collection() {
    let root = root();
    let store = TestLibrary(root.clone());
    let pack_document = document()["pack"].clone();
    store
        .execute(LibraryRequest::Save {
            id: ID.into(),
            pack: serde_json::from_value(pack_document.clone()).unwrap(),
        })
        .unwrap();
    let summary = store
        .execute(LibraryRequest::FlowSave {
            id: ID.into(),
            flow: flow(),
        })
        .unwrap();
    assert_eq!(summary, flow().summary(ID));
    let path = root.join("flows").join(format!("{ID}.fctest"));
    let encrypted = fs::read(&path).unwrap();
    assert!(!encrypted
        .windows("Lokaler Prüflauf".len())
        .any(|part| part == "Lokaler Prüflauf".as_bytes()));
    drop(store);
    let reopened = TestLibrary(root.clone());
    assert_eq!(
        reopened
            .execute(LibraryRequest::FlowRead { id: ID.into() })
            .unwrap(),
        document()
    );
    assert_eq!(
        reopened.execute(LibraryRequest::FlowList {}).unwrap(),
        json!([summary])
    );
    assert_eq!(
        reopened
            .execute(LibraryRequest::Read { id: ID.into() })
            .unwrap(),
        pack_document
    );
    assert_eq!(
        reopened.execute(LibraryRequest::FlowSave {
            id: ID.into(),
            flow: flow()
        }),
        Err("test_library_conflict")
    );
    let mut corrupted = encrypted;
    corrupted[0] ^= 1;
    fs::write(&path, corrupted).unwrap();
    assert!(reopened
        .execute(LibraryRequest::FlowRead { id: ID.into() })
        .is_err());
    reopened
        .execute(LibraryRequest::FlowDelete { id: ID.into() })
        .unwrap();
    assert_eq!(
        reopened
            .execute(LibraryRequest::Read { id: ID.into() })
            .unwrap(),
        pack_document
    );
    assert_eq!(
        reopened.execute(LibraryRequest::FlowList {}).unwrap(),
        json!([])
    );
    fs::remove_dir_all(root).unwrap();
}
