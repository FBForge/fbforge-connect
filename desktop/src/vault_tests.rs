use super::*;
fn sample() -> Profile {
    Profile {
        environment: Environment::TEST,
        defaults: ProfileDefaults::default(),
        answer_schemas: vec![],
        version: 1,
        profile_id: "11111111-1111-4111-8111-111111111111".into(),
        name: "TEST-Arbeitsplatz".into(),
        api_version: ApiVersion::V3,
        role: SessionRole::OnlineService,
        client_id: "synthetic-client".into(),
        client_secret: "synthetic-secret-marker".into(),
        keys: vec![],
    }
}
#[test]
fn legacy_profiles_gain_empty_defaults_and_public_defaults_never_include_secrets_or_keys() {
    let mut legacy = serde_json::to_value(sample()).unwrap();
    legacy.as_object_mut().unwrap().remove("defaults");
    legacy.as_object_mut().unwrap().remove("answerSchemas");
    let mut profile: Profile = serde_json::from_value(legacy).unwrap();
    assert_eq!(profile.defaults, ProfileDefaults::default());
    assert!(profile.answer_schemas.is_empty());
    profile.defaults.source_destination = Some("22222222-2222-4222-8222-222222222222".into());
    profile.defaults.receiver_destination = Some("33333333-3333-4333-8333-333333333333".into());
    profile.validate().unwrap();
    let public = serde_json::to_string(&profile.defaults).unwrap();
    assert!(!public.contains("synthetic-secret-marker"));
    assert!(!public.contains("keys"));
    let roundtrip: Profile =
        serde_json::from_slice(&serde_json::to_vec(&profile).unwrap()).unwrap();
    assert_eq!(roundtrip.defaults, profile.defaults);
    assert_eq!(roundtrip.client_secret, profile.client_secret);
    profile.api_version = ApiVersion::V2;
    assert_eq!(profile.validate().err(), Some("vault_invalid"));
    profile.defaults.source_destination = None;
    profile.validate().unwrap();
    profile.defaults.receiver_destination = Some("../../outside".into());
    assert_eq!(profile.validate().err(), Some("vault_invalid"));
}

#[test]
fn profile_validation_and_paths_are_strict() {
    let vault = Vault::new(std::env::temp_dir().join("fit-connect-vault-validation"));
    assert!(vault.path("../../elsewhere").is_err());
    let mut profile = sample();
    assert!(profile.validate().is_ok());
    profile.version = 2;
    assert!(profile.validate().is_err());
    profile.version = 1;
    profile.name = "bad\nname".into();
    assert!(profile.validate().is_err());
    let summary = serde_json::to_string(&sample().summary()).unwrap();
    assert!(summary.contains("synthetic-client"));
    assert!(!summary.contains("synthetic-secret-marker"));
}
#[test]
fn profile_environment_is_persisted_and_missing_legacy_environment_defaults_to_test() {
    let mut original = sample();
    for environment in [Environment::TEST, Environment::STAGE, Environment::PROD] {
        original.environment = environment;
        let encoded = serde_json::to_value(&original).unwrap();
        let restored: Profile = serde_json::from_value(encoded.clone()).unwrap();
        assert_eq!(restored.environment, environment);
        assert_eq!(restored.summary().environment, Some(environment));
        let mut legacy = encoded;
        legacy.as_object_mut().unwrap().remove("environment");
        assert_eq!(
            serde_json::from_value::<Profile>(legacy)
                .unwrap()
                .environment,
            Environment::TEST
        );
    }
}
#[test]
fn malformed_backup_never_becomes_a_profile() {
    let store = Vault::new(std::env::temp_dir().join("fit-connect-invalid-backup"));
    assert!(store.restore_backup(b"synthetic-plaintext-secret").is_err());
    assert!(store
        .restore_backup(&vec![0; MAX_BACKUP_BYTES + 1])
        .is_err());
}
#[cfg(windows)]
#[test]
fn protected_backup_roundtrip_conflict_tamper_and_atomic_file() {
    let root = std::env::temp_dir().join(format!("fit-connect-backup-{}", std::process::id()));
    let source = Vault::new(root.join("source"));
    let destination = Vault::new(root.join("destination"));
    let mut profile = sample();
    profile.answer_schemas.push(crate::answer_schema_model::AnswerSchema {
        uri: "urn:test:stored:reply".into(),
        title: "Gespeicherte Antwort".into(),
        revision: "22222222-2222-4222-8222-222222222222".into(),
        schema: serde_json::json!({"$id":"urn:test:stored:reply","type":"object"}),
        draft: serde_json::json!({"format":"fbforge-connect-channel-schema","version":1,"definition":{"schemaUri":"urn:test:stored:reply"}}),
    });
    source.save(&profile).unwrap();
    let backup = source.backup(&profile.profile_id).unwrap();
    assert!(!backup
        .windows(b"synthetic-secret-marker".len())
        .any(|chunk| chunk == b"synthetic-secret-marker"));
    assert_eq!(
        destination.restore_backup(&backup).unwrap().profile_id,
        profile.profile_id
    );
    assert_eq!(
        destination.load(&profile.profile_id).unwrap().client_secret,
        profile.client_secret
    );
    assert_eq!(
        serde_json::to_value(
            &destination
                .load(&profile.profile_id)
                .unwrap()
                .answer_schemas
        )
        .unwrap(),
        serde_json::to_value(&profile.answer_schemas).unwrap()
    );
    assert_eq!(
        destination.restore_backup(&backup).err(),
        Some("vault_conflict")
    );
    let path = root.join("saved.fctest-profile");
    Vault::write_backup(&path, &backup).unwrap();
    Vault::write_backup(&path, &backup).unwrap();
    assert_eq!(read_bounded(&path, MAX_BACKUP_BYTES).unwrap(), backup);
    destination.forget(&profile.profile_id).unwrap();
    let mut damaged = backup;
    let last = damaged.len() - 1;
    damaged[last] ^= 1;
    assert!(destination.restore_backup(&damaged).is_err());
    assert!(destination.list().unwrap().is_empty());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(not(windows))]
#[test]
fn unsupported_platform_cannot_fall_back_to_plaintext() {
    assert_eq!(
        protection::encrypt(b"synthetic-secret-marker").unwrap_err(),
        "vault_unsupported"
    );
}
#[cfg(windows)]
#[test]
fn dpapi_roundtrip_tamper_atomic_update_and_forget() {
    let directory = std::env::temp_dir().join(format!("fit-connect-vault-{}", std::process::id()));
    let vault = Vault::new(directory.clone());
    let mut profile = sample();
    profile.defaults.receiver_destination = Some("33333333-3333-4333-8333-333333333333".into());
    vault.save(&profile).unwrap();
    assert_eq!(
        vault.load(&profile.profile_id).unwrap().defaults,
        profile.defaults
    );
    let path = vault.path(&profile.profile_id).unwrap();
    let bytes = fs::read(&path).unwrap();
    assert!(!bytes
        .windows(b"synthetic-secret-marker".len())
        .any(|v| v == b"synthetic-secret-marker"));
    assert_eq!(
        vault.load(&profile.profile_id).unwrap().client_secret,
        profile.client_secret
    );
    profile.name = "Geändert".into();
    vault.save(&profile).unwrap();
    assert_eq!(vault.list().unwrap()[0].name, "Geändert");
    let mut broken = bytes;
    let last = broken.len() - 1;
    broken[last] ^= 1;
    fs::write(&path, broken).unwrap();
    assert!(vault.load(&profile.profile_id).is_err());
    assert!(!vault.list().unwrap()[0].available);
    vault.forget(&profile.profile_id).unwrap();
    assert!(vault.list().unwrap().is_empty());
    fs::remove_dir_all(directory).unwrap();
}
