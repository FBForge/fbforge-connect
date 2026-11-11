//! Explicit app-scoped additional CA roots. Default trust and hostname checks stay enabled.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use sha2::{Digest, Sha256};
use x509_parser::prelude::*;
const LIMIT: usize = 32 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub der: String,
    pub subject: String,
    pub fingerprint: String,
    pub valid_from: i64,
    pub valid_until: i64,
    pub active: bool,
}
pub fn inspect_der(der: &[u8]) -> Result<CertificateInfo, &'static str> {
    if der.len() > LIMIT {
        return Err("network_certificate_limit");
    }
    let (rest, cert) = X509Certificate::from_der(der).map_err(|_| "network_certificate_invalid")?;
    if !rest.is_empty()
        || !cert
            .basic_constraints()
            .map_err(|_| "network_certificate_invalid")?
            .is_some_and(|v| v.value.ca)
        || cert
            .key_usage()
            .map_err(|_| "network_certificate_invalid")?
            .is_some_and(|v| !v.value.key_cert_sign())
    {
        return Err("network_certificate_invalid");
    }
    let subject = cert
        .subject()
        .to_string()
        .chars()
        .filter(|c| !c.is_control())
        .take(512)
        .collect();
    Ok(CertificateInfo {
        der: STANDARD.encode(der),
        subject,
        fingerprint: format!("{:X}", Sha256::digest(der)),
        valid_from: cert.validity().not_before.timestamp(),
        valid_until: cert.validity().not_after.timestamp(),
        active: cert.validity().is_valid(),
    })
}
pub fn inspect_file(encoded: &str) -> Result<CertificateInfo, &'static str> {
    if encoded.len() > 64 * 1024 {
        return Err("network_certificate_limit");
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "network_certificate_invalid")?;
    let first = bytes
        .iter()
        .position(|v| !v.is_ascii_whitespace())
        .unwrap_or(0);
    if bytes[first..].starts_with(b"-----BEGIN") {
        let (rest, pem) = x509_parser::pem::parse_x509_pem(&bytes[first..])
            .map_err(|_| "network_certificate_invalid")?;
        if pem.label != "CERTIFICATE" || rest.iter().any(|v| !v.is_ascii_whitespace()) {
            return Err("network_certificate_invalid");
        }
        inspect_der(&pem.contents)
    } else {
        inspect_der(&bytes)
    }
}
pub fn validate(roots: &[String]) -> Result<Vec<CertificateInfo>, &'static str> {
    if roots.len() > 8 {
        return Err("network_certificate_limit");
    }
    let mut fingerprints = std::collections::HashSet::new();
    roots
        .iter()
        .map(|root| {
            if root.len() > LIMIT * 2 {
                return Err("network_certificate_limit");
            }
            let info = inspect_der(
                &STANDARD
                    .decode(root)
                    .map_err(|_| "network_certificate_invalid")?,
            )?;
            if &info.der != root || !fingerprints.insert(info.fingerprint.clone()) {
                return Err("network_certificate_invalid");
            }
            Ok(info)
        })
        .collect()
}
pub fn client(
    mut builder: reqwest::ClientBuilder,
    roots: &[String],
) -> Result<reqwest::ClientBuilder, &'static str> {
    for root in validate(roots)?.into_iter().filter(|info| info.active) {
        let der = STANDARD
            .decode(root.der)
            .map_err(|_| "network_certificate_invalid")?;
        builder = builder.add_root_certificate(
            reqwest::Certificate::from_der(&der).map_err(|_| "network_certificate_invalid")?,
        );
    }
    Ok(builder)
}
pub fn pem(root: &str) -> String {
    let lines = root
        .as_bytes()
        .chunks(64)
        .map(|v| std::str::from_utf8(v).unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n");
    format!("-----BEGIN CERTIFICATE-----\n{lines}\n-----END CERTIFICATE-----\n")
}

#[cfg(test)]
#[path = "network_trust_tests.rs"]
mod tests;
