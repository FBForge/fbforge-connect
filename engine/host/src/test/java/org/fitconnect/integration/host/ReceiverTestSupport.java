package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.*;
import java.util.*;
import java.util.zip.Deflater;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

abstract class ReceiverTestSupport {
    static final String DEST = "11111111-1111-4111-8111-111111111111";
    static final String SUB = "22222222-2222-4222-8222-222222222222";
    static final String CASE = "33333333-3333-4333-8333-333333333333";
    static String pem, registration;
    static RSAPrivateCrtKey privateKey;
    @TempDir Path workspace;

    @BeforeAll
    static void key(@TempDir Path directory) throws Exception {
        if (privateKey != null) return;
        NativeResourceTest.syntheticKey(directory);
        var store = KeyStore.getInstance("PKCS12");
        try (var stream = Files.newInputStream(directory.resolve("synthetic.p12"))) {
            store.load(stream, "synthetic-test-only".toCharArray());
        }
        var key = (RSAPrivateCrtKey) store.getKey("synthetic", "synthetic-test-only".toCharArray());
        privateKey = key;
        pem =
                "-----BEGIN PRIVATE KEY-----\n"
                        + Base64.getEncoder().encodeToString(key.getEncoded())
                        + "\n-----END PRIVATE KEY-----";
        var jwk = new JsonObject();
        jwk.addProperty("kty", "RSA");
        jwk.addProperty("kid", "synthetic-decrypt");
        jwk.addProperty("alg", "RSA-OAEP-256");
        jwk.addProperty("use", "enc");
        for (var entry : Map.of("n", key.getModulus(), "e", key.getPublicExponent()).entrySet()) {
            byte[] bytes = entry.getValue().toByteArray();
            jwk.addProperty(
                    entry.getKey(),
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(
                                    bytes[0] == 0
                                            ? Arrays.copyOfRange(bytes, 1, bytes.length)
                                            : bytes));
        }
        var ops = new JsonArray();
        ops.add("wrapKey");
        jwk.add("key_ops", ops);
        var certs = new JsonArray();
        certs.add(
                Base64.getEncoder().encodeToString(store.getCertificate("synthetic").getEncoded()));
        jwk.add("x5c", certs);
        TestCertificatePolicy.validate(
                jwk, TestCertificatePolicy.Purpose.ENCRYPTION, java.time.Instant.now());
        registration = jwk.toString();
    }

    static AdapterRegistry registry() {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    static AuthenticatedSession open(AdapterRegistry registry, ApiVersion api) throws Exception {
        return registry.openSession(
                api,
                "id",
                "secret",
                (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                (u, h) -> {
                    throw new AssertionError("Receiver must use its own scoped transport");
                });
    }

    static String b64Standard(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    static byte[] openReply(String jwe) throws Exception {
        String[] parts = jwe.split("\\.", -1);
        assertEquals(5, parts.length);
        var decoder = Base64.getUrlDecoder();
        var header =
                JsonParser.parseString(new String(decoder.decode(parts[0]), StandardCharsets.UTF_8))
                        .getAsJsonObject();
        assertEquals("synthetic-reply", header.get("kid").getAsString());
        assertEquals("RSA-OAEP-256", header.get("alg").getAsString());
        assertEquals("A256GCM", header.get("enc").getAsString());
        var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(
                Cipher.DECRYPT_MODE,
                privateKey,
                new OAEPParameterSpec(
                        "SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        byte[] key = rsa.doFinal(decoder.decode(parts[1]));
        try {
            var aes = Cipher.getInstance("AES/GCM/NoPadding");
            aes.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, decoder.decode(parts[2])));
            aes.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
            byte[] encrypted = decoder.decode(parts[3]),
                    tag = decoder.decode(parts[4]),
                    combined = Arrays.copyOf(encrypted, encrypted.length + tag.length);
            System.arraycopy(tag, 0, combined, encrypted.length, tag.length);
            return aes.doFinal(combined);
        } finally {
            Arrays.fill(key, (byte) 0);
        }
    }

    static void checkedReceiptUnchecked(String body) {
        try {
            checkedReceipt(
                    new SignedReceipt(
                            UUID.fromString(DEST),
                            UUID.fromString(SUB),
                            UUID.fromString(CASE),
                            "reject",
                            "synthetic-sign",
                            body),
                    "reject");
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
    }

    static String signingRegistration(String kid) {
        var key = JsonParser.parseString(registration).getAsJsonObject();
        key.addProperty("kid", kid);
        key.addProperty("alg", "PS512");
        key.addProperty("use", "sig");
        var ops = new JsonArray();
        ops.add("verify");
        key.add("key_ops", ops);
        return key.toString();
    }

    static JsonObject checkedReceipt(SignedReceipt receipt, String action) throws Exception {
        assertEquals(UUID.fromString(DEST), receipt.destinationId());
        assertEquals(UUID.fromString(SUB), receipt.submissionId());
        assertEquals(UUID.fromString(CASE), receipt.caseId());
        assertEquals(action, receipt.action());
        assertEquals("synthetic-sign", receipt.signingKid());
        String[] parts = receipt.jwt().split("\\.");
        assertEquals(3, parts.length);
        var header =
                JsonParser.parseString(
                                new String(
                                        Base64.getUrlDecoder().decode(parts[0]),
                                        StandardCharsets.UTF_8))
                        .getAsJsonObject();
        assertEquals(Set.of("alg", "typ", "kid"), header.keySet());
        assertEquals("PS512", header.get("alg").getAsString());
        assertEquals("secevent+jwt", header.get("typ").getAsString());
        assertEquals(receipt.signingKid(), header.get("kid").getAsString());
        var verifier = Signature.getInstance("RSASSA-PSS");
        verifier.setParameter(
                new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        verifier.initVerify(
                KeyFactory.getInstance("RSA")
                        .generatePublic(
                                new RSAPublicKeySpec(
                                        privateKey.getModulus(), privateKey.getPublicExponent())));
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(verifier.verify(Base64.getUrlDecoder().decode(parts[2])));
        var claims =
                JsonParser.parseString(
                                new String(
                                        Base64.getUrlDecoder().decode(parts[1]),
                                        StandardCharsets.UTF_8))
                        .getAsJsonObject();
        assertEquals(DEST, claims.get("iss").getAsString());
        assertEquals("submission:" + SUB, claims.get("sub").getAsString());
        assertEquals("case:" + CASE, claims.get("txn").getAsString());
        UUID.fromString(claims.get("jti").getAsString());
        assertTrue(
                Math.abs(java.time.Instant.now().getEpochSecond() - claims.get("iat").getAsLong())
                        <= 10);
        assertEquals(1, claims.getAsJsonObject("events").size());
        assertTrue(
                claims.getAsJsonObject("events")
                        .has(
                                "https://schema.fitko.de/fit-connect/events/"
                                        + action
                                        + "-submission"));
        assertEquals(
                Set.of("$schema", "iss", "iat", "jti", "sub", "txn", "events"), claims.keySet());
        assertEquals(
                "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json",
                claims.get("$schema").getAsString());
        return claims;
    }

    static JsonObject command(ApiVersion api, String owner, String name, Object... fields) {
        var command = new JsonObject();
        command.addProperty("protocolVersion", 1);
        command.addProperty("id", "native-receive-test");
        command.addProperty("command", name);
        command.addProperty("apiVersion", api.wireValue());
        command.addProperty("sessionId", owner);
        for (int i = 0; i < fields.length; i += 2)
            command.add(fields[i].toString(), new Gson().toJsonTree(fields[i + 1]));
        return command;
    }

    static JsonObject success(String response) {
        assertTrue(response.getBytes(StandardCharsets.UTF_8).length < FrameCodec.MAX_BYTES);
        var value = JsonParser.parseString(response).getAsJsonObject();
        assertTrue(value.get("ok").getAsBoolean(), response);
        return value.getAsJsonObject("result").getAsJsonObject("data");
    }

    static String failure(String response) {
        var value = JsonParser.parseString(response).getAsJsonObject();
        assertFalse(value.get("ok").getAsBoolean());
        return value.get("error").getAsString();
    }

    static void assertWorkspaceEmpty(Path directory) throws Exception {
        try (var files = Files.list(directory)) {
            assertEquals(0, files.count());
        }
    }

    static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(bytes));
    }

    static String eventPage(JsonObject tags) throws Exception {
        var list = new JsonArray();
        list.add(event("create-submission", null, 2));
        list.add(event("submit-submission", tags, 1));
        var page = new JsonObject();
        page.addProperty("count", 2);
        page.addProperty("offset", 0);
        page.addProperty("totalCount", 2);
        page.add("eventLog", list);
        return page.toString();
    }

    static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String encrypt(byte[] plain, boolean compressed) throws Exception {
        return encrypt(plain, compressed, "application/json");
    }

    static String encrypt(byte[] plain, boolean compressed, String contentType) throws Exception {
        var header = new JsonObject();
        header.addProperty("alg", "RSA-OAEP-256");
        header.addProperty("enc", "A256GCM");
        header.addProperty("kid", "synthetic-decrypt");
        header.addProperty("cty", contentType);
        if (compressed) {
            header.addProperty("zip", "DEF");
            var deflater = new Deflater(Deflater.DEFAULT_COMPRESSION, true);
            deflater.setInput(plain);
            deflater.finish();
            var out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            while (!deflater.finished()) {
                int count = deflater.deflate(buffer);
                out.write(buffer, 0, count);
            }
            deflater.end();
            plain = out.toByteArray();
        }
        String protectedHeader = b64(header.toString().getBytes(StandardCharsets.UTF_8));
        byte[] key = new byte[32], iv = new byte[12];
        var random = new SecureRandom();
        random.nextBytes(key);
        random.nextBytes(iv);
        var aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        aes.updateAAD(protectedHeader.getBytes(StandardCharsets.US_ASCII));
        byte[] sealed = aes.doFinal(plain);
        var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(
                Cipher.ENCRYPT_MODE,
                KeyFactory.getInstance("RSA")
                        .generatePublic(
                                new RSAPublicKeySpec(
                                        privateKey.getModulus(), privateKey.getPublicExponent())),
                new OAEPParameterSpec(
                        "SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        return protectedHeader
                + "."
                + b64(rsa.doFinal(key))
                + "."
                + b64(iv)
                + "."
                + b64(Arrays.copyOf(sealed, sealed.length - 16))
                + "."
                + b64(Arrays.copyOfRange(sealed, sealed.length - 16, sealed.length));
    }

    static String event(String event, JsonObject tags, int secondsAgo) throws Exception {
        return event(event, tags, secondsAgo, "submission:" + SUB, CASE);
    }

    static String event(
            String event, JsonObject tags, int secondsAgo, String subject, String caseId)
            throws Exception {
        var claims = new JsonObject();
        claims.addProperty(
                "$schema",
                "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json");
        claims.addProperty("iss", "https://test.fit-connect.fitko.dev/submission-api");
        claims.addProperty("jti", UUID.randomUUID().toString());
        claims.addProperty("iat", java.time.Instant.now().getEpochSecond() - secondsAgo);
        claims.addProperty("sub", subject);
        claims.addProperty("txn", "case:" + caseId);
        var events = new JsonObject();
        var body = new JsonObject();
        if (tags != null) body.add("authenticationTags", tags);
        if (event.equals("notify-submission")) body.addProperty("notifyType", "polling");
        events.add("https://schema.fitko.de/fit-connect/events/" + event, body);
        claims.add("events", events);
        String header =
                b64(
                        "{\"alg\":\"PS512\",\"kid\":\"synthetic-server\",\"typ\":\"secevent+jwt\"}"
                                .getBytes(StandardCharsets.UTF_8));
        String payload = header + "." + b64(claims.toString().getBytes(StandardCharsets.UTF_8));
        var signer = Signature.getInstance("RSASSA-PSS");
        signer.setParameter(
                new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        signer.initSign(privateKey);
        signer.update(payload.getBytes(StandardCharsets.US_ASCII));
        return payload + "." + b64(signer.sign());
    }
}
