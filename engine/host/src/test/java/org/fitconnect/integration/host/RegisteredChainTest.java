package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import org.opentest4j.AssertionFailedError;

/** Synthetic adapter regression only. Host SDK trust and revocation checks remain mandatory. */
public class RegisteredChainTest extends ReceiverTestSupport {
    @Test
    void windowsCodePageOutputDoesNotHideTheProcessExitStatus() throws Exception {
        var command =
                new ArrayList<>(
                        List.of(
                                javaTool("java"),
                                "-cp",
                                System.getProperty("java.class.path"),
                                EncodedOutputProbe.class.getName()));
        run(command);
        command.add("fail");
        var failure = assertThrows(AssertionFailedError.class, () -> run(command));
        assertEquals(7, failure.getActual().getValue());
        assertTrue(failure.getMessage().contains("Synthetic process output"));
    }

    public static class EncodedOutputProbe {
        public static void main(String[] args) throws IOException {
            System.out.write("Synthetic process output: ".getBytes(StandardCharsets.US_ASCII));
            // A Windows-1252 umlaut is deliberately invalid as a standalone UTF-8 byte.
            System.out.write(0xfc);
            System.out.flush();
            if (args.length > 0) System.exit(7);
        }
    }

    @Test
    void issuedRegistrationAcceptsALocalLeafExportAndRemainsUsableInBothAdapters()
            throws Exception {
        char[] password = "synthetic-chain-password".toCharArray();
        var store = KeyStore.getInstance("PKCS12");
        store.load(null, password);
        var leaf =
                CertificateFactory.getInstance("X.509")
                        .generateCertificate(
                                new ByteArrayInputStream(
                                        Base64.getDecoder()
                                                .decode(
                                                        StrictJson.object(registration, 32768)
                                                                .getAsJsonArray("x5c")
                                                                .get(0)
                                                                .getAsString())));
        store.setKeyEntry(
                "leaf", privateKey, password, new java.security.cert.Certificate[] {leaf});
        Path material = workspace.resolve("leaf.p12"),
                root = workspace.resolve("root.p12"),
                csr = workspace.resolve("leaf.csr"),
                issued = workspace.resolve("issued.cer");
        try (var out = Files.newOutputStream(material)) {
            store.store(out, password);
        }
        keytool(
                "-genkeypair",
                "-alias",
                "root",
                "-keyalg",
                "RSA",
                "-keysize",
                "4096",
                "-dname",
                "CN=Synthetic Local Root",
                "-ext",
                "BC=ca:true",
                "-ext",
                "KU=keyCertSign,cRLSign",
                "-validity",
                "30",
                "-storetype",
                "PKCS12",
                "-keystore",
                root.toString(),
                "-storepass",
                new String(password));
        keytool(
                "-certreq",
                "-alias",
                "leaf",
                "-keystore",
                material.toString(),
                "-storepass",
                new String(password),
                "-file",
                csr.toString());
        keytool(
                "-gencert",
                "-alias",
                "root",
                "-keystore",
                root.toString(),
                "-storepass",
                new String(password),
                "-infile",
                csr.toString(),
                "-outfile",
                issued.toString(),
                "-validity",
                "10",
                "-ext",
                "BC=ca:false",
                "-ext",
                "KU=digitalSignature,keyEncipherment");
        var ca = KeyStore.getInstance("PKCS12");
        try (var in = Files.newInputStream(root)) {
            ca.load(in, password);
        }
        java.security.cert.Certificate issuedCertificate;
        try (var in = Files.newInputStream(issued)) {
            issuedCertificate = CertificateFactory.getInstance("X.509").generateCertificate(in);
        }
        store.setKeyEntry(
                "leaf",
                privateKey,
                password,
                new java.security.cert.Certificate[] {
                    issuedCertificate, ca.getCertificate("root")
                });
        try (var out = Files.newOutputStream(material)) {
            store.store(out, password);
        }
        run(
                List.of(
                        javaTool("java"),
                        "-Dfbforge.environment=STAGE",
                        "-cp",
                        System.getProperty("java.class.path"),
                        RegisteredChainTest.class.getName(),
                        material.toString()));
    }

    private static String javaTool(String name) {
        return Path.of(
                        System.getProperty("java.home"),
                        "bin",
                        name + (System.getProperty("os.name").startsWith("Windows") ? ".exe" : ""))
                .toString();
    }

    private static void keytool(String... args) throws Exception {
        var command = new ArrayList<String>();
        command.add(javaTool("keytool"));
        command.addAll(List.of(args));
        run(command);
    }

    private static void run(List<String> command) throws Exception {
        Path output = Files.createTempFile("fbforge-synthetic-chain-", ".log");
        var process =
                new ProcessBuilder(command)
                        .redirectErrorStream(true)
                        .redirectOutput(output.toFile())
                        .start();
        try {
            assertTrue(
                    process.waitFor(90, TimeUnit.SECONDS), "Synthetic certificate probe timed out");
            // Native Windows code pages may produce invalid UTF-8 in diagnostic output.
            // Replacement decoding keeps those bytes from masking the actual exit status.
            assertEquals(
                    0,
                    process.exitValue(),
                    new String(Files.readAllBytes(output), StandardCharsets.UTF_8));
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
                process.waitFor();
            }
            Files.deleteIfExists(output);
        }
    }

    public static void main(String[] args) throws Exception {
        if (IntegrationEnvironment.current() != IntegrationEnvironment.STAGE)
            throw new AssertionError("Expected isolated STAGE policy");
        var envelope = new JsonObject();
        envelope.addProperty("format", "pkcs12");
        envelope.addProperty("password", "synthetic-chain-password");
        envelope.addProperty(
                "content",
                Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of(args[0]))));
        var full =
                StrictJson.object(
                        CertifiedKeyMaterial.normalizeRegistered(envelope.toString(), "auto"),
                        32768);
        assertEquals(2, full.getAsJsonArray("x5c").size());
        for (String api : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of("../adapter-" + api + "/target/adapter-" + api + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            RegisteredChainTest.class.getClassLoader())) {
                var type = loader.loadClass("org.fitconnect.integration." + api + ".PrivateKeys");
                var constructor = type.getDeclaredConstructor();
                constructor.setAccessible(true);
                var keys = constructor.newInstance();
                var add =
                        type.getDeclaredMethod(
                                api.equals("v2") ? "add" : "importKey",
                                String.class,
                                String.class,
                                String.class,
                                List.class);
                add.setAccessible(true);
                for (String purpose : List.of("decrypt", "sign")) {
                    var publicKey = new JsonObject();
                    for (String field : List.of("kty", "n", "e", "x5c"))
                        publicKey.add(field, full.get(field).deepCopy());
                    publicKey.addProperty("kid", "registered-" + purpose);
                    publicKey.addProperty(
                            "alg", purpose.equals("decrypt") ? "RSA-OAEP-256" : "PS512");
                    var publicOps = new JsonArray();
                    publicOps.add(purpose.equals("decrypt") ? "wrapKey" : "verify");
                    publicKey.add("key_ops", publicOps);
                    var local = full.deepCopy();
                    local.addProperty("kid", "different-local-export-label");
                    local.addProperty("alg", publicKey.get("alg").getAsString());
                    var localOps = new JsonArray();
                    localOps.add(purpose.equals("decrypt") ? "unwrapKey" : "sign");
                    local.add("key_ops", localOps);
                    var localChain = new JsonArray();
                    localChain.add(full.getAsJsonArray("x5c").get(0).deepCopy());
                    local.add("x5c", localChain);
                    var reference =
                            (KeyReference)
                                    add.invoke(
                                            keys,
                                            DEST,
                                            purpose,
                                            local.toString(),
                                            List.of(publicKey.toString()));
                    assertEquals("registered-" + purpose, reference.kid());
                }
                var decrypt = type.getDeclaredMethod("decryptionKeys", String.class);
                decrypt.setAccessible(true);
                assertEquals(1, ((List<?>) decrypt.invoke(keys, DEST)).size());
                var sign = type.getDeclaredMethod("signingKey", String.class, String.class);
                sign.setAccessible(true);
                assertNotNull(sign.invoke(keys, DEST, "registered-sign"));
            }
    }
}
