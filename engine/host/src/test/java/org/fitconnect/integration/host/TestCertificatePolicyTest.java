package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.*;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class TestCertificatePolicyTest {
    @TempDir static Path directory;
    private static X509Certificate valid, ca, weak, signingOnly, issued;

    @BeforeAll
    static void certificates() throws Exception {
        valid = create("valid", 4096, "bc=ca:false", "ku=digitalSignature,keyEncipherment");
        ca = create("ca", 4096, "bc=ca:true", "ku=keyCertSign,cRLSign");
        weak = create("weak", 2048, "bc=ca:false", "ku=digitalSignature,keyEncipherment");
        signingOnly = create("signing", 4096, "bc=ca:false", "ku=digitalSignature");
        // A real CA-issued leaf, with only the leaf in x5c, must still be rejected.
        run(
                "-certreq",
                "-alias",
                "valid",
                "-keystore",
                store("valid"),
                "-storepass",
                "synthetic-test-password",
                "-file",
                directory.resolve("leaf.csr").toString());
        run(
                "-gencert",
                "-alias",
                "ca",
                "-keystore",
                store("ca"),
                "-storepass",
                "synthetic-test-password",
                "-infile",
                directory.resolve("leaf.csr").toString(),
                "-outfile",
                directory.resolve("issued.der").toString(),
                "-validity",
                "365",
                "-sigalg",
                "SHA256withRSA",
                "-ext",
                "bc=ca:false");
        try (InputStream in = Files.newInputStream(directory.resolve("issued.der"))) {
            issued =
                    (X509Certificate)
                            java.security.cert.CertificateFactory.getInstance("X.509")
                                    .generateCertificate(in);
        }
    }

    @Test
    void acceptsMatchingSelfSignedKeysForBothPurposes() throws Exception {
        for (var purpose : TestCertificatePolicy.Purpose.values()) {
            var accepted = TestCertificatePolicy.validate(jwk(valid, purpose), purpose, now(valid));
            assertEquals("synthetic-key", accepted.kid());
            assertEquals(purpose, accepted.purpose());
            assertEquals(valid.getPublicKey(), accepted.publicKey());
            assertEquals(valid.getNotAfter().toInstant(), accepted.expiresAt());
            assertEquals(64, accepted.certificateSha256().length());
        }
    }

    @Test
    void rejectsMissingMalformedChainedAndConcatenatedCertificates() throws Exception {
        var key = jwk(valid, TestCertificatePolicy.Purpose.ENCRYPTION);
        for (JsonElement chain :
                List.of(
                        JsonNull.INSTANCE,
                        new JsonArray(),
                        new JsonPrimitive("not-an-array"),
                        JsonParser.parseString("[\"invalid\"]"),
                        JsonParser.parseString("[true]"))) {
            var changed = key.deepCopy();
            changed.add("x5c", chain);
            reject(changed);
        }
        var missing = key.deepCopy();
        missing.remove("x5c");
        reject(missing);
        var chain = key.deepCopy();
        chain.getAsJsonArray("x5c").add(key.getAsJsonArray("x5c").get(0));
        reject(chain);
        byte[] der = valid.getEncoded();
        var concatenated = key.deepCopy();
        var bytes = new byte[der.length * 2];
        System.arraycopy(der, 0, bytes, 0, der.length);
        System.arraycopy(der, 0, bytes, der.length, der.length);
        concatenated.add("x5c", array(Base64.getEncoder().encodeToString(bytes)));
        reject(concatenated);
        var oversized = key.deepCopy();
        oversized.add("x5c", array("A".repeat(49153)));
        reject(oversized);
    }

    @Test
    void rejectsCaIssuedCaAndWeakKeys() throws Exception {
        for (var certificate : List.of(ca, issued, weak))
            reject(jwk(certificate, TestCertificatePolicy.Purpose.ENCRYPTION));
    }

    @Test
    void verifiesSelfSignatureRatherThanOnlyComparingNames() throws Exception {
        var key = jwk(valid, TestCertificatePolicy.Purpose.ENCRYPTION);
        byte[] tampered = valid.getEncoded();
        tampered[tampered.length - 1] ^= 1;
        key.add("x5c", array(Base64.getEncoder().encodeToString(tampered)));
        reject(key);
    }

    @Test
    void rejectsExpiredAndNotYetValidCertificates() throws Exception {
        var key = jwk(valid, TestCertificatePolicy.Purpose.ENCRYPTION);
        for (var at :
                List.of(
                        valid.getNotBefore().toInstant().minusSeconds(1),
                        valid.getNotAfter().toInstant().plusSeconds(1)))
            assertThrows(
                    TestCertificatePolicy.Rejected.class,
                    () ->
                            TestCertificatePolicy.validate(
                                    key, TestCertificatePolicy.Purpose.ENCRYPTION, at));
    }

    @Test
    void rejectsPublicKeyMismatchAndNonCanonicalRsaParameters() throws Exception {
        var key = jwk(valid, TestCertificatePolicy.Purpose.ENCRYPTION);
        var other = jwk(signingOnly, TestCertificatePolicy.Purpose.ENCRYPTION);
        for (var n :
                List.of(
                        other.get("n").getAsString(),
                        "AA" + key.get("n").getAsString(),
                        "%%%",
                        "",
                        "A".repeat(2000))) {
            var changed = key.deepCopy();
            changed.addProperty("n", n);
            reject(changed);
        }
        var changed = key.deepCopy();
        changed.addProperty("e", "Aw");
        reject(changed);
    }

    @Test
    void rejectsWrongPurposePrivateMaterialAndUntrustedValidationFlags() throws Exception {
        var key = jwk(valid, TestCertificatePolicy.Purpose.ENCRYPTION);
        for (var field : List.of("d", "p", "q", "dp", "dq", "qi", "oth", "k")) {
            var changed = key.deepCopy();
            changed.add(field, JsonNull.INSTANCE);
            reject(changed);
        }
        for (var field : List.of("kty", "kid", "alg", "e", "n")) {
            var changed = key.deepCopy();
            changed.add(field, new JsonPrimitive(true));
            reject(changed);
        }
        for (var alg : List.of("PS512", "RSA-OAEP", "none")) {
            var changed = key.deepCopy();
            changed.addProperty("alg", alg);
            reject(changed);
        }
        for (var ops :
                List.of(
                        array("decrypt"),
                        array("wrapKey", "verify"),
                        array("wrapKey", "wrapKey"),
                        new JsonArray())) {
            var changed = key.deepCopy();
            changed.add("key_ops", ops);
            reject(changed);
        }
        var changed = key.deepCopy();
        changed.addProperty("use", "sig");
        reject(changed);
        changed = key.deepCopy();
        changed.remove("x5c");
        changed.addProperty("testCertificateValid", true);
        reject(changed);
        var missingId = key.deepCopy();
        missingId.remove("kid");
        reject(missingId);
    }

    @Test
    void enforcesCertificateKeyUsageWhenPresent() throws Exception {
        reject(jwk(signingOnly, TestCertificatePolicy.Purpose.ENCRYPTION));
        assertNotNull(
                TestCertificatePolicy.validate(
                        jwk(signingOnly, TestCertificatePolicy.Purpose.SIGNING),
                        TestCertificatePolicy.Purpose.SIGNING,
                        now(signingOnly)));
    }

    private static void reject(JsonObject key) {
        var error =
                assertThrows(
                        TestCertificatePolicy.Rejected.class,
                        () ->
                                TestCertificatePolicy.validate(
                                        key, TestCertificatePolicy.Purpose.ENCRYPTION, now(valid)));
        assertEquals("test_certificate_required", error.getMessage());
        assertNull(error.getCause());
    }

    private static Instant now(X509Certificate certificate) {
        return certificate.getNotBefore().toInstant().plusSeconds(60);
    }

    private static JsonArray array(String... values) {
        var result = new JsonArray();
        for (var value : values) result.add(value);
        return result;
    }

    private static String unsigned(BigInteger value) {
        byte[] bytes = value.toByteArray();
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes[0] == 0 ? Arrays.copyOfRange(bytes, 1, bytes.length) : bytes);
    }

    private static JsonObject jwk(
            X509Certificate certificate, TestCertificatePolicy.Purpose purpose) throws Exception {
        var rsa = (RSAPublicKey) certificate.getPublicKey();
        var result = new JsonObject();
        result.addProperty("kty", "RSA");
        result.addProperty("kid", "synthetic-key");
        result.addProperty(
                "alg",
                purpose == TestCertificatePolicy.Purpose.ENCRYPTION ? "RSA-OAEP-256" : "PS512");
        result.add(
                "key_ops",
                array(purpose == TestCertificatePolicy.Purpose.ENCRYPTION ? "wrapKey" : "verify"));
        result.addProperty("n", unsigned(rsa.getModulus()));
        result.addProperty("e", unsigned(rsa.getPublicExponent()));
        result.add("x5c", array(Base64.getEncoder().encodeToString(certificate.getEncoded())));
        return result;
    }

    private static String store(String alias) {
        return directory.resolve(alias + ".p12").toString();
    }

    private static X509Certificate create(String alias, int bits, String... extensions)
            throws Exception {
        var arguments =
                new ArrayList<>(
                        List.of(
                                "-genkeypair",
                                "-alias",
                                alias,
                                "-keyalg",
                                "RSA",
                                "-keysize",
                                String.valueOf(bits),
                                "-sigalg",
                                "SHA256withRSA",
                                "-dname",
                                "CN=Synthetic Integration Test " + alias,
                                "-validity",
                                "365",
                                "-storetype",
                                "PKCS12",
                                "-keystore",
                                store(alias),
                                "-storepass",
                                "synthetic-test-password"));
        for (var extension : extensions) arguments.addAll(List.of("-ext", extension));
        run(arguments.toArray(String[]::new));
        var keys = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(Path.of(store(alias)))) {
            keys.load(in, "synthetic-test-password".toCharArray());
        }
        return (X509Certificate) keys.getCertificate(alias);
    }

    private static void run(String... arguments) throws Exception {
        var executable =
                Path.of(
                        System.getProperty("java.home"),
                        "bin",
                        System.getProperty("os.name").startsWith("Windows")
                                ? "keytool.exe"
                                : "keytool");
        var command = new ArrayList<String>();
        command.add(executable.toString());
        command.addAll(List.of(arguments));
        var output = directory.resolve("keytool-output.txt");
        var process =
                new ProcessBuilder(command)
                        .redirectErrorStream(true)
                        .redirectOutput(output.toFile())
                        .start();
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            fail("Synthetic keytool fixture timed out");
        }
        assertEquals(
                0,
                process.exitValue(),
                () -> "Synthetic keytool fixture failed. Inspect " + output);
    }
}
