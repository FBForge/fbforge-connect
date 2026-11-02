use super::*;
use std::sync::atomic::Ordering;
fn runtime() -> Runtime {
    Runtime::open(unique(&std::env::temp_dir(), "fbforge-scanner-regression")).unwrap()
}
#[test]
fn cancelled_or_invalid_scanner_commit_removes_only_its_stage_and_preserves_previous_installation()
{
    for cancelled in [false, true] {
        let mut runtime = runtime();
        let root = runtime.root.clone();
        fs::create_dir_all(runtime.current().join("database")).unwrap();
        fs::write(
            runtime.current().join("database/previous"),
            b"previous database sentinel",
        )
        .unwrap();
        let stage = unique(&root, "install");
        fs::create_dir_all(stage.join("engine")).unwrap();
        fs::create_dir_all(stage.join("database")).unwrap();
        fs::write(stage.join("database/invalid"), b"untrusted").unwrap();
        runtime.cancel.store(cancelled, Ordering::Release);
        assert_eq!(
            runtime.commit(stage.clone()),
            Err(if cancelled {
                "content_cancelled"
            } else {
                "scanner_package_invalid"
            })
        );
        assert!(!stage.exists());
        assert_eq!(
            fs::read(runtime.current().join("database/previous")).unwrap(),
            b"previous database sentinel"
        );
        assert!(!root.join("previous").exists());
        drop(runtime);
        fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn malformed_offline_component_never_replaces_existing_engine_or_database() {
    let mut runtime = runtime();
    let root = runtime.root.clone();
    fs::create_dir_all(runtime.current()).unwrap();
    fs::write(runtime.current().join("previous"), b"preserve").unwrap();
    let archive = root.join("corrupt.zip");
    fs::write(&archive, b"not a component archive").unwrap();
    assert!(runtime.install_offline(&archive).is_err());
    assert_eq!(
        fs::read(runtime.current().join("previous")).unwrap(),
        b"preserve"
    );
    assert!(!root.join("previous").exists());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
    drop(runtime);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn invalid_or_future_database_headers_are_never_reported_as_current_signatures() {
    let runtime = runtime();
    let root = runtime.root.clone();
    let path = root.join("daily.cvd");
    for header in [
        "not a ClamAV header".to_string(),
        "ClamAV-VDB:today:not-number:0:0:0:0:0:1".into(),
        "ClamAV-VDB:today:1:0:0:0:0:0:0".into(),
        format!("ClamAV-VDB:today:1:0:0:0:0:0:{}", now() + 3600),
    ] {
        let mut bytes = header.into_bytes();
        bytes.resize(512, b' ');
        fs::write(&path, bytes).unwrap();
        assert_eq!(database_header(&path), Err("scanner_database_invalid"));
    }
    let mut valid = format!("ClamAV-VDB:today:123:0:0:0:0:0:{}", now() - 86400).into_bytes();
    valid.resize(512, b' ');
    fs::write(&path, valid).unwrap();
    assert_eq!(database_header(&path).unwrap().0, 123);
    drop(runtime);
    fs::remove_dir_all(root).unwrap();
}
