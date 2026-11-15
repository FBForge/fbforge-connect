//! Isolated CI-only process/restart checks using the actual macOS Keychain and vault.
#[cfg(target_os = "macos")]
fn main() {
    use fbforge_connect_native_contracts::{
        environments::Environment,
        protocol::{ApiVersion, SessionRole},
        vault::{self, Profile, ProfileDefaults, Vault},
    };
    use std::{os::unix::fs::PermissionsExt, path::PathBuf};
    let root = PathBuf::from(
        std::env::var("FBFORGE_MACOS_TEST_ROOT").expect("isolated test directory required"),
    );
    assert!(root
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("fbforge-macos-vault-"));
    let mode = std::env::args()
        .nth(1)
        .expect("seed, reopen, remove-key or missing-key");
    if mode == "remove-key" {
        let id = std::fs::read(root.join("vault-key-v1.id")).unwrap();
        let account: String = id.iter().map(|v| format!("{v:02x}")).collect();
        security_framework::passwords::delete_generic_password(
            "de.fbforge.connect.vault.v1",
            &account,
        )
        .unwrap();
        println!("Isolated test key removed");
        return;
    }
    let initialized = vault::initialize_platform_store(&root);
    if mode == "missing-key" {
        assert_eq!(initialized, Err("vault_key_missing"));
        assert!(root
            .join("profiles/11111111-1111-4111-8111-111111111111.profile")
            .is_file());
        println!("Missing key rejected without replacing existing profile");
        return;
    }
    initialized.unwrap();
    let store = Vault::new(root.join("profiles"));
    const ID: &str = "11111111-1111-4111-8111-111111111111";
    if mode == "seed" {
        store
            .save(&Profile {
                version: 1,
                environment: Environment::TEST,
                profile_id: ID.into(),
                name: "Synthetic macOS profile".into(),
                api_version: ApiVersion::V3,
                role: SessionRole::OnlineService,
                client_id: "synthetic-client".into(),
                client_secret: "synthetic-native-keychain-marker".into(),
                keys: vec![],
                defaults: ProfileDefaults::default(),
                answer_schemas: vec![],
            })
            .unwrap();
    } else {
        assert_eq!(mode, "reopen");
    }
    let profile = store.load(ID).unwrap();
    assert_eq!(profile.client_secret, "synthetic-native-keychain-marker");
    let path = root.join(format!("profiles/{ID}.profile"));
    let encrypted = std::fs::read(&path).unwrap();
    assert!(!String::from_utf8_lossy(&encrypted).contains("synthetic-native-keychain-marker"));
    assert_eq!(
        std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    println!("Native Keychain profile, encryption and user-only file permissions passed ({mode})");
}
#[cfg(not(target_os = "macos"))]
fn main() {
    panic!("macOS required");
}
