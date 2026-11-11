use super::*;
const CA: &str = include_str!("../../tests/fixtures/network-trust/ca.pem");
const OTHER: &str = include_str!("../../tests/fixtures/network-trust/unrelated-ca.pem");
const LEAF: &str = include_str!("../../tests/fixtures/network-trust/localhost.pem");
fn root(pem: &str) -> String {
    inspect_file(&STANDARD.encode(pem)).unwrap().der
}
#[test]
fn imported_certificates_are_single_public_ca_roots_with_fingerprints_and_validity() {
    let info = inspect_file(&STANDARD.encode(CA)).unwrap();
    assert!(info.active);
    assert_eq!(info.fingerprint.len(), 64);
    assert!(info.subject.contains("synthetic"));
    assert!(inspect_file(&STANDARD.encode(LEAF)).is_err());
    assert!(inspect_file(&STANDARD.encode(format!("{CA}{CA}"))).is_err());
    assert!(inspect_file(&STANDARD.encode(include_str!(
        "../../tests/fixtures/network-trust/localhost-test-key.pem"
    )))
    .is_err());
    let expired = inspect_file(&STANDARD.encode(include_str!(
        "../../tests/fixtures/network-trust/expired-ca.pem"
    )))
    .unwrap();
    assert!(!expired.active);
    assert!(validate(&vec![info.der.clone(); 9]).is_err());
    assert!(validate(&[info.der.clone(), info.der]).is_err());
}
#[test]
fn public_trust_bundles_are_unique_exclusive_and_removed_after_use() {
    let roots = [root(CA)];
    let first = crate::network_trust_bundle::TrustBundle::create(&roots, None)
        .unwrap()
        .unwrap();
    let second = crate::network_trust_bundle::TrustBundle::create(&roots, None)
        .unwrap()
        .unwrap();
    let path = first.pem.clone();
    assert_ne!(path, second.pem);
    assert!(std::fs::read_to_string(&path)
        .unwrap()
        .contains("BEGIN CERTIFICATE"));
    drop(first);
    assert!(!path.exists());
    assert!(second.pem.exists());
}
#[tokio::test]
async fn additional_roots_enable_only_the_correct_tls_chain_and_hostname() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    fn der(pem: &str) -> Vec<u8> {
        STANDARD
            .decode(
                pem.lines()
                    .filter(|l| !l.starts_with("-----"))
                    .collect::<String>(),
            )
            .unwrap()
    }
    async fn request(host: &str, roots: &[String]) -> bool {
        use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let config = rustls::ServerConfig::builder()
                .with_no_client_auth()
                .with_single_cert(
                    vec![CertificateDer::from(der(LEAF))],
                    PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(der(include_str!(
                        "../../tests/fixtures/network-trust/localhost-test-key.pem"
                    )))),
                )
                .unwrap();
            let (socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            socket
                .set_write_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut stream = rustls::StreamOwned::new(
                rustls::ServerConnection::new(std::sync::Arc::new(config)).unwrap(),
                socket,
            );
            let mut buffer = [0u8; 4096];
            if stream.read(&mut buffer).is_ok() {
                let _ = stream.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                );
            }
        });
        let client = client(
            reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(5)),
            roots,
        )
        .unwrap()
        .build()
        .unwrap();
        let success = client
            .get(format!("https://{host}:{port}/"))
            .send()
            .await
            .is_ok();
        server.join().unwrap();
        success
    }
    assert!(!request("localhost", &[]).await);
    assert!(request("localhost", &[root(CA)]).await);
    assert!(!request("127.0.0.1", &[root(CA)]).await);
    assert!(!request("localhost", &[root(OTHER)]).await);
}
