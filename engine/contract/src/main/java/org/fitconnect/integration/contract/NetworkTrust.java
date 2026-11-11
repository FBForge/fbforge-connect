package org.fitconnect.integration.contract;

import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import javax.net.ssl.*;

/** Additional public CA roots, scoped to this owned engine process. Never disables TLS checks. */
public final class NetworkTrust {
    private NetworkTrust() {}

    public static void initialize() {
        String source = System.getenv("FBFORGE_TRUST_PEM");
        if (source == null) return;
        try {
            Path pem = Path.of(source), target = Path.of(required("FBFORGE_TRUST_STORE"));
            if (!Objects.equals(pem.getParent(), target.getParent())) throw new IOException();
            byte[] bytes;
            try (var in = Files.newInputStream(pem)) {
                bytes = in.readNBytes(400 * 1024 + 1);
            }
            if (bytes.length > 400 * 1024) throw new IOException();
            var expected =
                    new HashSet<>(List.of(required("FBFORGE_TRUST_FINGERPRINTS").split(",", -1)));
            if (expected.isEmpty()
                    || expected.size() > 8
                    || expected.stream().anyMatch(s -> !s.matches("[A-F0-9]{64}")))
                throw new IOException();
            var certificates =
                    CertificateFactory.getInstance("X.509")
                            .generateCertificates(new ByteArrayInputStream(bytes));
            if (certificates.size() != expected.size()) throw new IOException();
            var seen = new HashSet<String>();
            var additional = new ArrayList<X509Certificate>();
            for (var value : certificates) {
                var cert = (X509Certificate) value;
                String fingerprint =
                        HexFormat.of()
                                .withUpperCase()
                                .formatHex(
                                        MessageDigest.getInstance("SHA-256")
                                                .digest(cert.getEncoded()));
                boolean[] usage = cert.getKeyUsage();
                if (!expected.contains(fingerprint)
                        || !seen.add(fingerprint)
                        || cert.getBasicConstraints() < 0
                        || (usage != null && (usage.length <= 5 || !usage[5])))
                    throw new IOException();
                try {
                    cert.checkValidity();
                    additional.add(cert);
                } catch (CertificateExpiredException | CertificateNotYetValidException ignored) {
                    /* Inactive additional roots never grant trust. */
                }
            }
            KeyStore store = merged(additional);
            char[] password = "fbforge-public-ca-store".toCharArray();
            try (var output =
                    Files.newOutputStream(
                            target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                store.store(output, password);
            }
            Runtime.getRuntime()
                    .addShutdownHook(
                            new Thread(
                                    () -> {
                                        try {
                                            Files.deleteIfExists(target);
                                        } catch (IOException ignored) {
                                        }
                                    },
                                    "public-ca-cleanup"));
            System.setProperty("javax.net.ssl.trustStore", target.toString());
            System.setProperty("javax.net.ssl.trustStoreType", "PKCS12");
            System.setProperty("javax.net.ssl.trustStorePassword", new String(password));
            var managers =
                    TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            managers.init(store);
            var context = SSLContext.getInstance("TLS");
            context.init(null, managers.getTrustManagers(), null);
            SSLContext.setDefault(context);
            HttpsURLConnection.setDefaultSSLSocketFactory(context.getSocketFactory());
            Arrays.fill(password, '\0');
        } catch (Exception e) {
            throw new SessionException("network_trust_unavailable");
        }
    }

    static KeyStore merged(Collection<X509Certificate> additional) throws Exception {
        var defaults = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        defaults.init((KeyStore) null);
        var store = KeyStore.getInstance("PKCS12");
        store.load(null, null);
        int index = 0;
        for (TrustManager manager : defaults.getTrustManagers())
            if (manager instanceof X509TrustManager trust)
                for (X509Certificate cert : trust.getAcceptedIssuers())
                    store.setCertificateEntry("default-" + index++, cert);
        for (X509Certificate cert : additional)
            store.setCertificateEntry("additional-" + index++, cert);
        return store;
    }

    private static String required(String name) throws IOException {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IOException();
        return value;
    }
}
