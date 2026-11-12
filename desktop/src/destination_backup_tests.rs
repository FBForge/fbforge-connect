use crate::{
    destination_backup_model::{Backup, PrivateKey},
    destination_backup_store::Store,
    destination_backup_transfer,
    environments::Environment,
    portable_archive,
    protocol::{ApiVersion, SessionResource},
};
use serde_json::{json, Value};
const ID: &str = "11111111-1111-4111-8111-111111111111";
const OWNER: &str = "22222222-2222-4222-8222-222222222222";
const PASS: &str = "Fiktives Testpasswort 1234";
fn sample() -> Backup {
    let mut public_keys = vec![];
    let mut keys = vec![];
    for (purpose, kid, alg) in [
        ("decrypt", "synthetic-encryption", "RSA-OAEP-256"),
        ("sign", "synthetic-signing", "PS512"),
    ] {
        let public = json!({"kid":kid,"kty":"RSA","alg":alg,"n":format!("n-{purpose}"),"e":"AQAB"});
        let mut private = public.clone();
        private["d"] = json!("synthetic-private-marker");
        public_keys.push(public);
        keys.push(PrivateKey {
            kid: kid.into(),
            purpose: purpose.into(),
            private_jwk: private.to_string(),
        });
    }
    Backup {
        format: "fbforge-connect-destination-backup".into(),
        version: 1,
        id: ID.into(),
        name: "Fiktives Bauamt".into(),
        environment: Environment::TEST,
        source_destination_id: ID.into(),
        captured_at: 1234,
        configuration: json!({"destinationId":ID,"type":"A","name":"Bauamt","status":"active","encryptionKid":"synthetic-encryption","metadataVersions":["3.0.0"],"contactInformation":{"legalName":"Teststadt","address":"Testweg 1","phone":"123","email":"test@example.invalid"},"publicServices":[],"processMessages":[],"callback":{"url":"https://example.invalid/callback"},"senderAccessRestricted":{"enabled":true,"allowedSenderDestinations":[OWNER]},"publicForRouting":true}),
        public_keys,
        keys,
    }
}
#[test]
fn portable_backups_are_random_authenticated_and_password_bound() {
    let mut plain = serde_json::to_vec(&sample()).unwrap();
    let a = portable_archive::encrypt(&plain, PASS).unwrap();
    let b = portable_archive::encrypt(&plain, PASS).unwrap();
    assert_ne!(a, b);
    assert!(!String::from_utf8_lossy(&a).contains("synthetic-private-marker"));
    let unlocked = portable_archive::decrypt(&a, PASS).unwrap();
    assert_eq!(unlocked, plain);
    plain.fill(0);
    assert_eq!(
        portable_archive::decrypt(&a, "Falsches Testpasswort").unwrap_err(),
        "backup_unlock_failed"
    );
    for offset in [40, a.len() / 2, a.len() - 1] {
        let mut damaged = a.clone();
        damaged[offset] ^= 1;
        assert!(portable_archive::decrypt(&damaged, PASS).is_err());
    }
    assert!(portable_archive::decrypt(&a[..40], PASS).is_err());
    assert_eq!(
        portable_archive::encrypt(b"x", "short").unwrap_err(),
        "backup_password_invalid"
    );
    assert_eq!(
        portable_archive::encrypt(&vec![0; portable_archive::MAX_PLAIN + 1], PASS).unwrap_err(),
        "backup_invalid"
    );
}
#[test]
fn destination_summaries_never_expose_keys_and_incomplete_backups_stay_visible() {
    let mut backup = sample();
    backup.validate().unwrap();
    let summary = backup.summary();
    assert_eq!(summary["complete"], true);
    assert_eq!(summary["canReuseKeys"], true);
    assert_eq!(summary["callbackSecretMissing"], true);
    assert!(!summary.to_string().contains("synthetic-private-marker"));
    backup.keys.pop();
    backup.validate().unwrap();
    assert_eq!(backup.summary()["complete"], false);
    assert_eq!(backup.summary()["canReuseKeys"], false);
    assert_eq!(
        backup.summary()["missingKeys"],
        json!(["synthetic-signing"])
    );
    assert!(destination_backup_transfer::bundle_document(&backup).is_err());
    let draft = backup.draft();
    assert!(draft.get("destinationId").is_none());
    assert!(draft.get("status").is_none());
    assert_eq!(draft["senderAccessRestricted"]["enabled"], true);
}
#[test]
fn malformed_credentials_mismatched_keys_and_duplicate_ids_are_rejected() {
    for kind in [
        "private",
        "credentials",
        "duplicate",
        "mismatch",
        "identity",
        "version",
        "timestamp",
        "name",
    ] {
        let mut backup = sample();
        match kind {
            "private"=>backup.configuration["callback"]["secret"]=json!("must-not-be-readable"),
            "credentials"=>backup.configuration["clientSecret"]=json!("must-not-be-backed-up"),
            "duplicate"=>backup.public_keys.push(backup.public_keys[0].clone()),
            "mismatch"=>backup.keys[0].private_jwk=json!({"kid":"synthetic-encryption","kty":"RSA","n":"foreign","e":"AQAB","d":"secret"}).to_string(),
            "identity"=>backup.configuration["destinationId"]=json!(OWNER),
            "version"=>backup.version=2,
            "timestamp"=>backup.captured_at=u64::MAX,
            "name"=>backup.configuration["name"]=json!(true),
            _=>unreachable!()
        }
        assert!(backup.validate().is_err(), "{kind}");
    }
    let mut value = serde_json::to_value(sample()).unwrap();
    value["unknown"] = true.into();
    assert!(serde_json::from_value::<Backup>(value).is_err());
}
#[test]
fn reuse_preserves_private_material_with_fresh_registration_identifiers() {
    let backup = sample();
    let document: Value =
        serde_json::from_slice(&destination_backup_transfer::bundle_document(&backup).unwrap())
            .unwrap();
    for field in ["encryption", "signing"] {
        let private = &document[field];
        assert!(crate::protocol::valid_session_id(
            private["kid"].as_str().unwrap()
        ));
        assert_eq!(private["d"], "synthetic-private-marker");
    }
}

#[tokio::test]
async fn native_snapshot_transfer_checks_owner_offsets_totals_and_destination() {
    let backup = sample();
    let mut parts = vec![json!({"kind":"configuration","value":backup.configuration})];
    for key in &backup.public_keys {
        parts.push(json!({"kind":"public_key","value":key}));
    }
    for key in &backup.keys {
        parts.push(json!({"kind":"private_key","value":{"privateJwk":key.private_jwk,"destinationKey":{"destinationId":ID,"purpose":key.purpose,"kid":key.kid},"replyChannel":null,"generatedKey":null}}));
    }
    for fault in [
        "none",
        "offset",
        "owner",
        "environment",
        "total",
        "destination",
    ] {
        let result=destination_backup_transfer::capture(OWNER,Environment::TEST,ID,"Synthetic".into(),|command| {
            let offset=command["offset"].as_u64().unwrap() as usize;
            assert_eq!(command["destinationId"],ID);
            let mut item=parts.get(offset).cloned();
            if fault=="destination" && offset==0 {item.as_mut().unwrap()["value"]["destinationId"]=json!(OWNER);}
            std::future::ready(Ok(SessionResource {api_version:ApiVersion::V3,session_id:if fault=="owner" {ID}else{OWNER}.into(),environment:if fault=="environment" {"PROD"}else{"TEST"}.into(),data:json!({"offset":offset+usize::from(fault=="offset"),"total":parts.len()+usize::from(fault=="total"&&offset>0),"item":item})}))
        }).await;
        if fault == "none" {
            assert_eq!(result.unwrap().keys.len(), 2);
        } else {
            assert!(result.is_err(), "{fault}");
        }
    }
}
#[test]
fn local_store_is_bound_and_never_falls_back_to_plaintext() {
    let root = std::env::temp_dir().join(format!(
        "connect-destination-backup-{}",
        portable_archive::random_id().unwrap()
    ));
    assert!(Store::new(&root, "../foreign", Environment::TEST).is_err());
    let store = Store::new(&root, OWNER, Environment::TEST).unwrap();
    assert!(store.read("../../elsewhere").is_err());
    #[cfg(not(windows))]
    {
        assert_eq!(store.save_new(&sample()).unwrap_err(), "vault_unsupported");
        assert!(!root.exists());
    }
    #[cfg(windows)]
    {
        store.save_new(&sample()).unwrap();
        assert_eq!(store.read(ID).unwrap().keys.len(), 2);
        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(store.save_new(&sample()).unwrap_err(), "vault_conflict");
        let foreign = Store::new(&root, ID, Environment::TEST).unwrap();
        let original = root
            .join(OWNER)
            .join("TEST")
            .join(format!("{ID}.destination"));
        let moved = root.join(ID).join("TEST");
        std::fs::create_dir_all(&moved).unwrap();
        std::fs::copy(&original, moved.join(format!("{ID}.destination"))).unwrap();
        assert!(foreign.read(ID).is_err());
        assert!(!String::from_utf8_lossy(&std::fs::read(original).unwrap())
            .contains("synthetic-private-marker"));
        store.delete(ID).unwrap();
        assert!(store.list().unwrap().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[tokio::test]
async fn private_bundle_transfer_is_owned_bounded_memory_only_and_never_retries() {
    use std::cell::Cell;
    for fault in ["none", "owner", "environment", "commit", "timeout"] {
        let calls = Cell::new(0);
        let document = destination_backup_transfer::bundle_document(&sample()).unwrap();
        let result = destination_backup_transfer::import_bundle(
            OWNER,
            Environment::TEST,
            &document,
            |command| {
                calls.set(calls.get() + 1);
                assert_eq!(command["command"], "import_backup_bundle");
                assert!(
                    command.get("contentId").is_none(),
                    "Private keys are never staged as a file"
                );
                let material: Value =
                    serde_json::from_str(command["keyDocument"].as_str().unwrap()).unwrap();
                assert_eq!(material["encryption"]["d"], "synthetic-private-marker");
                assert!(
                    serde_json::to_vec(&command).unwrap().len()
                        < crate::protocol::MAX_FRAME_BYTES - 128
                );
                std::future::ready(if fault == "commit" {
                    Err("key_rejected")
                } else if fault == "timeout" {
                    Err("engine_timeout")
                } else {
                    Ok(SessionResource {
                        api_version: ApiVersion::V3,
                        session_id: if fault == "owner" { ID } else { OWNER }.into(),
                        environment: if fault == "environment" {
                            "PROD"
                        } else {
                            "TEST"
                        }
                        .into(),
                        data: json!({"bundleId":ID}),
                    })
                })
            },
        )
        .await;
        assert_eq!(calls.get(), 1);
        if fault == "none" {
            assert_eq!(result.unwrap(), json!({"bundleId":ID}));
        } else if fault == "timeout" {
            assert_eq!(result.unwrap_err(), "engine_timeout");
        } else {
            assert!(result.is_err(), "{fault}");
        }
    }
    let result = destination_backup_transfer::import_bundle(
        OWNER,
        Environment::TEST,
        &vec![0; 56001],
        |_| std::future::ready(Err("must-not-be-called")),
    )
    .await;
    assert_eq!(result.unwrap_err(), "backup_invalid");
}

#[tokio::test]
async fn backup_key_import_requires_a_profile_and_reports_failed_persistence() {
    use crate::write_gate::{Context, Effect};
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct Gate {
        profile: bool,
        save: bool,
        calls: AtomicUsize,
    }
    impl Context for Gate {
        type Error = &'static str;
        fn environment(&self) -> Environment {
            Environment::TEST
        }
        async fn request(&self, command: Value) -> Result<SessionResource, &'static str> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            assert_eq!(command["command"], "import_backup_bundle");
            Ok(SessionResource {
                api_version: ApiVersion::V3,
                session_id: OWNER.into(),
                environment: "TEST".into(),
                data: json!({"bundleId":ID}),
            })
        }
        async fn effect(&self, effect: Effect<'_>) -> Result<(), &'static str> {
            match effect {
                Effect::RequireProfile => {
                    if self.profile {
                        Ok(())
                    } else {
                        Err("vault_profile_required")
                    }
                }
                Effect::CheckpointProfile => {
                    if self.save {
                        Ok(())
                    } else {
                        Err("vault_unavailable")
                    }
                }
                _ => panic!("Unexpected import effect"),
            }
        }
    }
    for (profile, save) in [(false, true), (true, true), (true, false)] {
        let gate = Gate {
            profile,
            save,
            calls: AtomicUsize::new(0),
        };
        let result = crate::write_gate::run(
            &gate,
            ApiVersion::V3,
            OWNER,
            json!({"command":"import_backup_bundle","keyDocument":"synthetic-memory-only-document"}),
        )
        .await;
        assert_eq!(result.is_ok(), profile && save);
        assert_eq!(gate.calls.load(Ordering::SeqCst), usize::from(profile));
    }
}
