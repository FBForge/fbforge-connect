use super::*;
const PROFILE: &str = "11111111-1111-4111-8111-111111111111";
const RECORD: &str = "22222222-2222-4222-8222-222222222222";
const OTHER: &str = "33333333-3333-4333-8333-333333333333";
fn root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "fbforge-case-regression-{}-{}",
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
fn corrupt_case_remains_visible_as_unavailable_and_does_not_hide_other_records() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    for id in [RECORD, OTHER] {
        fs::write(
            store.path(id).unwrap(),
            b"invalid/truncated encrypted record",
        )
        .unwrap();
    }
    let records = store.records().unwrap();
    assert_eq!(records.len(), 2);
    for record in records {
        assert_eq!(record["available"], false);
        assert_eq!(record["status"], "unavailable");
    }
    assert_eq!(store.header(RECORD), Err("vault_invalid"));
    store.delete(RECORD).unwrap();
    store.delete(RECORD).unwrap();
    assert_eq!(store.records().unwrap().len(), 1);
    assert!(CaseStore::new(root.clone(), OTHER, "v2")
        .unwrap()
        .records()
        .unwrap()
        .is_empty());
    assert!(CaseStore::new(root.clone(), PROFILE, "v3")
        .unwrap()
        .records()
        .unwrap()
        .is_empty());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn malformed_case_framing_and_non_regular_files_fail_before_decryption() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    let path = store.path(RECORD).unwrap();
    for length in [0, MAX_BLOCK as u32 + 1] {
        fs::write(&path, [MAGIC, &length.to_be_bytes()].concat()).unwrap();
        assert_eq!(store.header(RECORD), Err("vault_invalid"));
    }
    fs::write(&path, [MAGIC, &100u32.to_be_bytes(), b"truncated"].concat()).unwrap();
    assert_eq!(store.header(RECORD), Err("vault_invalid"));
    File::create(&path)
        .unwrap()
        .set_len(MAX_RECORD + 1)
        .unwrap();
    assert_eq!(store.header(RECORD), Err("vault_invalid"));
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert_eq!(store.header(RECORD), Err("vault_invalid"));
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn interrupted_case_staging_is_recreated_without_modifying_the_committed_or_foreign_copy() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    let committed = store.path(RECORD).unwrap();
    fs::write(&committed, b"previous committed encrypted sentinel").unwrap();
    let foreign = CaseStore::new(root.clone(), OTHER, "v2").unwrap();
    fs::create_dir_all(&foreign.root).unwrap();
    fs::write(foreign.path(RECORD).unwrap(), b"other profile").unwrap();
    let (mut file, staging) = store.begin(RECORD, 100).unwrap();
    file.write_all(b"interrupted encrypted staging").unwrap();
    drop(file);
    let (file, next) = store.begin(RECORD, 100).unwrap();
    assert_eq!(staging, next);
    drop(file);
    assert_eq!(fs::read(&next).unwrap(), MAGIC);
    assert_eq!(
        fs::read(committed).unwrap(),
        b"previous committed encrypted sentinel"
    );
    assert_eq!(
        fs::read(foreign.path(RECORD).unwrap()).unwrap(),
        b"other profile"
    );
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn locked_destination_causes_commit_failure_without_destroying_previous_case() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
    fs::create_dir_all(&store.root).unwrap();
    let path = store.path(RECORD).unwrap();
    fs::write(&path, b"previous encrypted case").unwrap();
    let guard = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    let (mut file, staging) = store.begin(RECORD, 100).unwrap();
    file.write_all(b"new encrypted case").unwrap();
    assert_eq!(
        store.commit(file, &staging, RECORD),
        Err("vault_unavailable")
    );
    drop(guard);
    assert_eq!(fs::read(path).unwrap(), b"previous encrypted case");
    assert!(staging.exists());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn authenticated_but_malformed_case_manifests_are_rejected() {
    let root = root();
    let store = CaseStore::new(root.clone(), PROFILE, "v2").unwrap();
    for header in [
        serde_json::json!({"version":2,"summary":{"recordId":RECORD},"pageCount":1}),
        serde_json::json!({"version":1,"summary":{"recordId":OTHER},"pageCount":1}),
        serde_json::json!({"version":1,"summary":{"recordId":RECORD},"pageCount":0}),
        serde_json::json!({"version":1,"summary":{"recordId":RECORD},"pageCount":22}),
    ] {
        let (mut file, temp) = store.begin(RECORD, 100).unwrap();
        store.write(&mut file, RECORD, 0, &header, None).unwrap();
        store.commit(file, &temp, RECORD).unwrap();
        assert_eq!(store.header(RECORD), Err("vault_invalid"));
        assert_eq!(store.records().unwrap()[0]["available"], false);
    }
    fs::remove_dir_all(root).unwrap();
}
