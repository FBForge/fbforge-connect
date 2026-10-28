use super::*;
const ID: &str = "11111111-1111-4111-8111-111111111111";
#[cfg(windows)]
const OTHER: &str = "22222222-2222-4222-8222-222222222222";
fn source() -> Value {
    serde_json::from_str(include_str!(
        "../../frontend/src/examples/integration.fctest.json"
    ))
    .unwrap()
}
fn pack() -> Pack {
    serde_json::from_value(source()).unwrap()
}
fn root() -> PathBuf {
    std::env::temp_dir().join(format!(
        "fbforge-library-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}
#[test]
fn request_and_pack_boundaries_reject_paths_credentials_and_unknown_actions() {
    let store = TestLibrary(root());
    assert!(store.path("../elsewhere").is_err());
    assert!(
        serde_json::from_value::<LibraryRequest>(json!({"action":"list", "path":"C:/"})).is_err()
    );
    assert!(serde_json::from_value::<LibraryRequest>(json!({"action":"export_all"})).is_err());
    let mut value = source();
    value["clientSecret"] = json!("never-save");
    assert!(serde_json::from_value::<Pack>(value).is_err());
    let mut value = source();
    value["cases"][0]["request"]["clientSecret"] = json!("never-save");
    assert!(serde_json::from_value::<Pack>(value)
        .unwrap()
        .validate()
        .is_err());
    let mut value = source();
    value["cases"][0]["request"]["replyOffer"]["privateKey"] = json!("never-save");
    assert!(serde_json::from_value::<Pack>(value)
        .unwrap()
        .validate()
        .is_err());
    let mut value = pack();
    value.name = "".into();
    assert_eq!(value.validate(), Err("test_pack_invalid"));
    assert_eq!(store.execute(LibraryRequest::List {}).unwrap(), json!([]));
    assert!(!store.0.exists());
}
#[cfg(not(windows))]
#[test]
fn unsupported_platform_never_saves_plaintext() {
    let store = TestLibrary(root());
    assert_eq!(
        store.execute(LibraryRequest::Save {
            id: ID.into(),
            pack: pack()
        }),
        Err("vault_unsupported")
    );
    assert!(!store.0.exists());
}
#[cfg(windows)]
#[test]
fn protected_restart_roundtrip_preserves_exact_pack_and_isolates_tampered_entries() {
    let path = root();
    let store = TestLibrary(path.clone());
    assert_eq!(
        store
            .execute(LibraryRequest::Save {
                id: ID.into(),
                pack: pack()
            })
            .unwrap(),
        pack().summary(ID)
    );
    let encrypted = fs::read(store.path(ID).unwrap()).unwrap();
    for text in [pack().name, "processModelId".into()] {
        assert!(!encrypted
            .windows(text.len())
            .any(|window| window == text.as_bytes()));
    }
    assert_eq!(
        store.execute(LibraryRequest::Save {
            id: ID.into(),
            pack: pack()
        }),
        Err("test_library_conflict")
    );
    drop(store);
    let store = TestLibrary(path.clone());
    assert_eq!(
        store
            .execute(LibraryRequest::Read { id: ID.into() })
            .unwrap(),
        source()
    );
    assert_eq!(
        store.execute(LibraryRequest::List {}).unwrap(),
        json!([pack().summary(ID)])
    );
    fs::write(store.path(OTHER).unwrap(), &encrypted).unwrap();
    assert!(store
        .execute(LibraryRequest::Read { id: OTHER.into() })
        .is_err());
    store
        .execute(LibraryRequest::Delete { id: OTHER.into() })
        .unwrap();
    let mut damaged = encrypted;
    let last = damaged.len() - 1;
    damaged[last] ^= 1;
    fs::write(store.path(ID).unwrap(), damaged).unwrap();
    assert!(store
        .execute(LibraryRequest::Read { id: ID.into() })
        .is_err());
    store
        .execute(LibraryRequest::Delete { id: ID.into() })
        .unwrap();
    assert_eq!(store.execute(LibraryRequest::List {}).unwrap(), json!([]));
    fs::remove_dir_all(path).unwrap();
}
#[cfg(windows)]
#[test]
fn quotas_and_interrupted_staging_never_replace_a_saved_pack() {
    let path = root();
    let store = TestLibrary(path.clone());
    fs::create_dir_all(&path).unwrap();
    let staging = store.path(ID).unwrap().with_extension("pending");
    fs::write(&staging, b"previous encrypted staging").unwrap();
    assert_eq!(
        store.execute(LibraryRequest::Save {
            id: ID.into(),
            pack: pack()
        }),
        Err("vault_unavailable")
    );
    assert_eq!(fs::read(&staging).unwrap(), b"previous encrypted staging");
    assert!(!store.path(ID).unwrap().exists());
    fs::remove_file(staging).unwrap();
    for n in 0..MAX_ENTRIES {
        let id = format!("33333333-3333-4333-8333-{n:012}");
        store
            .execute(LibraryRequest::Save { id, pack: pack() })
            .unwrap();
    }
    assert_eq!(
        store.execute(LibraryRequest::Save {
            id: ID.into(),
            pack: pack()
        }),
        Err("vault_limit")
    );
    assert!(!store.path(ID).unwrap().exists());
    assert_eq!(store.files().unwrap().len(), MAX_ENTRIES);
    fs::remove_dir_all(path).unwrap();
}
#[cfg(unix)]
#[test]
fn symlinks_and_oversized_files_are_not_read() {
    let path = root();
    fs::create_dir_all(&path).unwrap();
    let store = TestLibrary(path.clone());
    std::os::unix::fs::symlink("/etc/passwd", store.path(ID).unwrap()).unwrap();
    assert!(store.execute(LibraryRequest::List {}).is_err());
    assert!(store
        .execute(LibraryRequest::Read { id: ID.into() })
        .is_err());
    store
        .execute(LibraryRequest::Delete { id: ID.into() })
        .unwrap();
    let file = fs::File::create(store.path(ID).unwrap()).unwrap();
    file.set_len(8 * 1024 * 1024 + 1).unwrap();
    assert!(store
        .execute(LibraryRequest::Read { id: ID.into() })
        .is_err());
    drop(file);
    fs::remove_dir_all(path).unwrap();
}
