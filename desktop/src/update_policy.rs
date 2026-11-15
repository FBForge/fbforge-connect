//! Update metadata is untrusted. Only stable releases of this repository can be installed.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde_json::Value;

pub const ENDPOINT: &str =
    "https://github.com/FBForge/fbforge-connect/releases/latest/download/latest.json";
pub const MAX_MANIFEST: usize = 128 * 1024;
pub const MAX_PACKAGE: usize = 512 * 1024 * 1024;

/// Missing metadata is distinct from an unreachable server or an invalid signature.
pub fn response_error(status: u16, manifest: bool) -> Option<&'static str> {
    match status {
        200..=299 => None,
        404 if manifest => Some("update_feed_unavailable"),
        429 => Some("update_rate_limited"),
        _ => Some("update_network_failed"),
    }
}

pub fn stable_version(text: &str) -> Result<Version, &'static str> {
    let version = Version::parse(text.strip_prefix('v').unwrap_or(text))
        .map_err(|_| "update_manifest_invalid")?;
    if text.len() > 64 || !version.pre.is_empty() || !version.build.is_empty() {
        return Err("update_manifest_invalid");
    }
    Ok(version)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Target {
    WindowsX64,
    MacArm64,
}
impl Target {
    pub fn current() -> Option<Self> {
        if cfg!(all(windows, target_arch = "x86_64")) {
            Some(Self::WindowsX64)
        } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            Some(Self::MacArm64)
        } else {
            None
        }
    }
    pub fn feed_key(self) -> &'static str {
        match self {
            Self::WindowsX64 => "windows-x86_64",
            Self::MacArm64 => "darwin-aarch64",
        }
    }
    pub fn package_url(self, version: &Version) -> String {
        let name = match self {
            Self::WindowsX64 => format!("FBForge.Connect_{version}_x64-setup.exe"),
            Self::MacArm64 => format!("FBForge.Connect_{version}_aarch64.app.tar.gz"),
        };
        format!("https://github.com/FBForge/fbforge-connect/releases/download/v{version}/{name}")
    }
}
// Existing Windows artifact verifiers retain their exact feed contract.
pub fn package_url(version: &Version) -> String {
    Target::WindowsX64.package_url(version)
}

pub fn trusted_transport(url: &str) -> bool {
    // Accept GitHub's signed asset redirects, never arbitrary third-party hosts or HTTP.
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split('/').next().unwrap_or("");
    matches!(
        authority,
        "github.com"
            | "release-assets.githubusercontent.com"
            | "objects.githubusercontent.com"
            | "github-releases.githubusercontent.com"
    )
}

pub fn manifest(value: &Value, current: &str) -> Result<bool, &'static str> {
    manifest_for(value, current, Target::WindowsX64)
}
pub fn manifest_for(value: &Value, current: &str, target: Target) -> Result<bool, &'static str> {
    let version = stable_version(value["version"].as_str().ok_or("update_manifest_invalid")?)?;
    let current = Version::parse(current).map_err(|_| "update_manifest_invalid")?;
    let platform = &value["platforms"][target.feed_key()];
    if value.get("draft").is_some_and(|v| v != false)
        || value.get("prerelease").is_some_and(|v| v != false)
        || platform["url"].as_str() != Some(target.package_url(&version).as_str())
        || platform["signature"]
            .as_str()
            .is_none_or(|s| s.is_empty() || s.len() > 4096)
        || value
            .get("notes")
            .is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 12000))
    {
        return Err("update_manifest_invalid");
    }
    Ok(version > current)
}

pub fn public_key(text: &str) -> Result<PublicKey, &'static str> {
    let decoded = STANDARD
        .decode(text.trim())
        .map_err(|_| "update_not_configured")?;
    let decoded = String::from_utf8(decoded).map_err(|_| "update_not_configured")?;
    PublicKey::decode(&decoded).map_err(|_| "update_not_configured")
}

/// Used both by the native client and the independent release-artifact verifier.
pub fn verify(bytes: &[u8], signature: &str, key: &str, version: &str) -> Result<(), &'static str> {
    verify_for(bytes, signature, key, version, Target::WindowsX64)
}
pub fn verify_for(
    bytes: &[u8],
    signature: &str,
    key: &str,
    version: &str,
    target: Target,
) -> Result<(), &'static str> {
    let correct_container = match target {
        Target::WindowsX64 => bytes.starts_with(b"MZ"),
        Target::MacArm64 => bytes.starts_with(&[0x1f, 0x8b, 0x08]),
    };
    if bytes.len() > MAX_PACKAGE || !correct_container {
        return Err("update_package_invalid");
    }
    let key = public_key(key)?;
    let decoded = STANDARD
        .decode(signature.trim())
        .map_err(|_| "update_signature_invalid")?;
    let decoded = String::from_utf8(decoded).map_err(|_| "update_signature_invalid")?;
    let signature = Signature::decode(&decoded).map_err(|_| "update_signature_invalid")?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "update_signature_invalid")?;
    // Only read the trusted comment after both the data and comment signatures verify.
    let signed = signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
        .ok_or("update_signature_invalid")?;
    if stable_version(signed)? != stable_version(version)? {
        return Err("update_signature_invalid");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn embedded_release_verification_key_is_configured_and_valid() {
        assert!(super::public_key(include_str!("../update-public-key.txt")).is_ok());
    }

    use super::*;
    #[test]
    fn missing_manifest_is_not_a_network_or_signature_failure() {
        assert_eq!(response_error(404, true), Some("update_feed_unavailable"));
        assert_eq!(response_error(404, false), Some("update_network_failed"));
        assert_eq!(response_error(429, true), Some("update_rate_limited"));
        assert_eq!(response_error(503, true), Some("update_network_failed"));
        assert_eq!(response_error(200, true), None);
    }
    fn release(version: &str) -> Value {
        serde_json::json!({"version":version,"notes":"Fiktive Änderungen",
            "platforms":{"windows-x86_64":{"url":package_url(&Version::parse(version).unwrap()),"signature":"synthetic"}}})
    }
    #[test]
    fn only_newer_stable_versions_are_updates() {
        assert!(manifest(&release("0.10.0"), "0.3.0").unwrap());
        for version in ["0.2.1", "0.3.0"] {
            assert!(!manifest(&release(version), "0.3.0").unwrap());
        }
        for version in ["0.4.0-beta.1", "0.4.0+other", "latest", "v0.4"] {
            assert!(stable_version(version).is_err());
        }
    }
    #[test]
    fn foreign_packages_missing_targets_and_malformed_metadata_are_rejected() {
        for (pointer, value) in [
            (
                "/platforms/windows-x86_64/url",
                Value::String("https://example.org/setup.exe".into()),
            ),
            (
                "/platforms/windows-x86_64/signature",
                Value::String(String::new()),
            ),
            ("/platforms", serde_json::json!({"linux-x86_64":{}})),
            ("/notes", Value::String("x".repeat(12001))),
        ] {
            let mut input = release("0.4.0");
            *input.pointer_mut(pointer).unwrap() = value;
            assert!(manifest(&input, "0.3.0").is_err());
        }
        for flag in ["draft", "prerelease"] {
            let mut input = release("0.4.0");
            input[flag] = true.into();
            assert!(manifest(&input, "0.3.0").is_err());
        }
    }
    #[test]
    fn redirect_hosts_and_public_keys_are_not_selected_by_the_renderer() {
        for url in [
            "http://github.com/a",
            "https://github.com.evil/a",
            "https://user@github.com/a",
            "https://127.0.0.1/a",
            "https://github.com:443/a",
        ] {
            assert!(!trusted_transport(url));
        }
        assert!(trusted_transport(ENDPOINT));
        assert!(trusted_transport(
            "https://release-assets.githubusercontent.com/a?token=synthetic"
        ));
        assert!(public_key("").is_err());
        assert!(verify(b"MZsynthetic", "invalid", "invalid", "0.4.0").is_err());
    }
    #[test]
    fn real_tauri_signatures_bind_package_bytes_and_release_version() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/update-signature.json"))
                .unwrap();
        let key = fixture["publicKey"].as_str().unwrap();
        let signature = fixture["signature"].as_str().unwrap();
        let bytes = fixture["data"].as_str().unwrap().as_bytes();
        assert!(verify(bytes, signature, key, "0.4.0").is_ok());
        assert!(verify(b"MZtampered", signature, key, "0.4.0").is_err());
        assert!(verify(bytes, signature, key, "0.5.0").is_err());
        assert!(verify(
            bytes,
            fixture["unversionedSignature"].as_str().unwrap(),
            key,
            "0.4.0"
        )
        .is_err());
        assert!(verify(bytes, "invalid", key, "0.4.0").is_err());
        assert!(verify(bytes, signature, "", "0.4.0").is_err());
    }
}

#[cfg(test)]
mod macos_tests {
    use super::*;
    #[test]
    fn each_platform_is_bound_to_its_own_asset_and_architecture() {
        let version = Version::parse("0.5.0").unwrap();
        let mut value = serde_json::json!({"version":"0.5.0","platforms":{}});
        for target in [Target::WindowsX64, Target::MacArm64] {
            value["platforms"][target.feed_key()] =
                serde_json::json!({"url":target.package_url(&version),"signature":"synthetic"});
        }
        for target in [Target::WindowsX64, Target::MacArm64] {
            assert_eq!(manifest_for(&value, "0.4.0", target), Ok(true));
            let mut swapped = value.clone();
            swapped["platforms"][target.feed_key()]["url"] =
                serde_json::json!("https://other.invalid/app.tar.gz");
            assert!(manifest_for(&swapped, "0.4.0", target).is_err());
        }
        assert!(verify_for(b"MZsynthetic", "", "", "0.5.0", Target::MacArm64).is_err());
        assert!(verify_for(&[0x1f, 0x8b, 8], "", "", "0.5.0", Target::MacArm64).is_err());
    }
}
