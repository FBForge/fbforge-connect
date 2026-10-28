package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.io.*;
import java.math.BigInteger;
import java.nio.file.Path;
import java.security.*;
import java.security.cert.*;
import java.security.spec.RSAPrivateCrtKeySpec;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class CertifiedKeyMaterialTest {
    private static GeneratedTestKey synthetic;
    private static PrivateKey privateKey;
    private static X509Certificate certificate;

    @BeforeAll
    static void material() throws Exception {
        try (var adapters =
                        new AdapterRegistry(
                                Path.of("../adapter-v2/target/adapter-v2.jar"),
                                Path.of("../adapter-v3/target/adapter-v3.jar"));
                var session =
                        adapters.openSession(
                                ApiVersion.V3,
                                "synthetic",
                                "synthetic",
                                (u, b) -> "{\"access_token\":\"synthetic\",\"expires_in\":3600}")) {
            synthetic =
                    adapters.withSession(
                            ApiVersion.V3, session, value -> value.generateTestKey("decrypt"));
        }
        var key = StrictJson.object(synthetic.privateJwk(), 32768);
        privateKey =
                KeyFactory.getInstance("RSA")
                        .generatePrivate(
                                new RSAPrivateCrtKeySpec(
                                        number(key, "n"),
                                        number(key, "e"),
                                        number(key, "d"),
                                        number(key, "p"),
                                        number(key, "q"),
                                        number(key, "dp"),
                                        number(key, "dq"),
                                        number(key, "qi")));
        byte[] der =
                Base64.getDecoder()
                        .decode(
                                StrictJson.object(synthetic.publicJwk(), 32768)
                                        .getAsJsonArray("x5c")
                                        .get(0)
                                        .getAsString());
        certificate =
                (X509Certificate)
                        CertificateFactory.getInstance("X.509")
                                .generateCertificate(new ByteArrayInputStream(der));
    }

    @Test
    void pkcs12KeepsTheCertificateAndKeyPairAndDoesNotRetainThePassword() throws Exception {
        var source = pkcs12(false);
        var result = CertifiedKeyMaterial.parse(source, "decrypt");
        var publicJwk = StrictJson.object(result.publicJwk(), 32768);
        var privateJwk = StrictJson.object(result.privateJwk(), 32768);
        assertEquals(StrictJson.object(synthetic.publicJwk(), 32768).get("n"), publicJwk.get("n"));
        assertEquals(
                StrictJson.object(synthetic.publicJwk(), 32768).get("x5c"), publicJwk.get("x5c"));
        assertEquals(publicJwk.get("kid"), privateJwk.get("kid"));
        assertEquals("wrapKey", publicJwk.getAsJsonArray("key_ops").get(0).getAsString());
        assertEquals("unwrapKey", privateJwk.getAsJsonArray("key_ops").get(0).getAsString());
        assertFalse(result.toString().contains("synthetic-container-password"));
        assertFalse(publicJwk.has("d"));
        var normalized =
                StrictJson.object(
                        CertifiedKeyMaterial.normalizeRegistered(source.toString(), "decrypt"),
                        32768);
        assertFalse(
                normalized.has("kid"), "The SDK must adopt the authenticated registration's kid");
        assertTrue(normalized.has("d"));
    }

    @Test
    void wrongPasswordAmbiguousContainersAndMissingChainsFailWithoutEchoingInput()
            throws Exception {
        var wrongPassword = pkcs12(false);
        wrongPassword.addProperty("password", "incorrect-synthetic-password");
        for (var source :
                List.of(
                        wrongPassword,
                        pkcs12(true),
                        StrictJson.object("{\"format\":\"jwk\",\"content\":\"{}\"}", 32768))) {
            var failure =
                    assertThrows(
                            SessionException.class,
                            () -> CertifiedKeyMaterial.parse(source, "decrypt"));
            assertEquals("key_rejected", failure.code());
            assertFalse(failure.toString().contains("password"));
        }
    }

    @Test
    void privateJwkRequiresAChainAndMatchingAlgorithm() {
        var key = StrictJson.object(synthetic.privateJwk(), 32768);
        key.add("x5c", StrictJson.object(synthetic.publicJwk(), 32768).get("x5c"));
        var source = new JsonObject();
        source.addProperty("format", "jwk");
        source.addProperty("content", key.toString());
        assertNotNull(CertifiedKeyMaterial.parse(source, "decrypt"));
        assertThrows(SessionException.class, () -> CertifiedKeyMaterial.parse(source, "sign"));
        key.remove("x5c");
        source.addProperty("content", key.toString());
        assertThrows(SessionException.class, () -> CertifiedKeyMaterial.parse(source, "decrypt"));
    }

    private static JsonObject pkcs12(boolean ambiguous) throws Exception {
        char[] password = "synthetic-container-password".toCharArray();
        var store = KeyStore.getInstance("PKCS12");
        store.load(null, password);
        store.setKeyEntry(
                "synthetic",
                privateKey,
                password,
                new java.security.cert.Certificate[] {certificate});
        if (ambiguous)
            store.setKeyEntry(
                    "ambiguous",
                    privateKey,
                    password,
                    new java.security.cert.Certificate[] {certificate});
        var out = new ByteArrayOutputStream();
        store.store(out, password);
        var source = new JsonObject();
        source.addProperty("format", "pkcs12");
        source.addProperty("content", Base64.getEncoder().encodeToString(out.toByteArray()));
        source.addProperty("password", new String(password));
        Arrays.fill(password, '\0');
        return source;
    }

    private static BigInteger number(JsonObject key, String field) {
        return new BigInteger(1, Base64.getUrlDecoder().decode(key.get(field).getAsString()));
    }
}
