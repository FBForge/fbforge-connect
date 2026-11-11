//! Explicit proxy configuration is user-bound encrypted. Passwords never return to the renderer.
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Mutex, OnceLock},
};
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetworkSettings {
    #[serde(default = "system")]
    pub mode: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub trusted_certificates: Vec<String>,
}
fn system() -> String {
    "system".into()
}
impl NetworkSettings {
    pub fn defaults() -> Self {
        Self {
            mode: system(),
            ..Self::default()
        }
    }
    pub fn validate(&self) -> Result<(), &'static str> {
        if !["system", "direct", "manual"].contains(&self.mode.as_str())
            || self.host.len() > 253
            || self.username.len() > 512
            || self.password.len() > 4096
            || self.username.chars().any(char::is_control)
            || self.password.chars().any(char::is_control)
            || self.mode == "manual"
                && (self.host.is_empty()
                    || self.port == 0
                    || !self
                        .host
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b".:-".contains(&b)))
        {
            return Err("proxy_invalid");
        }
        crate::network_trust::validate(&self.trusted_certificates)?;
        Ok(())
    }
    pub fn load(path: &Path) -> Result<Self, &'static str> {
        if !path.try_exists().map_err(|_| "vault_unavailable")? {
            return Ok(Self::defaults());
        }
        let encrypted = crate::vault::read_bounded(path, 400 * 1024)?;
        let mut plain = crate::vault::protection::transform_with_purpose(
            &encrypted,
            false,
            b"FBForge Connect / network / v1",
        )?;
        let settings = serde_json::from_slice::<Self>(&plain).map_err(|_| "proxy_invalid");
        plain.fill(0);
        let settings = settings?;
        settings.validate()?;
        Ok(settings)
    }
    pub fn save(&self, path: &Path) -> Result<(), &'static str> {
        self.validate()?;
        let mut plain = serde_json::to_vec(self).map_err(|_| "proxy_invalid")?;
        let encrypted = crate::vault::protection::transform_with_purpose(
            &plain,
            true,
            b"FBForge Connect / network / v1",
        );
        plain.fill(0);
        std::fs::create_dir_all(path.parent().ok_or("vault_invalid")?)
            .map_err(|_| "vault_unavailable")?;
        crate::vault::write_protected(path, &encrypted?)
    }
    pub fn apply_engine(
        &self,
        command: &mut tokio::process::Command,
    ) -> Result<Option<crate::network_trust_bundle::TrustBundle>, &'static str> {
        let manual = self.mode == "manual";
        command
            .env("FBFORGE_PROXY_MODE", &self.mode)
            .env("FBFORGE_PROXY_HOST", if manual { &self.host } else { "" })
            .env(
                "FBFORGE_PROXY_PORT",
                if manual { self.port } else { 0 }.to_string(),
            )
            .env(
                "FBFORGE_PROXY_USERNAME",
                if manual { &self.username } else { "" },
            )
            .env(
                "FBFORGE_PROXY_PASSWORD",
                if manual { &self.password } else { "" },
            );
        for key in [
            "FBFORGE_TRUST_PEM",
            "FBFORGE_TRUST_STORE",
            "FBFORGE_TRUST_FINGERPRINTS",
        ] {
            command.env_remove(key);
        }
        let bundle =
            crate::network_trust_bundle::TrustBundle::create(&self.trusted_certificates, None)?;
        if let Some(b) = &bundle {
            command
                .env("FBFORGE_TRUST_PEM", &b.pem)
                .env("FBFORGE_TRUST_STORE", &b.store)
                .env("FBFORGE_TRUST_FINGERPRINTS", &b.fingerprints);
        }
        Ok(bundle)
    }
}
static CURRENT: OnceLock<Mutex<Result<NetworkSettings, &'static str>>> = OnceLock::new();
pub fn set(value: Result<NetworkSettings, &'static str>) {
    if let Ok(mut state) = CURRENT
        .get_or_init(|| Mutex::new(Ok(NetworkSettings::defaults())))
        .lock()
    {
        *state = value;
    }
}
pub fn current() -> Result<NetworkSettings, &'static str> {
    CURRENT
        .get_or_init(|| Mutex::new(Ok(NetworkSettings::defaults())))
        .lock()
        .map_err(|_| "proxy_invalid")?
        .clone()
}
pub fn client(builder: reqwest::ClientBuilder) -> Result<reqwest::ClientBuilder, &'static str> {
    let settings = current()?;
    let builder = crate::network_trust::client(builder, &settings.trusted_certificates)?;
    if settings.mode == "direct" {
        return Ok(builder.no_proxy());
    }
    if settings.mode != "manual" {
        return Ok(builder);
    }
    let host = if settings.host.contains(':') {
        format!("[{}]", settings.host)
    } else {
        settings.host
    };
    let mut proxy = reqwest::Proxy::all(format!("http://{}:{}", host, settings.port))
        .map_err(|_| "proxy_invalid")?;
    if !settings.username.is_empty() {
        proxy = proxy.basic_auth(&settings.username, &settings.password);
    }
    Ok(builder.no_proxy().proxy(proxy))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn proxy_configuration_rejects_urls_control_characters_and_incomplete_manual_settings() {
        let mut settings = NetworkSettings::defaults();
        settings.validate().unwrap();
        settings.mode = "manual".into();
        assert_eq!(settings.validate(), Err("proxy_invalid"));
        settings.host = "proxy.example.de".into();
        settings.port = 8080;
        settings.validate().unwrap();
        for host in [
            "http://proxy.example.de",
            "proxy.example.de/path",
            "proxy\n.example.de",
            "user@proxy.example.de",
        ] {
            settings.host = host.into();
            assert_eq!(settings.validate(), Err("proxy_invalid"));
        }
    }
    #[test]
    fn manual_proxy_credentials_are_not_exported_in_system_or_direct_mode() {
        let mut settings = NetworkSettings::defaults();
        settings.host = "manual-proxy.example".into();
        settings.port = 8080;
        settings.username = "synthetic-proxy-user".into();
        settings.password = "synthetic-proxy-secret".into();
        for mode in ["manual", "system", "direct"] {
            settings.mode = mode.into();
            let mut command = tokio::process::Command::new("not-executed");
            let _bundle = settings.apply_engine(&mut command).unwrap();
            let fields: std::collections::HashMap<_, _> = command
                .as_std()
                .get_envs()
                .filter_map(|(key, value)| {
                    value.map(|value| {
                        (
                            key.to_string_lossy().into_owned(),
                            value.to_string_lossy().into_owned(),
                        )
                    })
                })
                .collect();
            assert_eq!(
                fields["FBFORGE_PROXY_USERNAME"],
                if mode == "manual" {
                    "synthetic-proxy-user"
                } else {
                    ""
                }
            );
            assert_eq!(
                fields["FBFORGE_PROXY_PASSWORD"],
                if mode == "manual" {
                    "synthetic-proxy-secret"
                } else {
                    ""
                }
            );
            assert_eq!(
                fields["FBFORGE_PROXY_HOST"],
                if mode == "manual" {
                    "manual-proxy.example"
                } else {
                    ""
                }
            );
            assert_eq!(
                fields["FBFORGE_PROXY_PORT"],
                if mode == "manual" { "8080" } else { "0" }
            );
        }
        assert_eq!(settings.password, "synthetic-proxy-secret");
    }
    #[test]
    fn saved_proxy_passwords_are_user_protected_and_not_plaintext() {
        let root = std::env::temp_dir().join(format!(
            "fbforge-network-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("network.fcprefs");
        let mut settings = NetworkSettings::defaults();
        settings.mode = "manual".into();
        settings.host = "proxy.example.de".into();
        settings.port = 8080;
        settings.password = "synthetic-test-password".into();
        let result = settings.save(&path);
        if cfg!(windows) {
            result.unwrap();
            assert_eq!(
                NetworkSettings::load(&path).unwrap().password,
                settings.password
            );
            assert!(!String::from_utf8_lossy(&std::fs::read(&path).unwrap())
                .contains(&settings.password));
        } else {
            assert_eq!(result, Err("vault_unsupported"));
            assert!(!path.exists());
        }
        let _ = std::fs::remove_dir_all(root);
    }
}

/// FreshClam uses libcurl's proxy environment, scoped to our owned child, never command arguments.
pub fn downloader(
    command: &mut std::process::Command,
) -> Result<&mut std::process::Command, &'static str> {
    let settings = current()?;
    if settings.mode == "system" {
        return Ok(command);
    }
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ] {
        command.env_remove(key);
    }
    if settings.mode == "manual" {
        let host = if settings.host.contains(':') {
            format!("[{}]", settings.host)
        } else {
            settings.host
        };
        let mut proxy = reqwest::Url::parse(&format!("http://{}:{}", host, settings.port))
            .map_err(|_| "proxy_invalid")?;
        proxy
            .set_username(&settings.username)
            .map_err(|_| "proxy_invalid")?;
        proxy
            .set_password(if settings.password.is_empty() {
                None
            } else {
                Some(&settings.password)
            })
            .map_err(|_| "proxy_invalid")?;
        for key in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] {
            command.env(key, proxy.as_str());
        }
        command.env("NO_PROXY", "").env("no_proxy", "");
    }
    Ok(command)
}

pub fn download_trust(
    command: &mut std::process::Command,
) -> Result<Option<crate::network_trust_bundle::TrustBundle>, &'static str> {
    let bundle =
        crate::network_trust_bundle::TrustBundle::downloader(&current()?.trusted_certificates)?;
    if let Some(b) = &bundle {
        command
            .env("CURL_CA_BUNDLE", &b.pem)
            .env("SSL_CERT_FILE", &b.pem);
    }
    Ok(bundle)
}
