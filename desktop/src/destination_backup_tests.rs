use crate::{
    destination_backup_model::Backup,
    destination_backup_store::Store,
    destination_backup_transfer,
    environments::Environment,
    portable_archive,
    protocol::{ApiVersion, SessionResource},
};
use serde_json::json;
const ID: &str = "11111111-1111-4111-8111-111111111111";
const OWNER: &str = "22222222-2222-4222-8222-222222222222";
fn sample() -> Backup {
    Backup {
        format: "fbforge-connect-destination-backup".into(),
        version: 2,
        id: ID.into(),
        name: "Fiktives Bauamt".into(),
        environment: Environment::TEST,
        source_destination_id: ID.into(),
        captured_at: 1234,
        configuration: json!({"destinationId":ID,"type":"A","name":"Bauamt","status":"active","encryptionKid":"public-encryption","metadataVersions":["3.0.0"],"contactInformation":{"legalName":"Teststadt","address":"Testweg 1","phone":"123","email":"test@example.invalid"},"publicServices":[],"processMessages":[],"callback":{"url":"https://example.invalid/callback"}}),
        public_keys: vec![
            json!({"kid":"public-encryption","kty":"RSA","alg":"RSA-OAEP-256","n":"synthetic-public-modulus","e":"AQAB"}),
        ],
    }
}
#[test]
fn public_json_roundtrip_needs_no_password_and_excludes_private_fields() {
    let backup = sample();
    backup.validate().unwrap();
    let bytes = serde_json::to_vec_pretty(&backup).unwrap();
    let restored: Backup = serde_json::from_slice(&bytes).unwrap();
    restored.validate().unwrap();
    assert_eq!(restored.summary()["registeredKeyCount"], 1);
    assert!(restored.summary().get("privateKeyCount").is_none());
    assert!(restored.draft().get("destinationId").is_none());
    assert!(restored.draft().get("status").is_none());
    let mut value = serde_json::to_value(&backup).unwrap();
    value["keys"] = json!([{ "privateJwk":"never-import" }]);
    assert!(serde_json::from_value::<Backup>(value).is_err());
}
#[test]
fn malformed_public_backups_reject_secrets_duplicates_identity_and_unknown_versions() {
    for field in ["privateJwk", "clientSecret", "secret", "d"] {
        let mut backup = sample();
        backup.configuration["callback"][field] = json!("must-not-save");
        assert!(backup.validate().is_err());
        let mut backup = sample();
        backup.public_keys[0][field] = json!("must-not-save");
        assert!(backup.validate().is_err());
    }
    let mut b = sample();
    b.public_keys.push(b.public_keys[0].clone());
    assert!(b.validate().is_err());
    let mut b = sample();
    b.source_destination_id = OWNER.into();
    assert!(b.validate().is_err());
    let mut b = sample();
    b.version = 1;
    assert!(b.validate().is_err());
    let mut b = sample();
    b.captured_at = u64::MAX;
    assert!(b.validate().is_err());
    let mut b = sample();
    b.configuration["name"] = json!(true);
    assert!(b.validate().is_err());
}
#[tokio::test]
async fn native_capture_accepts_only_public_owned_sequential_parts() {
    for fault in ["none", "private", "owner", "offset", "environment"] {
        let b = sample();
        let parts = vec![
            json!({"kind":"configuration","value":b.configuration}),
            json!({"kind":if fault=="private" {"private_key"} else {"public_key"},"value":b.public_keys[0]}),
        ];
        let result=destination_backup_transfer::capture(OWNER,Environment::TEST,ID,"Synthetic".into(),|command| {
   let offset=command["offset"].as_u64().unwrap() as usize;
   let response=SessionResource {api_version:ApiVersion::V3,session_id:if fault=="owner" {ID} else {OWNER}.into(),environment:if fault=="environment" {"PROD"} else {"TEST"}.into(),data:json!({"offset":if fault=="offset" {99} else {offset},"total":2,"item":parts.get(offset)})};
   std::future::ready(Ok(response))
  }).await;
        assert_eq!(result.is_ok(), fault == "none", "{fault}");
    }
}
#[test]
fn protected_profile_storage_and_legacy_private_copy_removal() {
    let root = std::env::temp_dir().join(format!(
        "public-dest-backup-{}",
        portable_archive::random_id().unwrap()
    ));
    let store = Store::new(&root, OWNER, Environment::TEST).unwrap();
    #[cfg(windows)]
    {
        let backup = sample();
        store.save_new(&backup).unwrap();
        assert_eq!(store.list().unwrap().len(), 1);
        assert!(store.save_new(&backup).is_err());
        let mut legacy = serde_json::to_value(&backup).unwrap();
        legacy["version"] = json!(1);
        legacy["keys"] = json!([{"privateJwk":"obsolete-private-copy"}]);
        let purpose = format!("FBForge Connect/destination-backup/v1/{OWNER}/TEST/{ID}");
        let encrypted = crate::vault::protection::transform_with_purpose(
            &serde_json::to_vec(&legacy).unwrap(),
            true,
            purpose.as_bytes(),
        )
        .unwrap();
        let path = root
            .join(OWNER)
            .join("TEST")
            .join(format!("{ID}.destination"));
        crate::vault::write_protected(&path, &encrypted).unwrap();
        assert_eq!(store.read(ID).unwrap().version, 2);
        let clean = crate::vault::protection::transform_with_purpose(
            &std::fs::read(&path).unwrap(),
            false,
            purpose.as_bytes(),
        )
        .unwrap();
        assert!(!String::from_utf8_lossy(&clean).contains("obsolete-private-copy"));
        store.delete(ID).unwrap();
        assert!(store.list().unwrap().is_empty());
    }
    #[cfg(not(windows))]
    {
        assert!(store.save_new(&sample()).is_err());
        assert!(!root.exists());
    }
    let _ = std::fs::remove_dir_all(root);
}
