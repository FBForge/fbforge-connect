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

fn write_database_header(directory: &Path, name: &str, version: u64, timestamp: u64) {
    fs::create_dir_all(directory).unwrap();
    let mut bytes = format!("ClamAV-VDB:fixture:{version}:0:0:0:0:0:{timestamp}").into_bytes();
    bytes.resize(512, b' ');
    fs::write(directory.join(name), bytes).unwrap();
}

#[test]
fn every_database_rejects_version_or_timestamp_rollback_with_daily_unchanged() {
    let runtime = runtime();
    let root = runtime.root.clone();
    let current = root.join("baseline");
    let next = root.join("candidate");
    let timestamp = now() - 86400;
    for name in package::DATABASES {
        write_database_header(&current, name, 100, timestamp);
        write_database_header(&next, name, 100, timestamp);
    }
    assert_eq!(ensure_database_progress(&current, &next), Ok(()));
    for name in package::DATABASES {
        for (version, time) in [(99, timestamp), (101, timestamp - 1)] {
            write_database_header(&next, name, version, time);
            assert_eq!(
                ensure_database_progress(&current, &next),
                Err("scanner_database_rollback"),
                "rollback accepted for {name}"
            );
            assert_eq!(
                database_header(&current.join(name)).unwrap(),
                (100, timestamp)
            );
        }
        write_database_header(&next, name, 101, timestamp + 1);
    }
    assert_eq!(ensure_database_progress(&current, &next), Ok(()));
    drop(runtime);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn verified_database_can_repair_missing_or_unreadable_baseline() {
    let runtime = runtime();
    let root = runtime.root.clone();
    let current = root.join("missing-baseline");
    let next = root.join("candidate");
    for name in package::DATABASES {
        write_database_header(&next, name, 100, now() - 86400);
    }
    assert_eq!(ensure_database_progress(&current, &next), Ok(()));
    fs::create_dir_all(&current).unwrap();
    fs::write(current.join("main.cvd"), b"corrupt baseline").unwrap();
    assert_eq!(ensure_database_progress(&current, &next), Ok(()));
    write_database_header(&current, "bytecode.cvd", 100, now() - 86400);
    fs::remove_file(next.join("bytecode.cvd")).unwrap();
    assert_eq!(
        ensure_database_progress(&current, &next),
        Err("scanner_database_missing")
    );
    drop(runtime);
    fs::remove_dir_all(root).unwrap();
}
