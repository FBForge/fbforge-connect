package org.fitconnect.integration.contract;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.time.Duration;
import java.util.*;
import javax.net.ssl.*;
import org.junit.jupiter.api.Test;

class NetworkTrustTest {
    static Path fixtures() {
        return Path.of("../../tests/fixtures/network-trust");
    }

    static X509Certificate certificate(String name) throws Exception {
        try (var input = Files.newInputStream(fixtures().resolve(name))) {
            return (X509Certificate)
                    CertificateFactory.getInstance("X.509").generateCertificate(input);
        }
    }

    static String fingerprint(X509Certificate certificate) throws Exception {
        return HexFormat.of()
                .withUpperCase()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
    }

    static int fork(String name, String pin, boolean verify) throws Exception {
        Path directory = Files.createTempDirectory("fbforge-java-trust-test-");
        try {
            Path pem = directory.resolve("roots.pem"), target = directory.resolve("java.p12");
            Files.copy(fixtures().resolve(name), pem);
            String javaExecutable =
                    Path.of(System.getProperty("java.home"), "bin", "java").toString();
            ProcessBuilder builder =
                    new ProcessBuilder(
                            javaExecutable,
                            "-cp",
                            System.getProperty("java.class.path"),
                            Probe.class.getName(),
                            Boolean.toString(verify));
            builder.environment().put("FBFORGE_TRUST_PEM", pem.toString());
            builder.environment().put("FBFORGE_TRUST_STORE", target.toString());
            builder.environment().put("FBFORGE_TRUST_FINGERPRINTS", pin);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD);
            Process child = builder.start();
            assertTrue(child.waitFor(20, java.util.concurrent.TimeUnit.SECONDS));
            int result = child.exitValue();
            assertFalse(Files.exists(target), "Public temporary trust store must be cleaned up");
            return result;
        } finally {
            try (var paths = Files.walk(directory)) {
                for (Path p : paths.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(p);
            }
        }
    }

    public static class Probe {
        public static void main(String[] args) throws Exception {
            try {
                NetworkTrust.initialize();
            } catch (SessionException e) {
                System.exit(5);
            }
            if (Boolean.parseBoolean(args[0])) {
                X509Certificate ca = certificate("ca.pem");
                var factory =
                        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                factory.init((KeyStore) null);
                boolean included = false;
                for (var manager : factory.getTrustManagers())
                    if (manager instanceof X509TrustManager trust) {
                        if (trust.getAcceptedIssuers().length < 20) System.exit(6);
                        included = Arrays.asList(trust.getAcceptedIssuers()).contains(ca);
                    }
                if (!included) System.exit(7);
                for (String api : List.of("v2", "v3"))
                    try (var loader =
                            new URLClassLoader(
                                    new URL[] {
                                        Path.of(
                                                        "../adapter-"
                                                                + api
                                                                + "/target/adapter-"
                                                                + api
                                                                + ".jar")
                                                .toUri()
                                                .toURL()
                                    },
                                    ClassLoader.getPlatformClassLoader())) {
                        var platform = loader.loadClass("okhttp3.internal.platform.Platform");
                        var current = platform.getMethod("get").invoke(null);
                        var trust =
                                (X509TrustManager)
                                        platform.getMethod("platformTrustManager").invoke(current);
                        if (!Arrays.asList(trust.getAcceptedIssuers()).contains(ca)) System.exit(8);
                    }
            }
        }
    }

    @Test
    void additionalRootReachesDefaultJavaTrustAndBothIsolatedSdkClients() throws Exception {
        assertEquals(0, fork("ca.pem", fingerprint(certificate("ca.pem")), true));
    }

    @Test
    void certificatePinMismatchAndServerCertificatesFailClosed() throws Exception {
        assertEquals(5, fork("ca.pem", "0".repeat(64), false));
        assertEquals(5, fork("localhost.pem", fingerprint(certificate("localhost.pem")), false));
        assertEquals(0, fork("expired-ca.pem", fingerprint(certificate("expired-ca.pem")), false));
    }

    static SSLContext context(Collection<X509Certificate> roots) throws Exception {
        var managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        managers.init(NetworkTrust.merged(roots));
        var context = SSLContext.getInstance("TLS");
        context.init(null, managers.getTrustManagers(), null);
        return context;
    }

    @Test
    void customTrustRetainsChainAndHostnameValidationOverRealTls() throws Exception {
        String pem =
                Files.readString(fixtures().resolve("localhost-test-key.pem"))
                        .replaceAll("-----[^\\n]+-----", "")
                        .replaceAll("\\s", "");
        var key =
                KeyFactory.getInstance("RSA")
                        .generatePrivate(
                                new java.security.spec.PKCS8EncodedKeySpec(
                                        Base64.getDecoder().decode(pem)));
        var store = KeyStore.getInstance("PKCS12");
        store.load(null, null);
        char[] password = "public-fixture".toCharArray();
        store.setKeyEntry(
                "localhost",
                key,
                password,
                new java.security.cert.Certificate[] {certificate("localhost.pem")});
        var keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, password);
        var serverContext = SSLContext.getInstance("TLS");
        serverContext.init(keys.getKeyManagers(), null, null);
        var server =
                com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new com.sun.net.httpserver.HttpsConfigurator(serverContext));
        server.createContext(
                "/",
                exchange -> {
                    byte[] data = "ok".getBytes();
                    exchange.sendResponseHeaders(200, data.length);
                    exchange.getResponseBody().write(data);
                    exchange.close();
                });
        server.start();
        try {
            int port = server.getAddress().getPort();
            for (String mode : List.of("default", "custom", "wrong-host", "unrelated")) {
                var roots =
                        mode.equals("default")
                                ? List.<X509Certificate>of()
                                : List.of(
                                        certificate(
                                                mode.equals("unrelated")
                                                        ? "unrelated-ca.pem"
                                                        : "ca.pem"));
                try (var client =
                        HttpClient.newBuilder()
                                .sslContext(context(roots))
                                .proxy(
                                        new java.net.ProxySelector() {
                                            public List<Proxy> select(URI uri) {
                                                return List.of(Proxy.NO_PROXY);
                                            }

                                            public void connectFailed(
                                                    URI u, SocketAddress a, IOException e) {}
                                        })
                                .connectTimeout(Duration.ofSeconds(3))
                                .build()) {
                    var request =
                            HttpRequest.newBuilder(
                                            URI.create(
                                                    "https://"
                                                            + (mode.equals("wrong-host")
                                                                    ? "127.0.0.1"
                                                                    : "localhost")
                                                            + ":"
                                                            + port
                                                            + "/"))
                                    .timeout(Duration.ofSeconds(5))
                                    .build();
                    if (mode.equals("custom"))
                        assertEquals(
                                200,
                                client.send(request, HttpResponse.BodyHandlers.discarding())
                                        .statusCode());
                    else
                        assertThrows(
                                IOException.class,
                                () -> client.send(request, HttpResponse.BodyHandlers.discarding()));
                }
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    void connectionFailuresExposeOnlyFixedActionableCodes() {
        assertEquals(
                "network_tls_error",
                NetworkFailure.code(
                        new IOException("outer", new SSLHandshakeException("private-data"))));
        assertEquals(
                "network_dns_error", NetworkFailure.code(new UnknownHostException("private-host")));
        assertEquals(
                "network_timeout", NetworkFailure.code(new HttpTimeoutException("private-url")));
        assertEquals(
                "network_connection_failed",
                NetworkFailure.code(new ConnectException("private-address")));
        assertEquals(
                "proxy_authentication_required",
                NetworkFailure.code(new IOException("HTTP/1.1 407 Proxy Authentication Required")));
        assertEquals("auth_unavailable", NetworkFailure.code(new IOException("private-data")));
    }
}
