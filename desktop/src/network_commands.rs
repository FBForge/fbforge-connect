use crate::{
    engine::EngineState,
    network_settings::{self, NetworkSettings},
};
use serde::Deserialize;
use tauri::{Manager, State};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    mode: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    trusted_certificates: Option<Vec<String>>,
}
#[tauri::command]
pub fn network_settings() -> Result<serde_json::Value, &'static str> {
    let settings = network_settings::current()?;
    Ok(
        serde_json::json!({"mode":settings.mode,"host":settings.host,"port":settings.port,"username":settings.username,"hasPassword":!settings.password.is_empty(),"trustedCertificates":crate::network_trust::validate(&settings.trusted_certificates)?}),
    )
}
#[tauri::command]
pub async fn save_network_settings(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    settings: Change,
) -> Result<(), &'static str> {
    if crate::local_scanner::busy(&app)
        || app
            .state::<crate::message_exports::MessageExports>()
            .active()
            .await
        || app.state::<crate::file_saves::FileSaves>().active()
    {
        return Err("application_activity_pending");
    }
    let old = network_settings::current().unwrap_or_else(|_| NetworkSettings::defaults());
    let trusted_certificates = settings
        .trusted_certificates
        .unwrap_or_else(|| old.trusted_certificates.clone());
    for info in crate::network_trust::validate(&trusted_certificates)? {
        if !info.active && !old.trusted_certificates.contains(&info.der) {
            return Err("network_certificate_expired");
        }
    }
    let password = settings.password.unwrap_or_else(|| {
        if settings.host == old.host
            && settings.port == old.port
            && settings.username == old.username
        {
            old.password
        } else {
            String::new()
        }
    });
    let updated = NetworkSettings {
        mode: settings.mode,
        host: settings.host,
        port: settings.port,
        username: settings.username,
        password,
        trusted_certificates,
    };
    updated.validate()?;
    let profiles: Vec<_> = state
        .profiles
        .lock()
        .await
        .iter()
        .map(|(id, p)| (id.clone(), p.api))
        .collect();
    for (id, api) in profiles {
        crate::profiles::checkpoint(&app, &state, api, &id).await?;
    }
    let mut process = state.process.try_lock().map_err(|_| "engine_busy")?;
    updated.save(
        &app.path()
            .app_data_dir()
            .map_err(|_| "vault_unavailable")?
            .join("network.fcprefs"),
    )?;
    network_settings::set(Ok(updated));
    let shutdown = if let Some(child) = process.take() {
        child.shutdown().await
    } else {
        Ok(())
    };
    state.forget_closed_sessions().await;
    shutdown.map_err(|_| "engine_disconnected")?;
    Ok(())
}

/// Fixed public FIM lookup. No caller-selected URL, FIT-Connect token or private content.
#[tauri::command]
pub async fn lookup_service_names(code: String) -> Result<serde_json::Value, &'static str> {
    if code.len() != 14 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err("invalid_input");
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let http = network_settings::client(reqwest::Client::builder())?
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| "service_names_unavailable")?;
    let url=format!("https://fimportal.de/api/v1/leistung-steckbriefe?fts_query={code}&order_by=relevance&offset=0&limit=20");
    let mut response = http
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| "service_names_unavailable")?;
    if !response.status().is_success()
        || !response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.split(';').next() == Some("application/json"))
        || response.content_length().is_some_and(|n| n > 256 * 1024)
    {
        return Err("service_names_unavailable");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "service_names_unavailable")?
    {
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err("service_names_unavailable");
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "service_names_unavailable")
}

#[tauri::command]
pub fn inspect_network_certificate(
    content: String,
) -> Result<crate::network_trust::CertificateInfo, &'static str> {
    let info = crate::network_trust::inspect_file(&content)?;
    if !info.active {
        return Err("network_certificate_expired");
    }
    Ok(info)
}
