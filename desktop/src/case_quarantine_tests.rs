use super::*;
const PROFILE: &str = "11111111-1111-4111-8111-111111111111";
const RECORD: &str = "22222222-2222-4222-8222-222222222222";
const OTHER: &str = "33333333-3333-4333-8333-333333333333";
#[cfg(windows)]
const SUBJECT: &str = "44444444-4444-4444-8444-444444444444";
#[cfg(windows)]
const CONTEXT: &str = "55555555-5555-4555-8555-555555555555";
fn root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "connect-quarantine-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    root
}
#[test]
fn durable_denial_survives_reopen_and_blocks_reads_before_decryption() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    fs::write(store.path(RECORD).unwrap(), b"old encrypted sentinel").unwrap();
    #[cfg(windows)]
    store.quarantine_record(RECORD, true).unwrap();
    #[cfg(not(windows))]
    fs::write(store.quarantine_path(RECORD).unwrap(), b"blocked-v1").unwrap();
    drop(store);
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    for operation in ["parts", "read"] {
        assert_eq!(
            store.resource(RECORD, operation, Some(OTHER), 0),
            Err("malware_detected")
        );
    }
    assert_eq!(store.begin(RECORD, 10).err(), Some("malware_detected"));
    assert!(!store.is_quarantined(OTHER).unwrap());
    assert!(!CaseStore::new(root.clone(), OTHER, "v3")
        .unwrap()
        .is_quarantined(RECORD)
        .unwrap());
    assert!(!CaseStore::new(root.clone(), PROFILE, "v2")
        .unwrap()
        .is_quarantined(RECORD)
        .unwrap());
    store.delete(RECORD).unwrap();
    assert!(!store.is_quarantined(RECORD).unwrap());
    assert!(!store.path(RECORD).unwrap().exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn malformed_marker_fails_closed_and_cannot_enable_reads() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    fs::create_dir_all(store.quarantine_path(RECORD).unwrap()).unwrap();
    assert_eq!(
        store.resource(RECORD, "parts", None, 0),
        Err("malware_detected")
    );
    assert_eq!(store.delete(RECORD), Err("vault_unavailable"));
    assert_eq!(store.begin(RECORD, 10).err(), Some("malware_detected"));
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
fn saved(store: &CaseStore, id: &str, kind: &str, direction: &str) {
    let (mut file, temp) = store.begin(id, 14).unwrap();
    let header = serde_json::json!({"version":1,"summary":{"recordId":id,"revision":OTHER,
        "kind":kind,"direction":direction,"submissionId":SUBJECT,"replyId":SUBJECT,
        "caseId":CONTEXT,"destinationId":CONTEXT,"status":"verified","totalBytes":14,
        "attachmentCount":0,"warnings":["MALWARE_SCAN_PASSED"]},"pageCount":1,"blocks":1});
    let page = serde_json::json!({"recordId":id,"offset":0,"total":1,"parts":[{"contentId":OTHER,"totalBytes":14}]});
    let chunk = serde_json::json!({"recordId":id,"contentId":OTHER,"byteOffset":0,"totalBytes":14,"chunk":"RmlrdGl2ZXIgQW50cmFn","complete":true});
    store.write(&mut file, id, 0, &header, None).unwrap();
    store.write(&mut file, id, 1, &page, Some(OTHER)).unwrap();
    store.write(&mut file, id, 2, &chunk, Some(OTHER)).unwrap();
    store.commit(file, &temp, id).unwrap();
}
#[cfg(windows)]
#[test]
fn protected_archives_are_quarantined_even_after_opt_out_or_when_the_content_file_is_locked() {
    use std::os::windows::fs::OpenOptionsExt;
    for api in ["v2", "v3"] {
        for kind in ["submission", "reply"] {
            for sharing in [0, 1] {
                let root = root();
                let store = CaseStore::new(root.clone(), PROFILE, api).unwrap();
                saved(&store, RECORD, kind, "received");
                saved(&store, OTHER, kind, "sent");
                store.enable(false).unwrap();
                store.quarantine_message(kind, SUBJECT, OTHER).unwrap();
                assert!(store.resource(RECORD, "read", Some(OTHER), 0).is_ok());
                let guard = OpenOptions::new()
                    .read(true)
                    .share_mode(sharing)
                    .open(store.path(RECORD).unwrap())
                    .unwrap();
                store.quarantine_message(kind, SUBJECT, CONTEXT).unwrap();
                drop(guard);
                drop(store);
                let store = CaseStore::new(root.clone(), PROFILE, api).unwrap();
                assert!(!store.enabled().unwrap());
                let record = store.header(RECORD).unwrap();
                assert_eq!(record["summary"]["status"], "blocked");
                assert_eq!(
                    record["summary"]["warnings"],
                    serde_json::json!([if sharing == 0 {
                        "MALWARE_REVIEW_REQUIRED"
                    } else {
                        "MALWARE_DETECTED"
                    }])
                );
                for operation in ["parts", "read"] {
                    assert_eq!(
                        store.resource(RECORD, operation, Some(OTHER), 0),
                        Err("malware_detected")
                    );
                }
                assert!(store.resource(OTHER, "read", Some(OTHER), 0).is_ok());
                store.delete(RECORD).unwrap();
                saved(&store, RECORD, kind, "received");
                assert!(store.resource(RECORD, "read", Some(OTHER), 0).is_ok());
                fs::remove_dir_all(root).unwrap();
            }
        }
    }
}

#[cfg(not(windows))]
#[test]
fn unsupported_durable_marker_removes_the_stale_file_instead_of_leaving_it_readable() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    fs::write(store.path(RECORD).unwrap(), b"old encrypted sentinel").unwrap();
    store.quarantine_record(RECORD, true).unwrap();
    assert!(!store.path(RECORD).unwrap().exists());
    assert!(store.resource(RECORD, "read", Some(OTHER), 0).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_scope_marker_keeps_a_profile_bound_denial_across_store_reopen() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    fs::create_dir(root.join("quarantine")).unwrap();
    fs::write(
        root.join("quarantine").join(PROFILE),
        b"control path unavailable",
    )
    .unwrap();
    assert_eq!(store.quarantine_scope(), Err("vault_unavailable"));
    drop(store);
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    assert_eq!(
        store.resource(RECORD, "read", Some(OTHER), 0),
        Err("malware_detected")
    );
    assert!(!CaseStore::new(root.clone(), OTHER, "v3")
        .unwrap()
        .scope_quarantined()
        .unwrap());
    fs::remove_file(root.join("quarantine").join(PROFILE)).unwrap();
    store.clear_quarantine_scope().unwrap();
    assert!(!store.scope_quarantined().unwrap());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn uncertain_archive_inventory_records_a_durable_scope_denial_outside_the_case_directory() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    saved(&store, RECORD, "submission", "received");
    fs::write(
        store.root.join("invalid.case"),
        b"unreadable inventory entry",
    )
    .unwrap();
    store
        .quarantine_message("submission", SUBJECT, CONTEXT)
        .unwrap();
    // Drop the process-local fallback as a fresh process would; the disk marker must suffice.
    denied_scopes().lock().unwrap().remove(&store.root);
    drop(store);
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    assert_eq!(
        store.resource(RECORD, "read", Some(OTHER), 0),
        Err("malware_detected")
    );
    assert_eq!(
        store.header(RECORD).unwrap()["summary"]["warnings"],
        serde_json::json!(["MALWARE_REVIEW_REQUIRED"])
    );
    fs::remove_file(store.root.join("invalid.case")).unwrap();
    store.delete(RECORD).unwrap();
    store.clear_quarantine_scope().unwrap();
    assert!(!store.scope_quarantined().unwrap());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn unreadable_denial_metadata_keeps_the_scope_blocked_after_filesystem_recovery() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    fs::write(store.path(RECORD).unwrap(), b"old encrypted sentinel").unwrap();
    fs::create_dir(root.join("quarantine")).unwrap();
    fs::write(
        root.join("quarantine").join(PROFILE),
        b"unavailable control directory",
    )
    .unwrap();
    let outcome = store.quarantine_message("submission", RECORD, OTHER);
    // Windows may treat the invalid control path as absent and persist the per-record marker.
    // Unix reports the path error and retains a scope denial. Both must block the later read.
    assert!(matches!(outcome, Ok(()) | Err("vault_unavailable")));
    drop(store);
    fs::remove_file(root.join("quarantine").join(PROFILE)).unwrap();
    let store = CaseStore::new(root.clone(), PROFILE, "v3").unwrap();
    assert_eq!(
        store.resource(RECORD, "read", Some(OTHER), 0),
        Err("malware_detected")
    );
    store.delete(RECORD).unwrap();
    store.clear_quarantine_scope().unwrap();
    fs::remove_dir_all(root).unwrap();
}
