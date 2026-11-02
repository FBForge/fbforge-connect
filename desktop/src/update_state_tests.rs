use super::*;
const VERSION: &str = "0.4.0";
fn available() -> Pending<&'static str> {
    let mut state = Pending::new(true, true);
    state.begin_check().unwrap();
    state
        .checked(Ok(Some(("native-release", VERSION.into(), "Notes".into()))))
        .unwrap();
    state
}
fn downloaded() -> Pending<&'static str> {
    let mut state = available();
    state.begin_download(VERSION).unwrap();
    state
        .downloaded(Ok(b"verified-installer-fixture".to_vec()))
        .unwrap();
    state
}
#[test]
fn unsupported_and_unconfigured_clients_cannot_start_and_busy_work_cannot_be_replaced() {
    assert_eq!(
        Pending::<()>::new(true, false).begin_check(),
        Err("update_platform_unsupported")
    );
    assert_eq!(
        Pending::<()>::new(false, true).begin_check(),
        Err("update_not_configured")
    );
    let mut state = Pending::<()>::new(true, true);
    state.begin_check().unwrap();
    assert_eq!(state.begin_check(), Err("update_busy"));
    state.checked(Ok(None)).unwrap();
    assert_eq!(state.status.phase, "current");
    let mut state = available();
    state.begin_download(VERSION).unwrap();
    assert_eq!(state.begin_check(), Err("update_busy"));
    let mut state = downloaded();
    state.begin_install(VERSION).unwrap();
    assert_eq!(state.begin_check(), Err("update_busy"));
}
#[test]
fn only_the_natively_checked_release_version_can_be_downloaded_or_installed() {
    let mut state = available();
    for version in [
        "0.2.0",
        "0.3.0",
        "0.4.1",
        "v0.4.0",
        "",
        "https://other.invalid/update.exe",
    ] {
        assert_eq!(state.begin_download(version), Err("update_not_ready"));
        assert_eq!(state.begin_install(version), Err("update_not_ready"));
    }
    assert_eq!(state.begin_install(VERSION), Err("update_not_ready"));
    assert_eq!(state.take_install_bytes(), Err("update_not_ready"));
    assert_eq!(state.begin_download(VERSION), Ok("native-release"));
    assert_eq!(state.begin_download(VERSION), Err("update_not_ready"));
    state.downloaded(Ok(vec![1, 2, 3])).unwrap();
    assert_eq!(state.take_install_bytes(), Err("update_not_ready"));
    assert_eq!(state.begin_install("0.5.0"), Err("update_not_ready"));
    assert_eq!(state.begin_install(VERSION), Ok("native-release"));
    assert_eq!(state.take_install_bytes(), Ok(vec![1, 2, 3]));
    assert_eq!(state.take_install_bytes(), Err("update_not_ready"));
}
#[test]
fn failed_or_cancelled_downloads_never_leave_installable_bytes_and_can_retry() {
    for code in [
        "update_cancelled",
        "update_network_failed",
        "update_signature_invalid",
        "update_version_mismatch",
        "update_package_invalid",
    ] {
        let mut state = available();
        state.begin_download(VERSION).unwrap();
        assert_eq!(state.downloaded(Err(code)).unwrap_err(), code);
        assert!(state.bytes.is_none());
        assert_eq!(state.status.phase, "available");
        assert_eq!(state.begin_install(VERSION), Err("update_not_ready"));
        state.begin_download(VERSION).unwrap();
        state.downloaded(Ok(vec![42])).unwrap();
        state.begin_install(VERSION).unwrap();
        assert_eq!(state.take_install_bytes(), Ok(vec![42]));
    }
}
#[test]
fn cancelled_confirmation_busy_engine_or_checkpoint_failure_preserves_verified_download() {
    for code in [
        "update_cancelled",
        "update_activity_pending",
        "vault_unavailable",
        "update_engine_shutdown_failed",
    ] {
        let mut state = downloaded();
        state.begin_install(VERSION).unwrap();
        assert_eq!(state.installed(Err(code)).unwrap_err(), code);
        assert_eq!(state.status.phase, "downloaded");
        state.begin_install(VERSION).unwrap();
        assert_eq!(
            state.take_install_bytes(),
            Ok(b"verified-installer-fixture".to_vec())
        );
    }
}
#[test]
fn installer_failure_after_consuming_bytes_requires_another_verified_download() {
    let mut state = downloaded();
    state.begin_install(VERSION).unwrap();
    state.take_install_bytes().unwrap();
    assert_eq!(
        state.installed(Err("update_install_failed")).unwrap_err(),
        "update_install_failed"
    );
    assert_eq!(state.status.phase, "available");
    assert_eq!(state.begin_install(VERSION), Err("update_not_ready"));
    state.begin_download(VERSION).unwrap();
    state.downloaded(Ok(vec![42])).unwrap();
    state.begin_install(VERSION).unwrap();
    state.take_install_bytes().unwrap();
    assert_eq!(state.installed(Ok(())).unwrap().phase, "available");
}
#[test]
fn rechecking_clears_old_release_notes_bytes_and_progress_even_if_network_check_fails() {
    let mut state = downloaded();
    state.status.downloaded = 99;
    state.status.total = Some(99);
    state.begin_check().unwrap();
    assert!(state.release.is_none());
    assert!(state.bytes.is_none());
    assert!(state.status.version.is_none());
    assert!(state.status.notes.is_empty());
    assert_eq!(state.status.downloaded, 0);
    assert_eq!(state.status.total, None);
    assert_eq!(
        state.checked(Err("update_network_failed")).unwrap_err(),
        "update_network_failed"
    );
    assert_eq!(state.status.phase, "idle");
    assert_eq!(state.begin_download(VERSION), Err("update_not_ready"));
    state.begin_check().unwrap();
    state.checked(Ok(None)).unwrap();
    assert_eq!(state.status.phase, "current");
}

#[test]
fn real_signature_or_version_failures_never_promote_downloads_to_installable_state() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/update-signature.json")).unwrap();
    let signature = fixture["signature"].as_str().unwrap();
    let key = fixture["publicKey"].as_str().unwrap();
    let bytes = fixture["data"].as_str().unwrap().as_bytes();
    for (payload, signature, key, version) in [
        (b"tampered".as_slice(), signature, key, VERSION),
        (bytes, signature, key, "0.5.0"),
        (
            bytes,
            fixture["unversionedSignature"].as_str().unwrap(),
            key,
            VERSION,
        ),
        (bytes, "invalid", key, VERSION),
        (bytes, signature, "", VERSION),
    ] {
        let mut state = available();
        state.begin_download(VERSION).unwrap();
        let verified = crate::update_policy::verify(payload, signature, key, version)
            .map(|_| payload.to_vec());
        assert!(verified.is_err());
        assert!(state.downloaded(verified).is_err());
        assert_eq!(state.begin_install(VERSION), Err("update_not_ready"));
        assert!(state.bytes.is_none());
    }
    let mut state = available();
    state.begin_download(VERSION).unwrap();
    let verified =
        crate::update_policy::verify(bytes, signature, key, VERSION).map(|_| bytes.to_vec());
    state.downloaded(verified).unwrap();
    state.begin_install(VERSION).unwrap();
    assert_eq!(state.take_install_bytes().unwrap(), bytes);
}
