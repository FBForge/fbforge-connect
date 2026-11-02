use super::*;
fn root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "fbforge-vault-regression-{}-{}",
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
fn oversized_or_non_regular_profile_files_are_rejected_before_decryption() {
    let root = root();
    let vault = Vault::new(root.clone());
    let id = "11111111-1111-4111-8111-111111111111";
    let path = vault.path(id).unwrap();
    fs::File::create(&path)
        .unwrap()
        .set_len(MAX_FILE as u64 + 1)
        .unwrap();
    assert_eq!(vault.load(id).err(), Some("vault_invalid"));
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert_eq!(vault.load(id).err(), Some("vault_invalid"));
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
fn profile() -> Profile {
    Profile {
        version: 1,
        profile_id: "11111111-1111-4111-8111-111111111111".into(),
        name: "Fiktiver Regressionstest".into(),
        api_version: ApiVersion::V2,
        environment: crate::environments::Environment::TEST,
        role: crate::protocol::SessionRole::OnlineService,
        client_id: "fictional-client".into(),
        client_secret: "fictional-secret".into(),
        keys: vec![],
        defaults: ProfileDefaults::default(),
    }
}
#[cfg(windows)]
#[test]
fn failed_atomic_profile_update_retains_the_last_usable_credentials_and_cleans_staging() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = root();
    let vault = Vault::new(root.clone());
    let mut profile = profile();
    vault.save(&profile).unwrap();
    let path = vault.path(&profile.profile_id).unwrap();
    let original = fs::read(&path).unwrap();
    let guard = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    profile.client_secret = "replacement-secret".into();
    assert_eq!(vault.save(&profile), Err("vault_unavailable"));
    drop(guard);
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(
        vault.load(&profile.profile_id).unwrap().client_secret,
        "fictional-secret"
    );
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    vault.save(&profile).unwrap();
    assert_eq!(
        vault.load(&profile.profile_id).unwrap().client_secret,
        "replacement-secret"
    );
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn copied_profiles_cannot_impersonate_another_identity_and_corruption_is_reported_without_losing_healthy_profiles(
) {
    let root = root();
    let vault = Vault::new(root.clone());
    let profile = profile();
    vault.save(&profile).unwrap();
    let other = "22222222-2222-4222-8222-222222222222";
    fs::copy(
        vault.path(&profile.profile_id).unwrap(),
        vault.path(other).unwrap(),
    )
    .unwrap();
    assert_eq!(vault.load(other).err(), Some("vault_invalid"));
    let list = vault.list().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list.iter().filter(|v| v.available).count(), 1);
    fs::write(vault.path(other).unwrap(), b"truncated protected profile").unwrap();
    assert!(vault.load(other).is_err());
    vault.forget(other).unwrap();
    assert_eq!(vault.list().unwrap().len(), 1);
    assert!(vault.load(&profile.profile_id).is_ok());
    fs::remove_dir_all(root).unwrap();
}
