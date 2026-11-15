use super::*;
use std::io::Write;
fn workspace() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "scanner-policy-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&path).unwrap();
    path
}
fn spec() -> Component {
    Component {
        format: 1,
        version: "1.0".into(),
        target: "windows-x86_64".into(),
        signer_fingerprint: "test".into(),
        archive: Download {
            url: "unused".into(),
            bytes: 0,
            sha256: String::new(),
        },
        source: Download {
            url: "unused".into(),
            bytes: 0,
            sha256: String::new(),
        },
        files: vec![FileEntry {
            path: "clamd.exe".into(),
            bytes: 5,
            sha256: format!("{:x}", Sha256::digest(b"clean")),
        }],
    }
}
#[test]
fn official_component_is_pinned_to_a_bounded_matching_runtime() {
    let spec = component().unwrap();
    assert!(spec
        .archive
        .url
        .starts_with("https://github.com/Cisco-Talos/clamav/releases/download/"));
    assert!(spec
        .files
        .iter()
        .any(|file| file.path == program("freshclam").to_string_lossy()));
    assert!(spec.files.iter().any(|file| file.path == "COPYING.txt"));
    assert!(!spec
        .files
        .iter()
        .any(|file| file.path.ends_with(".pdb") || file.path == "clamsubmit.exe"));
}
fn write_package(path: &Path, mutation: Option<(&str, &[u8])>, link: bool) {
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for name in [
        "engine/clamd.exe",
        "database/main.cvd",
        "database/daily.cvd",
        "database/bytecode.cvd",
    ] {
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        let database = [b' '; 512];
        let baseline: &[u8] = if name.starts_with("database/") {
            &database
        } else {
            b"clean"
        };
        let bytes = mutation
            .filter(|(changed, _)| *changed == name)
            .map(|(_, bytes)| bytes)
            .unwrap_or(baseline);
        zip.write_all(bytes).unwrap();
    }
    if let Some((name, bytes)) = mutation.filter(|(name, _)| {
        ![
            "engine/clamd.exe",
            "database/main.cvd",
            "database/daily.cvd",
            "database/bytecode.cvd",
        ]
        .contains(name)
    }) {
        if link {
            zip.add_symlink(
                name,
                "../../escaped",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        } else {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(bytes).unwrap();
        }
    }
    zip.finish().unwrap();
}
#[test]
fn offline_extraction_accepts_a_complete_hash_verified_baseline() {
    let root = workspace();
    let archive = root.join("input.zip");
    write_package(&archive, None, false);
    unpack(&archive, &root.join("stage"), &spec(), true).unwrap();
    assert_eq!(
        fs::read(root.join("stage/engine/clamd.exe")).unwrap(),
        b"clean"
    );
    for name in DATABASES {
        assert!(root.join("stage/database").join(name).is_file());
    }
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn offline_package_rejects_each_mutation_of_an_otherwise_valid_archive() {
    for (name, bytes, link) in [
        ("../escaped", b"clean".as_slice(), false),
        ("/absolute.exe", b"clean".as_slice(), false),
        ("engine/CLAMD.EXE", b"clean".as_slice(), false),
        ("engine/changed.exe", b"clean".as_slice(), false),
        ("engine/clamd.exe", b"wrong".as_slice(), false),
        ("engine/clamd.exe", b"too large".as_slice(), false),
        ("engine/link", b"clean".as_slice(), true),
    ] {
        let root = workspace();
        let archive = root.join("input.zip");
        write_package(&archive, Some((name, bytes)), link);
        assert!(
            unpack(&archive, &root.join("stage"), &spec(), true).is_err(),
            "accepted {name}"
        );
        assert!(!root.join("stage").exists());
        assert!(!root.join("escaped").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn failed_install_never_removes_an_existing_installation() {
    let root = workspace();
    let previous = root.join("previous");
    fs::create_dir(&previous).unwrap();
    fs::write(previous.join("keep"), b"retained").unwrap();
    assert!(unpack(&root.join("missing.zip"), &previous, &spec(), true).is_err());
    assert_eq!(fs::read(previous.join("keep")).unwrap(), b"retained");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn engine_verification_checks_payload_and_unexpected_dlls() {
    let root = workspace();
    fs::write(root.join("clamd.exe"), b"clean").unwrap();
    verify_files(&root, &spec().files).unwrap();
    fs::write(root.join("unexpected.dll"), b"anything").unwrap();
    assert!(verify_files(&root, &spec().files).is_err());
    fs::remove_file(root.join("unexpected.dll")).unwrap();
    fs::write(root.join("clamd.exe"), b"wrong").unwrap();
    assert!(verify_files(&root, &spec().files).is_err());
    fs::remove_dir_all(root).unwrap();
}
