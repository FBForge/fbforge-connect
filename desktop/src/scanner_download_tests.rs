use super::*;
use std::io::Write;
fn root() -> PathBuf {
    let root = crate::scanner_runtime::unique(&std::env::temp_dir(), "fbforge-scanner-download");
    fs::create_dir(&root).unwrap();
    root
}
#[test]
fn an_interrupted_download_never_blocks_retry_or_overwrites_the_previous_installation() {
    let root = root();
    fs::create_dir(root.join("current")).unwrap();
    fs::write(root.join("current/retained"), b"previous scanner database").unwrap();
    fs::write(root.join("engine-download.zip"), b"interrupted archive").unwrap();
    let attempt = Attempt::begin(&root).unwrap();
    let mut file =
        create_archive(&attempt.archive).expect("a stale archive must not block another attempt");
    file.write_all(b"new attempt").unwrap();
    drop(file);
    assert_eq!(
        fs::read(root.join("engine-download.zip")).unwrap(),
        b"interrupted archive"
    );
    assert_eq!(
        fs::read(root.join("current/retained")).unwrap(),
        b"previous scanner database"
    );
    drop(attempt);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn attempts_started_immediately_after_each_other_have_independent_archives_and_stages() {
    let root = root();
    let first = Attempt::begin(&root).unwrap();
    let second = Attempt::begin(&root).unwrap();
    assert_ne!(first.archive, second.archive);
    assert_ne!(first.stage, second.stage);
    create_archive(&first.archive)
        .unwrap()
        .write_all(b"first download")
        .unwrap();
    create_archive(&second.archive)
        .unwrap()
        .write_all(b"second download")
        .unwrap();
    assert_eq!(
        create_archive(&first.archive).err(),
        Some("scanner_install_failed")
    );
    assert_eq!(fs::read(&first.archive).unwrap(), b"first download");
    let first_path = first.directory.clone();
    drop(first);
    assert!(!first_path.exists());
    assert_eq!(fs::read(&second.archive).unwrap(), b"second download");
    let second_path = second.directory.clone();
    drop(second);
    assert!(!second_path.exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn restarting_cleans_only_owned_staging_and_keeps_current_database_and_unrelated_files() {
    let root = root();
    fs::create_dir(root.join("current")).unwrap();
    fs::write(root.join("current/database"), b"retained database").unwrap();
    fs::write(root.join("unrelated"), b"retain").unwrap();
    let abandoned = Attempt::begin(&root).unwrap();
    create_archive(&abandoned.archive)
        .unwrap()
        .write_all(b"partial download")
        .unwrap();
    let path = abandoned.directory.clone();
    std::mem::forget(abandoned);
    fs::write(root.join("engine-download.zip"), b"legacy partial download").unwrap();
    let runtime = crate::scanner_runtime::Runtime::open(root.clone()).unwrap();
    assert!(!path.exists());
    assert!(!root.join("engine-download.zip").exists());
    assert_eq!(
        fs::read(root.join("current/database")).unwrap(),
        b"retained database"
    );
    assert_eq!(fs::read(root.join("unrelated")).unwrap(), b"retain");
    let retry = Attempt::begin(&root).unwrap();
    create_archive(&retry.archive).unwrap();
    drop(retry);
    drop(runtime);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn successful_stage_adoption_is_not_removed_when_attempt_cleanup_runs() {
    let root = root();
    let attempt = Attempt::begin(&root).unwrap();
    fs::create_dir(&attempt.stage).unwrap();
    fs::write(attempt.stage.join("verified"), b"adopted component").unwrap();
    fs::rename(&attempt.stage, root.join("current")).unwrap();
    drop(attempt);
    assert_eq!(
        fs::read(root.join("current/verified")).unwrap(),
        b"adopted component"
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn a_non_directory_staging_root_is_not_overwritten() {
    let root = root();
    fs::write(root.join(DIRECTORY), b"retain").unwrap();
    assert_eq!(Attempt::begin(&root).err(), Some("scanner_install_failed"));
    cleanup_stale(&root);
    assert_eq!(fs::read(root.join(DIRECTORY)).unwrap(), b"retain");
    let unavailable_parent = root.join("unavailable-parent");
    fs::write(&unavailable_parent, b"retain parent").unwrap();
    assert_eq!(
        Attempt::begin(&unavailable_parent).err(),
        Some("scanner_install_failed")
    );
    assert_eq!(fs::read(unavailable_parent).unwrap(), b"retain parent");
    fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn a_locked_cancelled_archive_does_not_block_the_next_download() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = root();
    let first = Attempt::begin(&root).unwrap();
    create_archive(&first.archive)
        .unwrap()
        .write_all(b"cancelled")
        .unwrap();
    let path = first.directory.clone();
    let guard = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&first.archive)
        .unwrap();
    drop(first);
    assert!(path.exists());
    let retry = Attempt::begin(&root).unwrap();
    create_archive(&retry.archive)
        .unwrap()
        .write_all(b"new download")
        .unwrap();
    assert_eq!(fs::read(&retry.archive).unwrap(), b"new download");
    drop(retry);
    drop(guard);
    cleanup_stale(&root);
    assert!(!path.exists());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(unix)]
#[test]
fn a_symlink_at_the_staging_root_is_never_followed_or_cleaned_recursively() {
    let root = root();
    let outside = crate::scanner_runtime::unique(&std::env::temp_dir(), "fbforge-foreign-download");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("retain"), b"foreign").unwrap();
    std::os::unix::fs::symlink(&outside, root.join(DIRECTORY)).unwrap();
    assert_eq!(Attempt::begin(&root).err(), Some("scanner_install_failed"));
    cleanup_stale(&root);
    assert_eq!(fs::read(outside.join("retain")).unwrap(), b"foreign");
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(outside).unwrap();
}
