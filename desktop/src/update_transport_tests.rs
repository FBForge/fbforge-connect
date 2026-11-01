use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener},
    thread,
};
fn fixture_der(field: &str) -> Vec<u8> {
    let value: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/update-transport.json")).unwrap();
    STANDARD.decode(value[field].as_str().unwrap()).unwrap()
}
fn server(body: Vec<u8>, stall: bool) -> (SocketAddr, thread::JoinHandle<()>) {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let cert = rustls::pki_types::CertificateDer::from(fixture_der("certificate"));
    let key = rustls::pki_types::PrivateKeyDer::Pkcs8(rustls::pki_types::PrivatePkcs8KeyDer::from(
        fixture_der("privateKey"),
    ));
    let config = std::sync::Arc::new(
        rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert], key)
            .unwrap(),
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let task = thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut stream =
            rustls::StreamOwned::new(rustls::ServerConnection::new(config).unwrap(), socket);
        let mut header = Vec::new();
        let mut byte = [0];
        while header.len() < 8192 {
            if stream.read_exact(&mut byte).is_err() {
                return;
            }
            header.push(byte[0]);
            if header.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        if stall {
            thread::sleep(Duration::from_millis(500));
        }
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(&body);
        let _ = stream.flush();
    });
    (addr, task)
}
fn test_client(addr: SocketAddr) -> Client {
    Client::builder()
        .https_only(true)
        .no_proxy()
        .add_root_certificate(reqwest::Certificate::from_der(&fixture_der("ca")).unwrap())
        .resolve("github.com", addr)
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap()
}
#[tokio::test]
async fn real_https_download_validates_the_manifest_and_version_bound_signature_before_installation(
) {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/update-signature.json")).unwrap();
    let url =
        crate::update_policy::package_url(&crate::update_policy::stable_version("0.4.0").unwrap());
    let document = serde_json::json!({"version":"0.4.0","notes":"Fiktiver Test","platforms":{"windows-x86_64":{"url":url,"signature":fixture["signature"]}}});
    let (addr, server) = server(serde_json::to_vec(&document).unwrap(), false);
    let manifest = read_with(
        test_client(addr),
        ENDPOINT,
        MAX_MANIFEST,
        true,
        &AtomicBool::new(false),
        |_, _| {},
    )
    .await
    .unwrap();
    server.join().unwrap();
    let value = serde_json::from_slice(&manifest).unwrap();
    assert_eq!(crate::update_policy::manifest(&value, "0.3.0"), Ok(true));
    let (addr, server) = self::server(fixture["data"].as_str().unwrap().as_bytes().to_vec(), false);
    let bytes = read_with(
        test_client(addr),
        &url,
        MAX_PACKAGE,
        false,
        &AtomicBool::new(false),
        |_, _| {},
    )
    .await
    .unwrap();
    server.join().unwrap();
    assert_eq!(
        crate::update_policy::verify(
            &bytes,
            fixture["signature"].as_str().unwrap(),
            fixture["publicKey"].as_str().unwrap(),
            "0.4.0"
        ),
        Ok(())
    );
    assert!(crate::update_policy::verify(
        &bytes,
        fixture["signature"].as_str().unwrap(),
        fixture["publicKey"].as_str().unwrap(),
        "0.5.0"
    )
    .is_err());
    // Fixture bytes deliberately cannot execute. Installer/upgrade acceptance uses the real Windows candidate separately.
}
#[tokio::test]
async fn a_real_https_peer_stalling_response_headers_can_be_cancelled_promptly() {
    let (addr, server) = server(vec![], true);
    let cancelled = AtomicBool::new(false);
    let cancel = async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        cancelled.store(true, std::sync::atomic::Ordering::Release);
    };
    let read = tokio::time::timeout(
        Duration::from_millis(350),
        read_with(
            test_client(addr),
            ENDPOINT,
            MAX_MANIFEST,
            true,
            &cancelled,
            |_, _| {},
        ),
    );
    let (_, result) = tokio::join!(cancel, read);
    assert_eq!(result.unwrap(), Err("update_cancelled"));
    server.join().unwrap();
}
