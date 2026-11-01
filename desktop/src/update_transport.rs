//! Bounded HTTPS requests independent of any FIT-Connect session or credentials.
use crate::update_policy::{
    response_error, trusted_transport, ENDPOINT, MAX_MANIFEST, MAX_PACKAGE,
};
use reqwest::{redirect::Policy, Client};
use std::{sync::atomic::AtomicBool, time::Duration};

fn client() -> Result<Client, &'static str> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    crate::network_settings::client(Client::builder())?
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .user_agent("FBForge-Connect-Updater")
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() < 5 && trusted_transport(attempt.url().as_str()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| "update_network_failed")
}

async fn read(
    url: &str,
    limit: usize,
    manifest: bool,
    cancelled: &AtomicBool,
    progress: impl FnMut(usize, Option<u64>),
) -> Result<Vec<u8>, &'static str> {
    read_with(client()?, url, limit, manifest, cancelled, progress).await
}

async fn read_with(
    http: Client,
    url: &str,
    limit: usize,
    manifest: bool,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(usize, Option<u64>),
) -> Result<Vec<u8>, &'static str> {
    let mut response = crate::cancellable::wait(cancelled, http.get(url).send())
        .await?
        .map_err(|_| "update_network_failed")?;
    if let Some(error) = response_error(response.status().as_u16(), manifest) {
        return Err(error);
    }
    if !trusted_transport(response.url().as_str()) {
        return Err("update_network_failed");
    }
    let total = response.content_length();
    if total.is_some_and(|size| size > limit as u64) {
        return Err("update_package_too_large");
    }
    let mut bytes = Vec::new();
    loop {
        let chunk = crate::cancellable::wait(cancelled, response.chunk())
            .await?
            .map_err(|_| "update_network_failed")?;
        let Some(chunk) = chunk else { break };
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err("update_package_too_large");
        }
        bytes.extend_from_slice(&chunk);
        progress(bytes.len(), total);
    }
    if total.is_some_and(|size| size != bytes.len() as u64) {
        return Err("update_network_failed");
    }
    Ok(bytes)
}

pub async fn manifest() -> Result<serde_json::Value, &'static str> {
    let bytes = tokio::time::timeout(
        Duration::from_secs(20),
        read(
            ENDPOINT,
            MAX_MANIFEST,
            true,
            &AtomicBool::new(false),
            |_, _| {},
        ),
    )
    .await
    .map_err(|_| "update_network_failed")??;
    serde_json::from_slice(&bytes).map_err(|_| "update_manifest_invalid")
}

pub async fn package(
    url: &str,
    cancelled: &AtomicBool,
    progress: impl FnMut(usize, Option<u64>),
) -> Result<Vec<u8>, &'static str> {
    read(url, MAX_PACKAGE, false, cancelled, progress).await
}

#[cfg(test)]
#[path = "update_transport_tests.rs"]
mod tests;
