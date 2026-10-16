package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.MGF1ParameterSpec;
import java.lang.management.ManagementFactory;
import java.util.concurrent.TimeUnit;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.PSSParameterSpec;

class SenderKernelTest {
    private static final UUID SOURCE = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID TARGET = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID SUBMISSION = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID CASE = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final String SERVICE = "urn:de:fim:leika:leistung:99008001014002";
    private static final URI SCHEMA = URI.create("https://example.invalid/schema.json");
    private static final URI REPLY_SCHEMA = URI.create("urn:test:reply-schema");
    private static final byte[] DATA = "{\"givenName\":\"Erika\",\"familyName\":\"Musterfrau\"}".getBytes(StandardCharsets.UTF_8);
    private static RSAPrivateCrtKey privateKey;
    private static JsonObject publicKey;
    @TempDir Path workspace;

    @BeforeAll static void fixture(@TempDir Path directory) throws Exception {
        NativeResourceTest.syntheticKey(directory);
        var store = KeyStore.getInstance("PKCS12");
        try (var in = Files.newInputStream(directory.resolve("synthetic.p12"))) { store.load(in, "synthetic-test-only".toCharArray()); }
        privateKey = (RSAPrivateCrtKey) store.getKey("synthetic", "synthetic-test-only".toCharArray());
        publicKey = new JsonObject();
        for (var entry : Map.of("kty", "RSA", "kid", "synthetic-encrypt", "alg", "RSA-OAEP-256", "use", "enc",
                "n", integer(privateKey.getModulus()), "e", integer(privateKey.getPublicExponent())).entrySet())
            publicKey.addProperty(entry.getKey(), entry.getValue());
        var x5c = new JsonArray(); x5c.add(Base64.getEncoder().encodeToString(store.getCertificate("synthetic").getEncoded()));
        publicKey.add("x5c", x5c);
        var ops = new JsonArray(); ops.add("wrapKey"); publicKey.add("key_ops", ops);
    }
    private static String integer(BigInteger value) {
        byte[] bytes = value.toByteArray();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes[0] == 0 ? Arrays.copyOfRange(bytes, 1, bytes.length) : bytes);
    }
    private static AdapterRegistry registry() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    private static SubmissionInput input(SubmissionInput.ProcessMessage process, UUID caseId) {
        return new SubmissionInput(SOURCE, TARGET, SERVICE, "Synthetischer Antrag", "DE000000000000", SCHEMA,
                "application/json", DATA, List.of(new SubmissionInput.Attachment("Anlage.txt", "text/plain",
                "Synthetische Beschreibung", "Testanlage".getBytes(StandardCharsets.UTF_8))), caseId, process);
    }

    private static SubmissionInput replyInput(ApiVersion api) {
        return new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, "Synthetischer Antrag", "DE000000000000", SCHEMA,
                "application/json", DATA, List.of(new SubmissionInput.Attachment("Anlage.txt", "text/plain", null, DATA)), null, null,
                new SubmissionInput.ReplyOffer(REPLY_SCHEMA, "application/xml"));
    }
    @Test void bothSdkReplyOffersKeepPrivateKeysNativeAndBindThemToTheActualAnnouncedCase() throws Exception {
        try (var adapters = registry()) {
            for (var api : ApiVersion.values()) {
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0"; remote.allowReplies = true;
                var access = new SendAccess(api, remote); var attempt = access.prepare(replyInput(api));
                try (var session = adapters.openSession(api, "id", "secret", (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                    assertTrue(session.replyChannels().isEmpty(), "Preparing a send must not generate a private reply key");
                    var outcome = adapters.withSession(api, session, s -> access.execute(attempt.attemptId(), s, workspace));
                    assertEquals("sent", outcome.status());
                    var channel = session.replyChannels().getFirst();
                    assertEquals(UUID.fromString(attempt.attemptId()), channel.attemptId());
                    assertEquals(TARGET, channel.destinationId()); assertEquals(api == ApiVersion.V3 ? SOURCE : null, channel.fromDestinationId());
                    assertEquals(CASE, channel.caseId()); assertEquals(SUBMISSION, channel.submissionId()); assertEquals("bound", channel.status());
                    assertEquals("reply-key:" + attempt.attemptId(), channel.keyId());
                    var metadata = JsonParser.parseString(new String(decrypt(remote.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8));
                    JsonObject offered = findJsonObject(metadata, "kid", channel.keyId()); assertNotNull(offered);
                    assertEquals("RSA", offered.get("kty").getAsString()); assertEquals("RSA-OAEP-256", offered.get("alg").getAsString());
                    assertEquals(4096, new BigInteger(1, Base64.getUrlDecoder().decode(offered.get("n").getAsString())).bitLength());
                    assertEquals(BigInteger.valueOf(65537), new BigInteger(1, Base64.getUrlDecoder().decode(offered.get("e").getAsString())));
                    assertTrue(offered.getAsJsonArray("key_ops").asList().stream().anyMatch(value -> value.getAsString().equals("wrapKey")));
                    for (String field : List.of("d", "p", "q", "dp", "dq", "qi", "oth", "k")) assertFalse(offered.has(field), field);
                    // SDK4's ApiJwk writes an empty x5c property even for its certificate-free generator.
                    assertTrue(!offered.has("x5c") || offered.get("x5c").isJsonNull()
                            || offered.get("x5c").isJsonArray() && offered.getAsJsonArray("x5c").isEmpty());
                    assertTrue(metadata.toString().contains(REPLY_SCHEMA.toString()));
                    if (api == ApiVersion.V3) {
                        var replySchema = findJsonObject(metadata, "schemaUri", REPLY_SCHEMA.toString());
                        assertNotNull(replySchema, "The reply dataset must contain the independently configured reply schema");
                        assertEquals("application/xml", replySchema.get("mimeType").getAsString());
                        var replyAddress = findJsonObject(metadata, "destinationId", SOURCE.toString());
                        assertNotNull(replyAddress, "Replies must address the original online-service destination");
                        assertEquals(channel.keyId(), replyAddress.getAsJsonObject("encryptionPublicKey").get("kid").getAsString());
                    }
                    String publicState = new Gson().toJson(session.replyChannels());
                    assertFalse(publicState.contains("private")); assertFalse(publicState.contains("\"n\"")); assertFalse(publicState.contains("synthetic-token"));
                    assertThrows(SessionException.class, () -> session.completeReplyChannel(UUID.fromString(attempt.attemptId()), UUID.randomUUID(), SUBMISSION, true));
                    assertEquals(channel, session.replyChannels().getFirst());
                    session.discardKeys(); assertEquals(channel, session.replyChannels().getFirst(), "Destination keys and ephemeral reply keys have separate lifetimes");
                    session.close(); assertThrows(SessionException.class, session::replyChannels);
                }
            }
        }
    }
    private static JsonObject findJsonObject(JsonElement value, String field, String expected) {
        if (value.isJsonObject()) {
            var object = value.getAsJsonObject();
            if (object.has(field) && object.get(field).isJsonPrimitive() && expected.equals(object.get(field).getAsString())) return object;
            for (var child : object.entrySet()) { var found = findJsonObject(child.getValue(), field, expected); if (found != null) return found; }
        } else if (value.isJsonArray()) for (var child : value.getAsJsonArray()) { var found = findJsonObject(child, field, expected); if (found != null) return found; }
        else if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
            String text = value.getAsString();
            if (text.startsWith("{")) try { return findJsonObject(JsonParser.parseString(text), field, expected); } catch (JsonParseException ignored) { }
        }
        return null;
    }
    @Test void bothSdkReplyReceiversAutomaticallySelectTheBoundCaseAndKidWithoutPrivateKeyExports() throws Exception {
        for (var api : ApiVersion.values()) for (String replyMime : List.of("application/json", "application/xml"))
                for (boolean metadata3 : api == ApiVersion.V3 ? List.of(false, true) : List.of(false)) {
            var remote = new Capture(api.wireValue()); remote.allowReplies = true; remote.metadata = "2.0.0";
            var gate = new SendAccess(api, remote);
            try (var adapters = registry(); var session = adapters.openSession(api, "id", "secret",
                    (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", gate)) {
                var input = replyInput(api);
                // Wire v2 offers only a schema URI, the native expectation retains its MIME.
                input = new SubmissionInput(input.fromDestinationId(), input.destinationId(), input.serviceIdentifier(), input.serviceName(),
                        input.region(), input.schemaUri(), input.mimeType(), input.data(), input.attachments(), input.caseId(), input.processMessage(),
                        new SubmissionInput.ReplyOffer(REPLY_SCHEMA, replyMime));
                var first = gate.prepare(input);
                var frozenInput = input;
                adapters.withSession(api, session, value -> { value.prepareReplyChannel(UUID.fromString(first.attemptId()), frozenInput, workspace); return null; });
                var pendingArchive = session.archiveKeys().getFirst();
                assertEquals("pending", pendingArchive.replyChannel().status());
                assertEquals("SessionKeyArchive[private material omitted]", pendingArchive.toString());
                assertEquals("sent", adapters.withSession(api, session, value -> gate.execute(first.attemptId(), value, workspace)).status());
                var firstReference = session.replyChannels().getFirst();
                var metadata = JsonParser.parseString(new String(decrypt(remote.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8));
                var replyPublicKey = findJsonObject(metadata, "kid", firstReference.keyId()).deepCopy();
                var second = gate.prepare(input);
                assertEquals("sent", adapters.withSession(api, session, value -> gate.execute(second.attemptId(), value, workspace)).status());
                assertEquals(2, session.replyChannels().size());
                session.discardKeys();
                var fixture = new IncomingReplyFixture(api, replyPublicKey, replyMime, metadata3);
                try (var read = ReceiveAccess.forReply(api, CASE.toString(), fixture.replyId.toString(), fixture)) {
                    var result = adapters.withSession(api, session, value -> value.receiveReply(CASE, fixture.replyId, read, workspace, fixture.schemas()));
                    assertEquals(fixture.replyId, result.replyId()); assertEquals(CASE, result.caseId());
                    assertEquals(firstReference.attemptId(), result.channelAttemptId(), "An older key in the same case must still resolve by kid");
                    assertArrayEquals(fixture.data, result.data()); assertArrayEquals(fixture.metadata, result.metadata());
                    assertEquals(1, result.attachments().size()); assertEquals("Synthetische Antwortanlage", result.attachments().getFirst().description());
                    assertArrayEquals(fixture.attachment, result.readPart(2, 0, 24 * 1024));
                    assertEquals(replyMime, result.mimeType());
                    try (var logSource = new EventLogAccess(api, CASE.toString(), fixture.replyId.toString(), fixture, true)) {
                        var log = adapters.withSession(api, session, value -> value.replyEventLog(CASE, fixture.replyId, logSource, workspace));
                        assertEquals(fixture.replyId, log.replyId()); assertNull(log.submissionId()); assertEquals(2, log.entries().size());
                    }
                    for (String attack : List.of("event-signature", "event-subject", "event-case", "duplicate-submit")) {
                        fixture.attack = attack;
                        try (var logSource = new EventLogAccess(api, CASE.toString(), fixture.replyId.toString(), fixture, true)) {
                            assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.replyEventLog(CASE, fixture.replyId, logSource, workspace)), api + " reply log " + attack);
                        }
                    }
                    fixture.attack = "";
                    assertFalse(result.issues().stream().anyMatch(item -> item.stage().equals("XML_SCHEMA_NOT_CHECKED")));
                    assertFalse(result.toString().contains("Erika"));
                    assertThrows(SessionException.class, () -> session.receiptEvidence(TARGET.toString(), SUBMISSION.toString()));
                    assertTrue(session.loadedKeys().isEmpty(), "Ephemeral reply receive needs no imported destination key");
                    if (replyMime.equals("application/json") && !metadata3) {
                        var archived = session.archiveKeys(); assertEquals(2, archived.size());
                        Path restartedWorkspace = Files.createDirectories(workspace.resolve("restarted-" + api));
                        try (var restarted = adapters.openSession(api, "id", "secret", (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", fixture)) {
                            for (var item : archived) adapters.withSession(api, restarted, value -> { value.restoreReplyKey(item, restartedWorkspace); return null; });
                            try (var restoredRead = ReceiveAccess.forReply(api, CASE.toString(), fixture.replyId.toString(), fixture)) {
                                var restored = adapters.withSession(api, restarted, value -> value.receiveReply(CASE, fixture.replyId, restoredRead, restartedWorkspace, fixture.schemas()));
                                assertArrayEquals(result.data(), restored.data()); assertEquals(result.channelAttemptId(), restored.channelAttemptId());
                            }
                            assertThrows(SessionException.class, () -> restarted.receiptEvidence(TARGET.toString(), SUBMISSION.toString()));
                            assertThrows(SessionException.class, () -> adapters.withSession(api, restarted, value -> { value.restoreReplyKey(archived.getFirst(), restartedWorkspace); return null; }));
                        }
                    }
                    for (String action : List.of("accept", "reject")) {
                        var request = new ReplyReceiptRequest(CASE, fixture.replyId, action, action.equals("reject") ? "technical-error" : null,
                                action.equals("reject") ? "Synthetische technische Rückmeldung" : null, null);
                        var evidence = action.equals("accept") ? result.evidence() : null;
                        var prepared = adapters.withSession(api, session, value -> value.prepareReplyReceipt(request, evidence));
                        assertEquals(request, prepared.request()); assertFalse(prepared.toString().contains("authenticationTags"));
                        var transport = new ReplyReceiptCapture(fixture, prepared);
                        assertNotNull(adapters.withSession(api, session, value -> value.sendReplyReceipt(prepared, transport, workspace)));
                        assertEquals(1, transport.puts);
                        var confirmedTransport = new ReplyReceiptCapture(fixture, prepared);
                        try (var confirmation = new ReplyReceiptAccess(api, confirmedTransport)) {
                            var attempt = confirmation.prepare(prepared);
                            var completed = adapters.withSession(api, session, value -> confirmation.execute(attempt.attemptId(), value, workspace, () -> {}));
                            assertEquals("confirmed", completed.status(), api + ": " + completed);
                            assertEquals(1, confirmedTransport.puts); assertNotNull(completed.eventId());
                            assertThrows(SessionException.class, () -> confirmation.prepare(prepared));
                        }
                        for (String malformed : List.of("signature", "event-case", "event-subject", "event-action", "tags", "empty")) {
                            var invalid = new ReplyReceiptCapture(fixture, prepared); invalid.ackAttack = malformed;
                            assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.sendReplyReceipt(prepared, invalid, workspace)), api + " " + action + " " + malformed);
                            assertEquals(1, invalid.puts);
                        }
                        var wrongCase = new ReplyReceiptCapture(fixture, prepared); wrongCase.wrongCase = true;
                        assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.sendReplyReceipt(prepared, wrongCase, workspace)));
                        assertEquals(0, wrongCase.puts);
                        var alteredBody = new PreparedReplyReceipt(request, "{}", evidence);
                        assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.sendReplyReceipt(alteredBody, transport, workspace)));
                        assertEquals(1, transport.puts);
                        if (action.equals("accept")) {
                            assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.prepareReplyReceipt(request, null)));
                            var foreign = new ReplyReceiptEvidence(CASE, fixture.replyId, UUID.randomUUID(), evidence.metadata(), evidence.data(), evidence.attachments());
                            assertThrows(SessionException.class, () -> adapters.withSession(api, session, value -> value.prepareReplyReceipt(request, foreign)));
                        }
                    }
                    fixture.attack = "";
                }
                var reads = new java.util.concurrent.atomic.AtomicInteger();
                var absent = new ReplySource() {
                    public String get(String u, Map<String,String> h) { reads.incrementAndGet(); fail("Unknown case must not reach HTTP"); return null; }
                    public void verifyAuthenticationTags(UUID c, UUID r, String m, String d, Map<UUID,String> a) { fail(); }
                };
                assertThrows(SessionException.class, () -> adapters.withSession(api, session,
                        value -> value.receiveReply(UUID.randomUUID(), fixture.replyId, absent, workspace, fixture.schemas())));
                assertEquals(0, reads.get());
                for (String attack : List.of("ciphertext", "event-signature", "attachment-tag", "schema", "mime", "kid", "event-case", "event-subject", "duplicate-submit")) {
                    fixture.attack = attack;
                    try (var read = ReceiveAccess.forReply(api, CASE.toString(), fixture.replyId.toString(), fixture)) {
                        assertThrows(SessionException.class, () -> adapters.withSession(api, session,
                                value -> value.receiveReply(CASE, fixture.replyId, read, workspace, fixture.schemas())), api + " " + attack);
                    }
                }
                session.close();
                assertThrows(SessionException.class, () -> session.receiveReply(CASE, fixture.replyId, absent, workspace, fixture.schemas()));
            }
        }
    }

    private static final class ReplyReceiptCapture implements ResourceExchange {
        final IncomingReplyFixture fixture; final PreparedReplyReceipt expected;
        int puts; String ackAttack = ""; boolean wrongCase;
        ReplyReceiptCapture(IncomingReplyFixture fixture, PreparedReplyReceipt expected) { this.fixture = fixture; this.expected = expected; }
        public String get(String url, Map<String,String> headers) {
            String result = fixture.get(url, headers);
            return wrongCase && url.endsWith("/replies/" + fixture.replyId) ? result.replace(CASE.toString(), UUID.randomUUID().toString()) : result;
        }
        public Response request(String method, String url, Map<String,String> headers, String body) {
            if (method.equals("GET")) return new Response(200, get(url, headers));
            assertEquals("PUT", method); assertEquals("https://test.fit-connect.fitko.dev/submission-api/" + fixture.api.wireValue() + "/replies/" + fixture.replyId + "/" + expected.request().action(), url);
            assertEquals(JsonParser.parseString(expected.body()), JsonParser.parseString(body));
            assertTrue(headers.entrySet().stream().anyMatch(item -> item.getKey().equalsIgnoreCase("Authorization") && item.getValue().equals("Bearer synthetic-token")));
            assertTrue(headers.entrySet().stream().anyMatch(item -> item.getKey().equalsIgnoreCase("Content-Type") && item.getValue().equals("application/json")));
            puts++;
            try {
                if (ackAttack.equals("empty")) return new Response(200, "");
                fixture.replyReceiptPayload = JsonParser.parseString(body).getAsJsonObject();
                fixture.attack = ackAttack;
                if (ackAttack.equals("tags") && fixture.replyReceiptPayload.has("authenticationTags"))
                    fixture.replyReceiptPayload.getAsJsonObject("authenticationTags").addProperty("data", "AAAAAAAAAAAAAAAAAAAAAA");
                String name = expected.request().action() + "-reply";
                if (ackAttack.equals("event-action") || ackAttack.equals("tags") && expected.request().action().equals("reject")) name = "create-reply";
                String token = fixture.event(name, null);
                if (ackAttack.equals("signature")) { var parts = token.split("\\."); parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1); token = String.join(".", parts); }
                return new Response(200, token);
            } catch (Exception failure) { throw new AssertionError(failure);
            } finally { fixture.attack = ""; fixture.replyReceiptPayload = null; }
        }
    }

    private static final class IncomingReplyFixture implements ResourceExchange {
        final ApiVersion api;
        final UUID replyId = UUID.fromString("66666666-6666-4666-8666-666666666666"), attachmentId = UUID.fromString("77777777-7777-4777-8777-777777777777");
        final JsonObject key;
        final byte[] data, attachment = "Testantwort".getBytes(StandardCharsets.UTF_8), metadata;
        final boolean metadata3;
        final String encryptedData, encryptedMetadata, encryptedAttachment, otherSchemaMetadata, otherMimeMetadata;
        String attack = "";
        JsonObject sdkReply; Map<String,String> sdkUploads;
        JsonObject replyReceiptPayload;
        IncomingReplyFixture(ApiVersion api, JsonObject key, String mime, boolean metadata3) throws Exception {
            this.api = api; this.key = key; this.metadata3 = metadata3;
            data = (mime.equals("application/xml") ? "<antwort><vorname>Erika</vorname></antwort>" : "{\"vorname\":\"Erika\"}").getBytes(StandardCharsets.UTF_8);
            metadata = metadata(REPLY_SCHEMA.toString(), mime);
            encryptedData = seal(data); encryptedMetadata = seal(metadata); encryptedAttachment = seal(attachment);
            otherSchemaMetadata = seal(metadata("urn:test:other", mime)); otherMimeMetadata = seal(metadata(REPLY_SCHEMA.toString(), mime.equals("application/json") ? "application/xml" : "application/json"));
        }
        byte[] metadata(String schema, String mime) throws Exception {
            return ("{\"$schema\":\"https://schema.fitko.de/fit-connect/metadata/" + (metadata3 ? "3.0.0" : "2.0.0") + "/metadata.schema.json\",\"contentStructure\":{\"data\":{\"hash\":{\"type\":\"sha512\",\"content\":\""
                    + digest(data) + "\"},\"submissionSchema\":{\"schemaUri\":\"" + schema + "\",\"mimeType\":\"" + mime
                    + "\"}},\"attachments\":[{\"attachmentId\":\"" + attachmentId + "\",\"hash\":{\"type\":\"sha512\",\"content\":\"" + digest(attachment)
                    + "\"},\"purpose\":\"form\",\"filename\":\"Antwort.txt\",\"description\":\"Synthetische Antwortanlage\",\"mimeType\":\"text/plain\"}]}}").getBytes(StandardCharsets.UTF_8);
        }
        Map<String,String> schemas() { return Map.of(REPLY_SCHEMA.toString(), new String(data, StandardCharsets.UTF_8).startsWith("<") ? "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"antwort\"><xs:complexType><xs:sequence><xs:element name=\"vorname\" type=\"xs:string\"/></xs:sequence></xs:complexType></xs:element></xs:schema>" : "{\"type\":\"object\",\"required\":[\"vorname\"]}", "urn:test:other", "{\"type\":\"object\"}"); }
        private static String digest(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(bytes)); }
        private static String tag(String wire) { return wire.substring(wire.lastIndexOf('.') + 1); }
        String seal(byte[] bytes) throws Exception {
            var header = new JsonObject(); header.addProperty("alg", "RSA-OAEP-256"); header.addProperty("enc", "A256GCM"); header.addProperty("kid", key.get("kid").getAsString());
            String protectedHeader = Base64.getUrlEncoder().withoutPadding().encodeToString(header.toString().getBytes(StandardCharsets.UTF_8));
            byte[] aesKey = new byte[32], iv = new byte[12]; var random = new SecureRandom(); random.nextBytes(aesKey); random.nextBytes(iv);
            var aes = Cipher.getInstance("AES/GCM/NoPadding"); aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(aesKey, "AES"), new GCMParameterSpec(128, iv)); aes.updateAAD(protectedHeader.getBytes(StandardCharsets.US_ASCII));
            byte[] sealed = aes.doFinal(bytes);
            var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
            rsa.init(Cipher.ENCRYPT_MODE, KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(new BigInteger(1, Base64.getUrlDecoder().decode(key.get("n").getAsString())), new BigInteger(1, Base64.getUrlDecoder().decode(key.get("e").getAsString())))), new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
            var b64 = Base64.getUrlEncoder().withoutPadding();
            return protectedHeader + "." + b64.encodeToString(rsa.doFinal(aesKey)) + "." + b64.encodeToString(iv) + "." + b64.encodeToString(Arrays.copyOf(sealed, sealed.length - 16)) + "." + b64.encodeToString(Arrays.copyOfRange(sealed, sealed.length - 16, sealed.length));
        }
        public String get(String url, Map<String,String> headers) {
            try {
                var base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
                if (sdkReply != null && url.endsWith("/replies/" + replyId)) return sdkReply.toString();
                if (sdkUploads != null && url.contains("/attachments/")) return sdkUploads.get(url.substring(url.lastIndexOf('/') + 1));
                String meta = sdkReply != null ? sdkReply.get("encryptedMetadata").getAsString() : attack.equals("schema") ? otherSchemaMetadata : attack.equals("mime") ? otherMimeMetadata : encryptedMetadata;
                if (url.endsWith("/replies/" + replyId)) {
                    var envelope = new JsonObject(); envelope.addProperty("replyId", replyId.toString()); envelope.addProperty("caseId", CASE.toString()); envelope.addProperty("fromDestinationId", TARGET.toString());
                    var ids = new JsonArray(); ids.add(attachmentId.toString()); envelope.add("attachments", ids);
                    envelope.addProperty("encryptedMetadata", attack.equals("kid") ? meta.replace(meta.substring(0, meta.indexOf('.')), Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"unknown\"}".getBytes(StandardCharsets.UTF_8))) : meta);
                    String wire = encryptedData;
                    if (attack.equals("ciphertext")) { var parts = wire.split("\\."); parts[3] = (parts[3].startsWith("A") ? "B" : "A") + parts[3].substring(1); wire = String.join(".", parts); }
                    envelope.addProperty("encryptedData", wire); return envelope.toString();
                }
                if (url.endsWith("/attachments/" + attachmentId)) return encryptedAttachment;
                if (java.net.URI.create(url).getPath().endsWith("/events")) {
                    var tags = new JsonObject(); tags.addProperty("metadata", tag(meta)); tags.addProperty("data", tag(sdkReply == null ? encryptedData : sdkReply.get("encryptedData").getAsString()));
                    var at = new JsonObject(); if (sdkUploads == null) at.addProperty(attachmentId.toString(), attack.equals("attachment-tag") ? "wrong" : tag(encryptedAttachment)); else sdkUploads.forEach((id,wire) -> at.addProperty(id,tag(wire))); tags.add("attachments", at);
                    var list = new JsonArray(); list.add(event("create-reply", null)); String jwt = event("submit-reply", tags);
                    if (attack.equals("event-signature")) { var parts = jwt.split("\\."); parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1); jwt = String.join(".", parts); }
                    list.add(jwt); if (attack.equals("duplicate-submit")) list.add(event("submit-reply", tags));
                    return "{\"offset\":0,\"count\":" + list.size() + ",\"totalCount\":" + list.size() + ",\"eventLog\":" + list + "}";
                }
                if (url.equals(base + "/cases/" + CASE)) return "{\"caseId\":\"" + CASE + "\",\"destinationId\":\"" + TARGET + "\",\"fromDestinationId\":\"" + SOURCE + "\"}";
                if (url.startsWith(base + "/destinations/")) return "{\"destinationId\":\"" + url.substring(url.lastIndexOf('/') + 1) + "\",\"type\":\"A\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\"]}";
                if (url.endsWith("/.well-known/jwks.json")) {
                    var server = publicKey.deepCopy(); server.addProperty("kid", "synthetic-server"); server.addProperty("alg", "PS512"); server.addProperty("use", "sig"); var ops = new JsonArray(); ops.add("verify"); server.add("key_ops", ops);
                    return "{\"keys\":[" + server + "]}";
                }
                throw new AssertionError("Unexpected reply receive URL: " + url);
            } catch (Exception failure) { throw new AssertionError(failure); }
        }
        String event(String name, JsonObject tags) throws Exception {
            var claims = new JsonObject(); claims.addProperty("$schema", "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json"); claims.addProperty("iss", "https://test.fit-connect.fitko.dev/submission-api");
            claims.addProperty("jti", UUID.randomUUID().toString()); claims.addProperty("iat", java.time.Instant.now().getEpochSecond() - 1); claims.addProperty("sub", "reply:" + (attack.equals("event-subject") ? UUID.randomUUID() : replyId)); claims.addProperty("txn", "case:" + (attack.equals("event-case") ? UUID.randomUUID() : CASE));
            var events = new JsonObject(); var body = replyReceiptPayload == null ? new JsonObject() : replyReceiptPayload.deepCopy(); if (tags != null) body.add("authenticationTags", tags); events.add("https://schema.fitko.de/fit-connect/events/" + name, body); claims.add("events", events);
            var b64 = Base64.getUrlEncoder().withoutPadding(); String payload = b64.encodeToString("{\"alg\":\"PS512\",\"kid\":\"synthetic-server\",\"typ\":\"secevent+jwt\"}".getBytes(StandardCharsets.UTF_8)) + "." + b64.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
            var signature = Signature.getInstance("RSASSA-PSS"); signature.setParameter(new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1)); signature.initSign(privateKey); signature.update(payload.getBytes(StandardCharsets.US_ASCII)); return payload + "." + b64.encodeToString(signature.sign());
        }
    }

    @Test void replyKeysAreDiscardedBeforeAnyWriteButRetainedForKnownAndUnknownUncertainCases() throws Exception {
        try (var adapters = registry()) {
            for (var api : ApiVersion.values()) for (String mode : List.of("before-write", "known-case", "lost-announcement")) {
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0"; remote.allowReplies = true;
                remote.omitCertificate = mode.equals("before-write"); remote.failUpload = mode.equals("known-case"); remote.loseAnnouncement = mode.equals("lost-announcement");
                var access = new SendAccess(api, remote); var attempt = access.prepare(replyInput(api));
                try (var session = adapters.openSession(api, "id", "secret", (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                    var result = adapters.withSession(api, session, s -> access.execute(attempt.attemptId(), s, workspace));
                    if (mode.equals("before-write")) { assertEquals("failed", result.status()); assertTrue(session.replyChannels().isEmpty()); assertEquals(0, remote.posts); }
                    else {
                        assertEquals("uncertain", result.status()); assertEquals(1, remote.posts);
                        var channel = session.replyChannels().getFirst();
                        assertEquals(mode.equals("known-case") ? "bound" : "unresolved", channel.status());
                        assertEquals(mode.equals("known-case") ? CASE : null, channel.caseId());
                        assertEquals(mode.equals("known-case") ? SUBMISSION : null, channel.submissionId());
                        assertThrows(SessionException.class, () -> access.execute(attempt.attemptId(), session, workspace));
                        assertEquals(1, session.replyChannels().size());
                    }
                }
            }
        }
    }

    @Test void v3SdkSendsServiceAndProcessMessagesWithAuthenticatedEncryptedContent() throws Exception {
        try (var adapters = registry()) {
            for (var process : Arrays.asList(null, new SubmissionInput.ProcessMessage("urn:test:process", "request"))) {
                var exchange = new Capture();
                try (var session = adapters.openSession(ApiVersion.V3, "synthetic-id", "synthetic-secret", (url, body) ->
                        "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}", exchange)) {
                    var result = adapters.withSession(ApiVersion.V3, session, s -> s.send(input(process, process == null ? null : CASE), workspace));
                    assertEquals(new SendResult(TARGET, SOURCE, SUBMISSION, CASE), result);
                    assertEquals(1, exchange.posts);
                    assertEquals(SOURCE.toString(), exchange.announce.get("fromDestinationId").getAsString());
                    assertEquals(TARGET.toString(), exchange.announce.get("destinationId").getAsString());
                    assertEquals(1, exchange.uploads.size());
                    assertArrayEquals(DATA, decrypt(exchange.submitted.get("encryptedData").getAsString()));
                    var metadata = JsonParser.parseString(new String(decrypt(exchange.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8)).getAsJsonObject();
                    assertTrue(metadata.get("$schema").getAsString().contains("/3.0.0/"));
                    String metadataText = metadata.toString();
                    assertTrue(metadataText.contains("Synthetische Beschreibung"));
                    assertTrue(metadataText.contains("Anlage.txt"));
                    assertTrue(metadataText.contains(SCHEMA.toString()));
                    assertDataHash(metadata);
                    assertArrayEquals("Testanlage".getBytes(StandardCharsets.UTF_8), decrypt(exchange.uploads.values().iterator().next()));
                    if (process != null) {
                        assertEquals("request", exchange.announce.getAsJsonObject("processMessage").get("messageId").getAsString());
                        assertEquals(CASE.toString(), exchange.announce.getAsJsonObject("case").get("caseId").getAsString());
                    } else assertEquals(SERVICE, exchange.announce.getAsJsonObject("case").getAsJsonObject("publicService").get("identifier").getAsString());
                }
            }
        }
    }

    @Test void sentSubmissionsCanBeReceivedAndVerifiedByBothSdkAdapters() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion sending : ApiVersion.values()) {
                var remote = new Capture(sending.wireValue()); remote.metadata = "2.0.0"; remote.allowReplies = true;
                var gate = new SendAccess(sending, remote);
                var original = input(null, null);
                var input = new SubmissionInput(sending == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, original.serviceName(),
                        original.region(), SCHEMA, original.mimeType(), DATA, original.attachments(), null, null, new SubmissionInput.ReplyOffer(REPLY_SCHEMA, "application/json"));
                try (var sender = adapters.openSession(sending, "id", "secret",
                        (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", gate)) {
                    var attempt = gate.prepare(input);
                    assertEquals("sent", gate.execute(attempt.attemptId(), sender, workspace).status());
                var envelope = JsonParser.parseString(remote.response()).getAsJsonObject();
                remote.submitted.entrySet().forEach(entry -> envelope.add(entry.getKey(), entry.getValue()));
                envelope.add("publicService", remote.announce.get("publicService"));
                envelope.addProperty("region", input.region());
                var tags = new JsonObject();
                tags.addProperty("metadata", IncomingReplyFixture.tag(remote.submitted.get("encryptedMetadata").getAsString()));
                tags.addProperty("data", IncomingReplyFixture.tag(remote.submitted.get("encryptedData").getAsString()));
                var attachments = new JsonObject();
                remote.uploads.forEach((url, wire) -> attachments.addProperty(url.substring(url.lastIndexOf('/') + 1), IncomingReplyFixture.tag(wire)));
                tags.add("attachments", attachments);
                var events = new JsonArray();
                events.add(submissionEvent("create-submission", null)); events.add(submissionEvent("submit-submission", tags));
                String eventPage = "{\"offset\":0,\"count\":2,\"totalCount\":2,\"eventLog\":" + events + "}";
                for (ApiVersion receiving : ApiVersion.values()) {
                    String base = "https://test.fit-connect.fitko.dev/submission-api/" + receiving.wireValue();
                    ResourceExchange read = (url, headers) -> {
                        if (url.equals(base + "/submissions/" + SUBMISSION)) return envelope.toString();
                        if (url.contains("/events?")) return eventPage;
                        if (url.endsWith("/.well-known/jwks.json")) {
                            var server = publicKey.deepCopy(); server.addProperty("kid", "synthetic-server"); server.addProperty("alg", "PS512");
                            server.remove("x5c"); server.remove("use"); var ops = new JsonArray(); ops.add("verify"); server.add("key_ops", ops);
                            return "{\"keys\":[" + server + "]}";
                        }
                        if (url.contains("/attachments/")) return remote.uploads.get(url.replace(base, remote.BASE));
                        return remote.get(url.replace(base, remote.BASE), headers);
                    };
                    try (var receiver = adapters.openSession(receiving, "id", "secret",
                            (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", read)) {
                        String pem = "-----BEGIN PRIVATE KEY-----\n" + Base64.getEncoder().encodeToString(privateKey.getEncoded()) + "\n-----END PRIVATE KEY-----";
                        receiver.importKey(TARGET.toString(), "decrypt", pem, List.of(publicKey.toString()));
                        try (var scope = new ReceiveAccess(receiving, TARGET.toString(), SUBMISSION.toString(), read)) {
                            var result = adapters.withSession(receiving, receiver,
                                    session -> session.receive(TARGET.toString(), SUBMISSION.toString(), scope, workspace, Map.of(SCHEMA.toString(), "{\"type\":\"object\"}")));
                            assertArrayEquals(DATA, result.data(), sending + " -> " + receiving);
                            assertArrayEquals(input.attachments().getFirst().data(), result.attachments().getFirst().bytes());
                            assertEquals("Anlage.txt", result.attachments().getFirst().fileName());
                            exerciseReplyRoundtrip(adapters, sending, sender, receiving, receiver, remote);
                        }
                    }
                }
                }
            }
        }
    }

    private void exerciseReplyRoundtrip(AdapterRegistry adapters, ApiVersion sending, AuthenticatedSession sender,
            ApiVersion receiving, AuthenticatedSession receiver, Capture original) throws Exception {
        var channel = sender.replyChannels().getFirst();
        var metadata = JsonParser.parseString(new String(decrypt(original.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8));
        var offered = findJsonObject(metadata, "kid", channel.keyId()).deepCopy();
        var incoming = new IncomingReplyFixture(sending, offered, "application/json", false);
        var uploads = new LinkedHashMap<String,String>(); var submitted = new java.util.concurrent.atomic.AtomicReference<JsonObject>();
        var announced = new java.util.concurrent.atomic.AtomicReference<JsonArray>(); var posts = new java.util.concurrent.atomic.AtomicInteger();
        String base = "https://test.fit-connect.fitko.dev/submission-api/" + receiving.wireValue();
        ResourceExchange transport = new ResourceExchange() {
            String response() { return "{\"replyId\":\"" + incoming.replyId + "\",\"caseId\":\"" + CASE + "\",\"fromDestinationId\":\"" + TARGET + "\",\"attachments\":[]}"; }
            public String get(String url, Map<String,String> headers) { return request("GET", url, headers, null).body(); }
            public Response request(String method, String url, Map<String,String> headers, String body) {
                if (method.equals("GET")) {
                    if (url.equals(base + "/cases/" + CASE)) return new Response(200,"{\"caseId\":\""+CASE+"\",\"destinationId\":\""+TARGET+"\",\"fromDestinationId\":\""+SOURCE+"\"}");
                    if (url.contains("/destinations/") && !url.endsWith("/limits")) return new Response(200,"{\"destinationId\":\""+url.substring(url.lastIndexOf('/')+1)+"\",\"type\":\"A\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\"],\"publicServices\":[]}");
                    if (url.endsWith("/limits") || url.contains("/limits/")) return new Response(200,"{\"attachments\":{\"reply\":{\"applicable\":"+original.limits()+"},\"applicable\":"+original.limits()+"}}");
                }
                if (method.equals("POST") && url.equals(base+"/replies")) { posts.incrementAndGet();announced.set(JsonParser.parseString(body).getAsJsonObject().getAsJsonArray("announcedAttachments"));return new Response(201,response()); }
                if (method.equals("PUT") && url.contains("/attachments/")) { assertNull(uploads.put(url.substring(url.lastIndexOf('/')+1),body));return new Response(204,""); }
                if (method.equals("PUT") && url.equals(base+"/replies/"+incoming.replyId)) { assertNull(submitted.getAndSet(JsonParser.parseString(body).getAsJsonObject()));return new Response(200,response()); }
                throw new AssertionError("Unexpected roundtrip reply request: "+method+" "+url);
            }
        };
        var reply = new ReplyInput(TARGET,SUBMISSION,CASE,REPLY_SCHEMA,"application/json",incoming.data,
                List.of(new SubmissionInput.Attachment("Antwort.txt","text/plain","Synthetische Antwortanlage",incoming.attachment)),null);
        var packet = new JsonObject();packet.addProperty("schemaPackage",1);packet.addProperty("schemaUri",REPLY_SCHEMA.toString());
        var documents = new JsonObject();documents.add(REPLY_SCHEMA.toString(),JsonParser.parseString(incoming.schemas().get(REPLY_SCHEMA.toString())));packet.add("documents",documents);
        boolean schemaValid = adapters.withSession(receiving,receiver,value->value.validateDraft(new SchemaSnapshot(REPLY_SCHEMA.toString(),packet.toString()),"application/json",incoming.data));
        assertTrue(schemaValid);
        var gate = new ReplyAccess(receiving,transport);var pending=gate.prepare(reply,receiver.replyRecipient(TARGET.toString(),SUBMISSION.toString()));
        assertEquals("sent",adapters.withSession(receiving,receiver,value->gate.execute(pending.attemptId(),value,workspace,()->{})).status(),sending+" -> "+receiving+" reply send");
        assertEquals(1,posts.get()); assertEquals(1,uploads.size());
        incoming.sdkReply=submitted.get().deepCopy();incoming.sdkReply.addProperty("replyId",incoming.replyId.toString());incoming.sdkReply.addProperty("caseId",CASE.toString());incoming.sdkReply.addProperty("fromDestinationId",TARGET.toString());incoming.sdkReply.add("attachments",announced.get());incoming.sdkUploads=uploads;
        try(var read=ReceiveAccess.forReply(sending,CASE.toString(),incoming.replyId.toString(),incoming)) {
            var result=adapters.withSession(sending,sender,value->value.receiveReply(CASE,incoming.replyId,read,workspace,incoming.schemas()));
            assertArrayEquals(incoming.data,result.data(),sending+" -> "+receiving+" -> "+sending);assertArrayEquals(incoming.attachment,result.attachments().getFirst().bytes());
        }
        try(var read=new EventLogAccess(sending,CASE.toString(),incoming.replyId.toString(),incoming,true)) {
            assertEquals(2,adapters.withSession(sending,sender,value->value.replyEventLog(CASE,incoming.replyId,read,workspace)).entries().size());
        }
    }

    private static String submissionEvent(String name, JsonObject tags) throws Exception {
        var claims = new JsonObject(); claims.addProperty("$schema", "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json");
        claims.addProperty("iss", "https://submission-api-testing.fit-connect.fitko.dev");
        claims.addProperty("jti", UUID.randomUUID().toString()); claims.addProperty("iat", java.time.Instant.now().getEpochSecond() - 1);
        claims.addProperty("sub", "submission:" + SUBMISSION); claims.addProperty("txn", "case:" + CASE);
        var events = new JsonObject(); var body = new JsonObject(); if (tags != null) body.add("authenticationTags", tags);
        events.add("https://schema.fitko.de/fit-connect/events/" + name, body); claims.add("events", events);
        var b64 = Base64.getUrlEncoder().withoutPadding();
        String payload = b64.encodeToString("{\"alg\":\"PS512\",\"kid\":\"synthetic-server\",\"typ\":\"secevent+jwt\"}".getBytes(StandardCharsets.UTF_8))
                + "." + b64.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
        var signature = Signature.getInstance("RSASSA-PSS"); signature.setParameter(new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        signature.initSign(privateKey); signature.update(payload.getBytes(StandardCharsets.US_ASCII));
        return payload + "." + b64.encodeToString(signature.sign());
    }

    @Test void v3SendDoesNotRequirePermissionToListUnrelatedCases() throws Exception {
        var remote = new Capture("v3");
        var gate = new SendAccess(ApiVersion.V3, new ResourceExchange() {
            public String get(String url, Map<String,String> headers) { return remote.get(url, headers); }
            public Response request(String method, String url, Map<String,String> headers, String body) {
                if (url.contains("/cases?")) return new Response(403, "{}");
                return remote.request(method, url, headers, body);
            }
        });
        try (var adapters = registry(); var session = adapters.openSession(ApiVersion.V3, "id", "secret",
                (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", gate)) {
            var attempt = gate.prepare(input(null, null));
            var result = gate.execute(attempt.attemptId(), session, workspace);
            assertEquals("sent", result.status(), result.toString());
            assertEquals(1, remote.posts);
        }
    }

    @Test void metadataOneAndUnadvertisedServicesCannotAnnounceASubmission() throws Exception {
        try (var adapters = registry()) {
            for (boolean oldMetadata : List.of(true, false)) {
                var exchange = new Capture(); exchange.metadata = oldMetadata ? "1.0.0" : "3.0.0"; exchange.offerService = oldMetadata;
                try (var session = adapters.openSession(ApiVersion.V3, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", exchange)) {
                    assertThrows(SessionException.class, () -> adapters.withSession(ApiVersion.V3, session, s -> s.send(input(null, null), workspace)));
                    assertEquals(0, exchange.posts);
                    assertTrue(exchange.uploads.isEmpty());
                }
            }
        }
    }

    @Test void v2SdkUsesMetadataTwoAndImplicitSenderWithEncryptedAttachments() throws Exception {
        try (var adapters = registry()) {
            var exchange = new Capture("v2"); exchange.metadata = "2.0.0";
            try (var session = adapters.openSession(ApiVersion.V2, "id", "secret", (u, b) ->
                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", exchange)) {
                var original = input(null, null);
                var request = new SubmissionInput(null, TARGET, SERVICE, original.serviceName(), original.region(), SCHEMA,
                        "application/json", DATA, original.attachments(), null, null);
                assertEquals(new SendResult(TARGET, null, SUBMISSION, CASE), adapters.withSession(ApiVersion.V2, session,
                        s -> s.send(request, workspace)));
                assertEquals(1, exchange.posts);
                assertFalse(exchange.announce.has("fromDestinationId"));
                assertEquals(SERVICE, exchange.announce.getAsJsonObject("publicService").get("identifier").getAsString());
                assertArrayEquals(DATA, decrypt(exchange.submitted.get("encryptedData").getAsString()));
                var metadata = JsonParser.parseString(new String(decrypt(exchange.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8)).getAsJsonObject();
                assertTrue(metadata.get("$schema").getAsString().contains("/2.0.0/"));
                assertTrue(metadata.toString().contains("Synthetische Beschreibung"));
                assertDataHash(metadata);
                assertEquals(1, exchange.uploads.size());
                assertArrayEquals("Testanlage".getBytes(StandardCharsets.UTF_8), decrypt(exchange.uploads.values().iterator().next()));
            }
        }
    }

    @Test void sdkFailuresDoNotRetryAnUncertainWriteAndReadOnlyTransportCannotSend() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                var original = input(null, null);
                var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE,
                        original.serviceName(), original.region(), SCHEMA, "application/json", DATA, original.attachments(), null, null);
                var exchange = new Capture(api.wireValue());
                exchange.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                exchange.failUpload = true;
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", exchange)) {
                    assertThrows(SessionException.class, () -> adapters.withSession(api, session, s -> s.send(request, workspace)));
                    assertEquals(1, exchange.posts);
                    assertEquals(1, exchange.uploadAttempts);
                    assertNull(exchange.submitted);
                }
                var reads = new Capture(api.wireValue()); reads.metadata = exchange.metadata;
                ResourceExchange readOnly = reads::get;
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", readOnly)) {
                    var failure = assertThrows(SessionException.class, () -> adapters.withSession(api, session, s -> s.send(request, workspace)));
                    assertEquals("endpoint_blocked", failure.code());
                    assertEquals(0, reads.posts);
                    assertEquals(0, reads.uploadAttempts);
                }
            }
        }
    }

    private static void assertDataHash(JsonObject metadata) throws Exception {
        var hash = metadata.getAsJsonObject("contentStructure").getAsJsonObject("data").getAsJsonObject("hash");
        assertEquals("sha512", hash.get("type").getAsString());
        assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(DATA)), hash.get("content").getAsString());
    }

    @Test void nativeAttemptBindsTheApprovedInputAndRetainsUncertainServerIdsWithoutResending() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                var original = input(null, null);
                var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE,
                        original.serviceName(), original.region(), SCHEMA, "application/json", DATA, original.attachments(), null, null);
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var access = new SendAccess(api, remote);
                var approved = access.prepare(request);
                assertEquals("prepared", approved.status());
                assertThrows(SessionException.class, () -> access.request("POST", remote.BASE + "/submissions", Map.of(), "{}"));
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                    remote.failUpload = true;
                    var result = adapters.withSession(api, session, s -> access.execute(approved.attemptId(), s, workspace));
                    assertEquals("uncertain", result.status());
                    assertEquals(SUBMISSION.toString(), result.submissionId());
                    assertEquals(CASE.toString(), result.caseId());
                    assertThrows(SessionException.class, () -> access.execute(approved.attemptId(), session, workspace));
                    assertThrows(SessionException.class, () -> access.prepare(request));
                    assertEquals(1, remote.posts);
                    assertEquals(1, remote.uploadAttempts);
                }
            }
        }
    }

    @Test void nativeSendDiagnosticsPreserveHttpFailureWithoutBodiesOrCredentialsAndDoNotPermitRetry() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) for (boolean announce : new boolean[]{false, true}) for (boolean thrown : new boolean[]{false, true}) {
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var exchange = new ResourceExchange() {
                    public String get(String url, Map<String,String> headers) { return request("GET", url, headers, null).body(); }
                    public Response request(String method, String url, Map<String,String> headers, String body) {
                        boolean matches = announce ? method.equals("POST") && url.endsWith("/submissions")
                                : method.equals("GET") && url.equals(remote.BASE + "/destinations/" + TARGET);
                        if (matches) {
                            if (thrown) throw new SessionException("resource_unavailable", 503,
                                    "https://schema.fitko.de/fit-connect/submission-api/problems/request-invalid");
                            return new Response(422, "synthetic-sensitive-response");
                        }
                        return remote.request(method, url, headers, body);
                    }
                };
                var original = input(null, null);
                var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE,
                        original.serviceName(), original.region(), SCHEMA, "application/json", DATA, original.attachments(), null, null);
                var gate = new SendAccess(api, exchange); var prepared = gate.prepare(request);
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", gate)) {
                    var result = adapters.withSession(api, session, s -> gate.execute(prepared.attemptId(), s, workspace));
                    assertEquals(announce ? "uncertain" : "failed", result.status());
                    var failure = result.diagnostics().getLast();
                    assertEquals(announce ? "announce" : "destination", failure.step());
                    assertEquals(thrown ? 503 : 422, failure.httpStatus());
                    assertEquals(thrown ? "request-invalid" : null, failure.problemType());
                    assertEquals("resource_unavailable", failure.code()); assertTrue(failure.durationMs() >= 0);
                    assertEquals(result, gate.state());
                    assertThrows(UnsupportedOperationException.class, () -> result.diagnostics().clear());
                    String serialized = new Gson().toJson(result);
                    for (String forbidden : List.of("synthetic-token", "synthetic-sensitive-response", "Authorization", "https://", "givenName"))
                        assertFalse(serialized.contains(forbidden), serialized);
                    assertThrows(SessionException.class, () -> gate.execute(prepared.attemptId(), session, workspace));
                    if (announce) assertThrows(SessionException.class, () -> gate.prepare(request));
                    else { assertTrue(gate.prepare(request).diagnostics().isEmpty()); assertFalse(result.diagnostics().isEmpty()); }
                }
            }
        }
    }

    @Test void v2ReportsWrongDataFormatWithoutAnnouncingOrDisclosingParserMessages() throws Exception {
        try (var adapters = registry()) {
            for (String mime : List.of("application/xml", "application/json")) {
                var remote = new Capture("v2"); remote.metadata = "2.0.0"; remote.dataMimeType = mime;
                var original = input(null, null);
                byte[] data = (mime.equals("application/xml") ? "{\"vorname\":\"Erika\"}" : "{not-json").getBytes(StandardCharsets.UTF_8);
                var request = new SubmissionInput(null, TARGET, SERVICE, original.serviceName(), original.region(), SCHEMA, mime,
                        data, List.of(), null, null);
                var gate = new SendAccess(ApiVersion.V2, remote); var prepared = gate.prepare(request);
                try (var session = adapters.openSession(ApiVersion.V2, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", gate)) {
                    var result = adapters.withSession(ApiVersion.V2, session, s -> gate.execute(prepared.attemptId(), s, workspace));
                    assertEquals("failed", result.status()); assertEquals("data_format_invalid", result.error());
                    assertEquals("data_format_invalid", result.diagnostics().getLast().code());
                    assertEquals(0, remote.posts); assertEquals(0, remote.uploadAttempts);
                    assertFalse(new Gson().toJson(result).contains("Erika"));
                }
            }
        }
    }

    @Test void nativeAttemptValidatesRecipientTestCertificateBeforeWritingAndDoesNotErasePriorSuccess() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                var original = input(null, null);
                var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE,
                        original.serviceName(), original.region(), SCHEMA, "application/json", DATA, original.attachments(), null, null);
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var access = new SendAccess(api, remote);
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                    remote.omitCertificate = true;
                    var first = access.prepare(request);
                    var failed = adapters.withSession(api, session, s -> access.execute(first.attemptId(), s, workspace));
                    assertEquals("failed", failed.status());
                    assertEquals("test_certificate_required", failed.error());
                    assertEquals(0, remote.posts);
                    remote.omitCertificate = false;
                    var second = access.prepare(request);
                    var sent = adapters.withSession(api, session, s -> access.execute(second.attemptId(), s, workspace));
                    assertEquals("sent", sent.status());
                    assertEquals(SUBMISSION.toString(), sent.submissionId());
                    assertEquals(sent, access.state());
                    assertThrows(SessionException.class, () -> access.execute(second.attemptId(), session, workspace));
                    assertEquals(1, remote.posts);
                }
            }
        }
    }

    @Test void stagedFilesTravelThroughStrictProtocolConfirmationAndBothRealSdkAdapters() throws Exception {
        for (ApiVersion api : ApiVersion.values()) for (boolean offerReply : new boolean[]{false, true}) {
            var capture = new Capture(api.wireValue()); capture.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
            capture.allowReplies = offerReply;
            try (var adapters = registry(); var store = new ContentStore(workspace);
                 var sessions = new SessionManager(adapters, (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                         ignored -> capture, store); var engine = new Engine(adapters, sessions)) {
                var session = sessions.open(api, SessionRole.ONLINE_SERVICE, "id", "secret");
                String data = staged(store, session.sessionId(), DATA);
                String attachment = staged(store, session.sessionId(), "Testanlage".getBytes(StandardCharsets.UTF_8));
                var draft = new JsonObject();
                draft.addProperty("destinationId", TARGET.toString());
                if (api == ApiVersion.V3) draft.addProperty("fromDestinationId", SOURCE.toString()); else draft.add("fromDestinationId", JsonNull.INSTANCE);
                draft.addProperty("serviceIdentifier", SERVICE); draft.addProperty("serviceName", "Synthetischer Antrag");
                draft.addProperty("region", "DE000000000000"); draft.addProperty("schemaUri", SCHEMA.toString());
                draft.addProperty("mimeType", "application/json"); draft.addProperty("contentId", data);
                draft.add("caseId", JsonNull.INSTANCE); draft.add("processMessage", JsonNull.INSTANCE);
                if (offerReply) {
                    var offer = new JsonObject(); offer.addProperty("schemaUri", REPLY_SCHEMA.toString()); offer.addProperty("mimeType", "application/xml");
                    draft.add("replyOffer", offer);
                }
                var item = new JsonObject(); item.addProperty("contentId", attachment); item.addProperty("fileName", "Anlage.txt");
                item.addProperty("mimeType", "text/plain"); item.addProperty("description", "Synthetische Beschreibung");
                var attachments = new JsonArray(); attachments.add(item); draft.add("attachments", attachments);
                var command = new JsonObject(); command.addProperty("protocolVersion", 1); command.addProperty("id", "send-test");
                command.addProperty("apiVersion", api.wireValue()); command.addProperty("sessionId", session.sessionId());
                command.addProperty("command", "prepare_send"); command.addProperty("sendDocument", draft.toString());
                if (offerReply) {
                    for (String invalid : List.of("{\"schemaUri\":\"/relative\",\"mimeType\":\"application/xml\"}",
                            "{\"schemaUri\":\"urn:test:reply\",\"mimeType\":\"text/html\"}",
                            "{\"schemaUri\":\"urn:test:reply\",\"mimeType\":\"application/json\",\"privateKey\":{}}")) {
                        var malformed = draft.deepCopy(); malformed.add("replyOffer", JsonParser.parseString(invalid));
                        command.addProperty("sendDocument", malformed.toString());
                        var denied = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
                        assertFalse(denied.get("ok").getAsBoolean(), denied.toString());
                        assertEquals("invalid_submission", denied.get("error").getAsString());
                        assertEquals(0, capture.posts);
                    }
                    command.addProperty("sendDocument", draft.toString());
                }
                var prepared = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
                assertTrue(prepared.get("ok").getAsBoolean(), prepared.toString());
                var payload = prepared.getAsJsonObject("result").getAsJsonObject("data");
                assertEquals(DATA.length, payload.getAsJsonObject("summary").get("dataBytes").getAsInt());
                if (offerReply) assertEquals(draft.get("replyOffer"), payload.getAsJsonObject("summary").get("replyOffer"));
                else assertTrue(payload.getAsJsonObject("summary").get("replyOffer").isJsonNull());
                assertFalse(payload.toString().contains("givenName")); assertFalse(payload.toString().contains("sdk-"));
                assertEquals(0, capture.posts, "Preparation cannot write to FIT-Connect");
                // Confirmation binds immutable bytes, even if the staging handle is discarded meanwhile.
                store.discard(session.sessionId(), data);
                command.remove("sendDocument"); command.addProperty("command", "execute_send");
                command.addProperty("attemptId", payload.getAsJsonObject("attempt").get("attemptId").getAsString());
                var outcome = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
                assertEquals("sent", outcome.getAsJsonObject("result").getAsJsonObject("data").get("status").getAsString(), outcome.toString());
                assertArrayEquals(DATA, decrypt(capture.submitted.get("encryptedData").getAsString()));
                assertFalse(JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject().get("ok").getAsBoolean());
                assertEquals(1, capture.posts);
                command.remove("attemptId"); command.addProperty("command", "list_reply_channels");
                var channelsResult = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
                assertTrue(channelsResult.get("ok").getAsBoolean(), channelsResult.toString());
                var channels = channelsResult.getAsJsonObject("result").getAsJsonObject("data").getAsJsonArray("channels");
                assertEquals(offerReply ? 1 : 0, channels.size());
                if (offerReply) {
                    var channel = channels.get(0).getAsJsonObject();
                    assertEquals("bound", channel.get("status").getAsString());
                    assertEquals(outcome.getAsJsonObject("result").getAsJsonObject("data").get("caseId"), channel.get("caseId"));
                    assertEquals("reply-key:" + payload.getAsJsonObject("attempt").get("attemptId").getAsString(), channel.get("keyId").getAsString());
                    assertEquals(Set.of("attemptId", "destinationId", "fromDestinationId", "caseId", "submissionId", "keyId", "status"), channel.keySet());
                    checkReplyReceiveProtocol(engine, sessions, store, session, api, capture, channel);
                }
                try (var files = Files.list(store.workspace(session.sessionId()))) { assertEquals(0, files.count()); }
            }
            try (var roots = Files.list(workspace)) { assertEquals(0, roots.count()); }
        }
    }

    private void checkReplyReceiveProtocol(Engine engine, SessionManager sessions, ContentStore store, SessionSnapshot active,
            ApiVersion api, Capture capture, JsonObject channel) throws Exception {
        var metadata = JsonParser.parseString(new String(decrypt(capture.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8));
        var fixture = new IncomingReplyFixture(api, findJsonObject(metadata, "kid", channel.get("keyId").getAsString()), "application/xml", api == ApiVersion.V3);
        capture.incoming = fixture;
        var command = new JsonObject(); command.addProperty("protocolVersion", 1); command.addProperty("id", "reply-receive");
        command.addProperty("apiVersion", api.wireValue()); command.addProperty("sessionId", active.sessionId());
        command.addProperty("command", "verify_reply"); command.addProperty("caseId", CASE.toString()); command.addProperty("replyId", fixture.replyId.toString());
        command.addProperty("schemaDocument", "{\"schemas\":[]}");
        var missingSchema = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
        assertFalse(missingSchema.get("ok").getAsBoolean(), missingSchema.toString());
        assertEquals("schema_consent_required", missingSchema.get("error").getAsString());
        // This synthetic URN has no remote source. Stage its XSD through the same native contract as the UI.
        String schemaId = staged(store, active.sessionId(), fixture.schemas().get(REPLY_SCHEMA.toString()).getBytes(StandardCharsets.UTF_8));
        var schema = new JsonObject(); schema.addProperty("uri", REPLY_SCHEMA.toString()); schema.addProperty("contentId", schemaId);
        var schemaRows = new JsonArray(); schemaRows.add(schema);
        var schemaDocument = new JsonObject(); schemaDocument.add("schemas", schemaRows);
        command.addProperty("schemaDocument", schemaDocument.toString());
        var summary = protocolData(engine, command); String proof = summary.get("proofId").getAsString();
        assertEquals(fixture.replyId.toString(), summary.get("replyId").getAsString()); assertEquals(CASE.toString(), summary.get("caseId").getAsString());
        assertEquals(channel.get("attemptId"), summary.get("channelAttemptId")); assertFalse(summary.has("submissionId")); assertFalse(summary.toString().contains("Erika"));
        var list = command.deepCopy(); list.remove("caseId"); list.remove("replyId"); list.remove("schemaDocument");
        list.addProperty("command", "list_received_reply_contents"); list.addProperty("proofId", proof); list.addProperty("offset", 0);
        var page = protocolData(engine, list); assertEquals(3, page.get("total").getAsInt());
        var read = list.deepCopy(); read.remove("offset"); read.addProperty("command", "read_received_reply_content"); read.addProperty("byteOffset", 0);
        read.addProperty("contentId", page.getAsJsonArray("parts").get(1).getAsJsonObject().get("contentId").getAsString());
        assertArrayEquals(fixture.data, Base64.getDecoder().decode(protocolData(engine, read).get("chunk").getAsString()));
        var logCommand = command.deepCopy(); logCommand.remove("schemaDocument"); logCommand.addProperty("command", "load_reply_event_log");
        var logSummary = protocolData(engine, logCommand); assertEquals(fixture.replyId.toString(), logSummary.get("replyId").getAsString());
        assertFalse(logSummary.has("submissionId")); assertFalse(logSummary.has("destinationId"));
        var logList = logCommand.deepCopy(); logList.remove("caseId"); logList.remove("replyId"); logList.addProperty("command", "list_event_log");
        logList.addProperty("logId", logSummary.get("logId").getAsString()); logList.addProperty("offset", 0);
        assertEquals(2, protocolData(engine, logList).getAsJsonArray("events").size());
        // Inspecting the independently verified reply log preserves the content proof.
        protocolData(engine, read);
        assertEquals(proof, protocolData(engine, list).get("proofId").getAsString(), "Preview read retains verification");
        var wrong = list.deepCopy(); wrong.addProperty("command", "list_received_contents"); assertProtocolFailure(engine, wrong);
        wrong = list.deepCopy(); wrong.addProperty("offset", 1); assertProtocolFailure(engine, wrong);
        wrong = list.deepCopy(); wrong.addProperty("apiVersion", api == ApiVersion.V2 ? "v3" : "v2"); assertProtocolFailure(engine, wrong);
        wrong = command.deepCopy(); wrong.addProperty("privateKey", "not-allowed"); assertProtocolFailure(engine, wrong);
        var failed = command.deepCopy(); failed.addProperty("schemaDocument", "{\"schemas\":[],\"extra\":true}"); assertProtocolFailure(engine, failed);
        assertProtocolFailure(engine, read);
        protocolData(engine, command); fixture.attack = "ciphertext"; assertProtocolFailure(engine, command);
        fixture.attack = ""; summary = protocolData(engine, command); list.addProperty("proofId", summary.get("proofId").getAsString());
        list.addProperty("offset", 2); assertEquals("Synthetische Antwortanlage", protocolData(engine, list).getAsJsonArray("parts").get(0).getAsJsonObject().get("description").getAsString());
        var other = sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "other", "secret");
        wrong = list.deepCopy(); wrong.addProperty("sessionId", other.sessionId()); assertProtocolFailure(engine, wrong);
        failed = command.deepCopy(); failed.addProperty("sessionId", other.sessionId()); assertProtocolFailure(engine, failed);
        assertProtocolFailure(engine, list); // Even a failed receive on another owner replaces the single global snapshot.
        summary = protocolData(engine, command);
        var discard = list.deepCopy(); discard.remove("offset"); discard.addProperty("proofId", summary.get("proofId").getAsString()); discard.addProperty("command", "discard_received_reply");
        protocolData(engine, discard); list.addProperty("proofId", summary.get("proofId").getAsString()); assertProtocolFailure(engine, list);
        try (var files = Files.list(store.workspace(active.sessionId()))) { assertEquals(0, files.count()); }
        assertEquals(1, ((SessionManager.ReplyChannels)sessions.replyChannels(api, active.sessionId()).data()).channels().size(), "Reading/discarding reply contents preserves its native key");
        store.discard(active.sessionId(), schemaId);
    }
    private static JsonObject protocolData(Engine engine, JsonObject command) {
        var result = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
        assertTrue(result.get("ok").getAsBoolean(), result.toString()); return result.getAsJsonObject("result").getAsJsonObject("data");
    }
    private static void assertProtocolFailure(Engine engine, JsonObject command) {
        var result = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject(); assertFalse(result.get("ok").getAsBoolean(), result.toString());
    }

    @Test void expiredOrCancelledConfirmationAndWrongSourcePermissionsCannotWrite() throws Exception {
        var time = new java.util.concurrent.atomic.AtomicLong();
        var remote = new Capture(); var access = new SendAccess(ApiVersion.V3, remote, time::get);
        var prepared = access.prepare(input(null, null));
        assertTrue(access.pendingBytes() > 0);
        time.set(60_000);
        assertEquals(0, access.pendingBytes(), "Expired confirmations release their native reservation");
        assertEquals("confirmation_expired", access.execute(prepared.attemptId(), null, workspace).error());
        assertEquals(0, remote.posts);
        prepared = access.prepare(input(null, null)); access.cancel(prepared.attemptId());
        String cancelled = prepared.attemptId();
        assertThrows(SessionException.class, () -> access.execute(cancelled, null, workspace));
        try (var adapters = registry()) {
            remote.denySource = true;
            var next = access.prepare(input(null, null));
            try (var session = adapters.openSession(ApiVersion.V3, "id", "secret", (u, b) ->
                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                assertEquals("failed", adapters.withSession(ApiVersion.V3, session, s -> access.execute(next.attemptId(), s, workspace)).status());
                assertEquals("resource_denied", access.state().error());
                assertEquals(0, remote.posts);
            }
        }
    }

    @Test void senderHttpRoutesRejectProductionWrongApiExtraQueriesAndArbitraryMethods() {
        String base = "https://test.fit-connect.fitko.dev/submission-api/v3/submissions";
        assertEquals(base, SendHttpTransport.allowed(ApiVersion.V3, "POST", base).toString());
        for (String url : List.of(base.replace("test.fit-connect.fitko.dev", "prod.fit-connect.fitko.net"),
                base.replace("/v3/", "/v2/"), base + "?foo=1", base + "#fragment", base.replace("https:", "http:"),
                base.replace("test.fit-connect.fitko.dev", "test.fit-connect.fitko.dev@evil.invalid")))
            assertThrows(SessionException.class, () -> SendHttpTransport.allowed(ApiVersion.V3, "POST", url));
        assertThrows(SessionException.class, () -> SendHttpTransport.allowed(ApiVersion.V3, "DELETE", base));
    }

    private static String staged(ContentStore content, String owner, byte[] bytes) {
        var file = content.begin(owner, bytes.length);
        for (int offset = 0; offset < bytes.length; offset += ContentStore.CHUNK_BYTES)
            content.append(owner, file.contentId(), offset, Base64.getEncoder().encodeToString(
                    Arrays.copyOfRange(bytes, offset, Math.min(bytes.length, offset + ContentStore.CHUNK_BYTES))));
        return file.contentId();
    }

    @Test void preparedSnapshotsShareOneGlobalBudgetEvenAfterTheirStagingFilesAreDiscarded() throws Exception {
        try (var adapters = registry(); var store = new ContentStore(workspace);
             var sessions = new SessionManager(adapters, (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                     ignored -> (u, h) -> { throw new AssertionError("Preparation is local"); }, store)) {
            var a = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "id", "secret");
            var b = sessions.open(ApiVersion.V3, SessionRole.ONLINE_SERVICE, "id", "secret");
            var c = sessions.open(ApiVersion.V2, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret");
            byte[] bytes = new byte[32 * 1024 * 1024]; Arrays.fill(bytes, (byte) 'a');
            var approvals = new ArrayList<SessionManager.Prepared>();
            for (var active : List.of(a, b)) {
                ApiVersion api = ApiVersion.parse(active.apiVersion());
                String handle = staged(store, active.sessionId(), bytes);
                approvals.add((SessionManager.Prepared) sessions.prepareSend(api, active.sessionId(), draftDocument(api, handle)).data());
                store.discard(active.sessionId(), handle);
            }
            String small = staged(store, c.sessionId(), "{}".getBytes(StandardCharsets.UTF_8));
            assertEquals("content_limit", assertThrows(SessionException.class,
                    () -> sessions.prepareSend(ApiVersion.V2, c.sessionId(), draftDocument(ApiVersion.V2, small))).code());
            assertEquals(approvals.getFirst().attempt().attemptId(), ((SendAccess.State) sessions.send(ApiVersion.V2, a.sessionId(), "send_state", null).data()).attemptId());
            sessions.send(ApiVersion.V2, a.sessionId(), "cancel_send", approvals.getFirst().attempt().attemptId());
            assertEquals("prepared", ((SessionManager.Prepared) sessions.prepareSend(ApiVersion.V2, c.sessionId(), draftDocument(ApiVersion.V2, small)).data()).attempt().status());
        }
        try (var roots = Files.list(workspace)) { assertEquals(0, roots.count()); }
    }

    private static String draftDocument(ApiVersion api, String handle) {
        var draft = new JsonObject(); draft.addProperty("destinationId", TARGET.toString());
        if (api == ApiVersion.V3) draft.addProperty("fromDestinationId", SOURCE.toString()); else draft.add("fromDestinationId", JsonNull.INSTANCE);
        draft.addProperty("serviceIdentifier", SERVICE); draft.addProperty("serviceName", "Test"); draft.addProperty("region", "DE000000000000");
        draft.addProperty("schemaUri", SCHEMA.toString()); draft.addProperty("mimeType", "application/json"); draft.addProperty("contentId", handle);
        draft.add("caseId", JsonNull.INSTANCE); draft.add("processMessage", JsonNull.INSTANCE); draft.add("attachments", new JsonArray());
        return draft.toString();
    }

    @Test void bothSdkAdaptersHandleXmlAndRejectDoctypeBeforeAnnouncing() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                for (boolean doctype : List.of(false, true)) {
                    var capture = new Capture(api.wireValue()); capture.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                    capture.dataMimeType = "application/xml";
                    byte[] bytes = ((doctype ? "<!DOCTYPE antrag SYSTEM 'file:///synthetic-does-not-exist'>" : "")
                            + "<antrag><vorname>Erika</vorname></antrag>").getBytes(StandardCharsets.UTF_8);
                    var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, "Test", null,
                            SCHEMA, "application/xml", bytes, List.of(), null, null);
                    var access = new SendAccess(api, capture);
                    try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                        var prepared = access.prepare(request);
                        var result = adapters.withSession(api, session, s -> access.execute(prepared.attemptId(), s, workspace));
                        assertEquals(doctype ? "failed" : "sent", result.status(), api + ": " + result.error());
                        assertEquals(doctype ? 0 : 1, capture.posts);
                        if (!doctype) assertArrayEquals(bytes, decrypt(capture.submitted.get("encryptedData").getAsString()));
                    }
                }
            }
        }
    }

    @Test void maximumPayloadFitsTheDesktopHeapForBothSdkVersions() throws Exception {
        String startup = Files.readString(Path.of("../../desktop/src/main.rs"));
        var setting = java.util.regex.Pattern.compile("command\\.arg\\(\"(-Xmx[0-9]+m)\"\\)").matcher(startup);
        assertTrue(setting.find(), "The probe must use the actual desktop JVM heap setting");
        String heap = setting.group(1);
        assertTrue(Integer.parseInt(heap.substring(4, heap.length() - 1)) <= 512, "The native heap budget must not silently grow beyond 512 MiB");
        String executable = System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java";
        for (ApiVersion api : ApiVersion.values()) {
            Path directory = Files.createDirectory(workspace.resolve(api.wireValue()));
            Path output = workspace.resolve(api.wireValue() + ".log");
            var builder = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(), heap,
                    "-cp", System.getProperty("java.class.path"), SenderKernelTest.class.getName(), api.wireValue(), directory.toString())
                    .redirectErrorStream(true).redirectOutput(output.toFile());
            for (String key : List.of("JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH")) builder.environment().remove(key);
            Process probe = builder.start();
            if (!probe.waitFor(120, TimeUnit.SECONDS)) { probe.destroyForcibly(); fail("Bounded sender probe exceeded its time limit"); }
            String evidence = Files.readString(output);
            System.out.println(api + " bounded sender: " + evidence.strip());
            assertEquals(0, probe.exitValue(), api + ": " + evidence);
            assertTrue(evidence.contains("status=sent"), evidence);
            assertTrue(evidence.contains("bytes=67108864"), evidence);
        }
    }

    @Test void bothSdkFragmentListsReconstructTheOriginalAttachmentAndMatchItsMetadataHash() throws Exception {
        byte[] attachment = new byte[10 * 1024 * 1024]; new Random(42).nextBytes(attachment);
        try (var adapters = registry(); var content = new ContentStore(workspace)) {
            for (ApiVersion api : ApiVersion.values()) {
                var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var access = new SendAccess(api, remote);
                var request = new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, "Test", "DE000000000000",
                        SCHEMA, "application/json", DATA, List.of(new SubmissionInput.Attachment("Anlage.bin", "application/octet-stream", "Fragmentiert", attachment)), null, null);
                Path sdkWorkspace = content.workspace(api.wireValue());
                try (var session = adapters.openSession(api, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                    var prepared = access.prepare(request);
                    assertEquals("sent", adapters.withSession(api, session, s -> access.execute(prepared.attemptId(), s, sdkWorkspace)).status());
                    var metadata = JsonParser.parseString(new String(decrypt(remote.submitted.get("encryptedMetadata").getAsString()), StandardCharsets.UTF_8)).getAsJsonObject();
                    var item = metadata.getAsJsonObject("contentStructure").getAsJsonArray("attachments").get(0).getAsJsonObject();
                    assertEquals("Anlage.bin", item.get("filename").getAsString());
                    assertEquals("Fragmentiert", item.get("description").getAsString());
                    var fragments = item.getAsJsonArray("fragments");
                    assertTrue(fragments.size() > 1); assertEquals(fragments.size(), remote.uploads.size());
                    int offset = 0;
                    var digest = MessageDigest.getInstance("SHA-512");
                    for (var fragment : fragments) {
                        String endpoint = remote.BASE + "/submissions/" + SUBMISSION + "/attachments/" + fragment.getAsString();
                        byte[] bytes = decrypt(remote.uploads.get(endpoint));
                        assertTrue(bytes.length <= 4 * 1024 * 1024);
                        assertArrayEquals(Arrays.copyOfRange(attachment, offset, offset + bytes.length), bytes);
                        offset += bytes.length; digest.update(bytes);
                    }
                    assertEquals(attachment.length, offset);
                    assertEquals(HexFormat.of().formatHex(digest.digest()), item.getAsJsonObject("hash").get("content").getAsString());
                }
                content.clearWorkspace(api.wireValue());
                try (var files = Files.list(sdkWorkspace)) { assertEquals(0, files.count()); }
            }
        }
        try (var roots = Files.list(workspace)) { assertEquals(0, roots.count()); }
    }

    /** Separate bounded JVM, synthetic input and HTTP sink, no FIT-Connect connection. */
    public static void main(String[] args) throws Exception {
        try {
            ApiVersion api = ApiVersion.parse(args[0]); Path directory = Path.of(args[1]);
            fixture(directory);
            var remote = new Capture(api.wireValue()); remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
            remote.countOnly = true;
            try (var adapters = registry(); var content = new ContentStore(directory)) {
                ApiVersion otherApi = api == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2;
                var otherRemote = new Capture(otherApi.wireValue()); otherRemote.metadata = otherApi == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var otherAccess = new SendAccess(otherApi, otherRemote);
                try (var otherSession = adapters.openSession(otherApi, "synthetic-id", "synthetic-secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", otherAccess)) {
                    var original = input(null, null);
                    var warm = new SubmissionInput(otherApi == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, original.serviceName(),
                            original.region(), SCHEMA, "application/json", DATA, original.attachments(), null, null);
                    var first = otherAccess.prepare(warm);
                    var warmed = adapters.withSession(otherApi, otherSession, s -> otherAccess.execute(first.attemptId(), s, content.workspace("warm")));
                    if (!warmed.status().equals("sent")) throw new IllegalStateException("Other SDK could not be initialized");
                    var access = new SendAccess(api, remote);
                    var prepared = access.prepare(maximumInput(api));
                    try (var session = adapters.openSession(api, "synthetic-id", "synthetic-secret", (u, b) ->
                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", access)) {
                        var result = adapters.withSession(api, session, s -> access.execute(prepared.attemptId(), s, content.workspace("probe")));
                        System.out.println("status=" + result.status() + " error=" + result.error() + " bytes=67108864 maxHeapBytes="
                                + Runtime.getRuntime().maxMemory() + " usedHeapBytesAtCompletion=" + ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed()
                                + " uploads=" + remote.uploadAttempts + " encryptedCharacters=" + remote.encryptedCharacters
                                + " maxUploadBytes=" + remote.maxUploadBytes);
                        if (!result.status().equals("sent") || remote.encryptedCharacters < 64L * 1024 * 1024
                                || remote.uploadAttempts <= 2 || remote.maxUploadBytes > 8 * 1024 * 1024) System.exit(3);
                    }
                }
            }
        } catch (OutOfMemoryError failure) { System.err.println("heap_exhausted"); System.exit(5); }
    }

    private static SubmissionInput maximumInput(ApiVersion api) {
        byte[] data = new byte[32 * 1024 * 1024], attachment = new byte[32 * 1024 * 1024];
        var random = new Random(42); random.nextBytes(data); random.nextBytes(attachment);
        for (int i = 0; i < data.length; i++) data[i] = (byte) ('a' + (data[i] & 255) % 26);
        byte[] prefix = "{\"payload\":\"".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(prefix, 0, data, 0, prefix.length); data[data.length - 2] = '"'; data[data.length - 1] = '}';
        return new SubmissionInput(api == ApiVersion.V3 ? SOURCE : null, TARGET, SERVICE, "Synthetic maximum", "DE000000000000",
                SCHEMA, "application/json", data, List.of(new SubmissionInput.Attachment("synthetic.bin", "application/octet-stream", null, attachment)), null, null);
    }

    @Test void v2RejectsMetadataOneFallbackAndExplicitSourceOrProcessAddressing() throws Exception {
        try (var adapters = registry()) {
            for (int invalid = 0; invalid < 3; invalid++) {
                var exchange = new Capture("v2"); exchange.metadata = invalid == 0 ? "1.0.0" : "2.0.0";
                var original = input(null, null);
                var request = new SubmissionInput(invalid == 1 ? SOURCE : null, TARGET, SERVICE, original.serviceName(), original.region(), SCHEMA,
                        "application/json", DATA, original.attachments(), null,
                        invalid == 2 ? new SubmissionInput.ProcessMessage("urn:test:process", "request") : null);
                try (var session = adapters.openSession(ApiVersion.V2, "id", "secret", (u, b) ->
                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", exchange)) {
                    assertThrows(SessionException.class, () -> adapters.withSession(ApiVersion.V2, session, s -> s.send(request, workspace)));
                    assertEquals(0, exchange.posts);
                }
            }
        }
    }

    private static byte[] decrypt(String jwe) throws Exception {
        String[] parts = jwe.split("\\.", -1); assertEquals(5, parts.length);
        var decoder = Base64.getUrlDecoder();
        var header = JsonParser.parseString(new String(decoder.decode(parts[0]), StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals("RSA-OAEP-256", header.get("alg").getAsString());
        assertEquals("A256GCM", header.get("enc").getAsString());
        assertEquals("synthetic-encrypt", header.get("kid").getAsString());
        var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(Cipher.DECRYPT_MODE, privateKey, new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        byte[] key = rsa.doFinal(decoder.decode(parts[1]));
        var aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, decoder.decode(parts[2])));
        aes.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
        byte[] ciphertext = decoder.decode(parts[3]), tag = decoder.decode(parts[4]);
        byte[] combined = Arrays.copyOf(ciphertext, ciphertext.length + tag.length);
        System.arraycopy(tag, 0, combined, ciphertext.length, tag.length);
        return aes.doFinal(combined);
    }

    private static final class Capture implements ResourceExchange {
        private final String BASE;
        Capture() { this("v3"); }
        Capture(String version) { BASE = "https://test.fit-connect.fitko.dev/submission-api/" + version; }
        int posts;
        int uploadAttempts;
        boolean failUpload;
        boolean loseAnnouncement;
        boolean omitCertificate;
        boolean denySource;
        boolean countOnly;
        long encryptedCharacters;
        int maxUploadBytes;
        int wireChecksum;
        String metadata = "3.0.0";
        String dataMimeType = "application/json";
        boolean offerService = true;
        boolean allowReplies;
        JsonObject announce, submitted;
        ResourceExchange incoming;
        final Map<String,String> uploads = new HashMap<>();
        public String get(String url, Map<String,String> headers) { return request("GET", url, headers, null).body(); }
        public Response request(String method, String url, Map<String,String> headers, String body) {
            if (incoming != null && method.equals("GET") && (url.contains("/replies/") || url.contains("/events?")
                    || url.endsWith("/cases/" + CASE) || url.endsWith("/.well-known/jwks.json"))) return new Response(200, incoming.get(url, headers));
            if (url.equals("https://test.fit-connect.fitko.dev/destination-api/v3/destinations/" + SOURCE)) {
                if (denySource) return new Response(403, "{}");
                assertEquals("GET", method);
                assertEquals("Bearer synthetic-token", headers.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase("Authorization")).map(Map.Entry::getValue).findFirst().orElse(null));
                return new Response(200, "{\"destinationId\":\"" + SOURCE + "\"}");
            }
            assertTrue(url.startsWith(BASE + "/"), "Every SDK resource call stays on TEST/v3");
            if (method.equals("GET")) {
                headers.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase("Authorization"))
                        .forEach(e -> assertEquals("Bearer synthetic-token", e.getValue()));
                if (url.equals(BASE + "/cases?offset=0&limit=1")) return new Response(200,
                        "{\"offset\":0,\"totalCount\":0,\"count\":0,\"cases\":[]}");
                if (url.equals(BASE + "/destinations/" + SOURCE)) return new Response(200,
                        "{\"destinationId\":\"" + SOURCE + "\",\"type\":\"C\",\"status\":\"active\"}");
                if (url.equals(BASE + "/destinations/" + TARGET)) return new Response(200,
                        "{\"destinationId\":\"" + TARGET + "\",\"type\":\"A\",\"status\":\"active\",\"encryptionKid\":\"synthetic-encrypt\",\"metadataVersions\":[\"" + metadata
                        + "\"],\"publicServices\":" + (offerService ? "[{\"identifier\":\"" + SERVICE + "\",\"regions\":[\"DE000000000000\"],\"submissionSchemas\":[{\"schemaUri\":\"" + SCHEMA + "\",\"mimeType\":\"" + dataMimeType + "\"}]"
                        + (allowReplies ? ",\"replyChannels\":{\"fitConnect\":{\"processStandards\":[\"" + REPLY_SCHEMA + "\"]}}" : "") + "}]" : "[]")
                        + ",\"processMessages\":[{\"processModelId\":\"urn:test:process\",\"messageId\":\"request\",\"regions\":[\"DE000000000000\"],\"schemas\":[{\"schemaUri\":\"" + SCHEMA + "\",\"mimeType\":\"application/json\"}]}]}");
                if (url.equals(BASE + "/destinations/" + TARGET + "/keys/synthetic-encrypt")) {
                    var key = publicKey.deepCopy(); if (omitCertificate) key.remove("x5c");
                    return new Response(200, key.toString());
                }
                if (BASE.endsWith("v2")) {
                    assertEquals(BASE + "/destinations/" + TARGET + "/limits", url);
                    return new Response(200, "{\"attachments\":{\"submission\":{\"applicable\":" + limits() + "}}}");
                }
                assertEquals(BASE + "/limits/" + SOURCE + "/" + TARGET, url);
                return new Response(200, "{\"attachments\":{\"applicable\":" + limits() + "}}");
            }
            assertEquals("Bearer synthetic-token", headers.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase("Authorization")).map(Map.Entry::getValue).findFirst().orElse(null));
            if (method.equals("POST")) {
                assertEquals(BASE + "/submissions", url); posts++;
                announce = JsonParser.parseString(body).getAsJsonObject();
                if (loseAnnouncement) throw new SessionException("resource_unavailable");
                return new Response(201, response());
            }
            assertEquals("PUT", method);
            if (url.contains("/attachments/")) {
                uploadAttempts++;
                assertTrue(announce.getAsJsonArray("announcedAttachments").asList().stream()
                        .anyMatch(id -> url.equals(BASE + "/submissions/" + SUBMISSION + "/attachments/" + id.getAsString())));
                if (failUpload) throw new SessionException("resource_unavailable");
                if (countOnly) {
                    encryptedCharacters += body.length();
                    byte[] wire = body.getBytes(StandardCharsets.UTF_8); // Account for the native HTTP byte allocation.
                    maxUploadBytes = Math.max(maxUploadBytes, wire.length);
                    if (wire.length > 8 * 1024 * 1024) throw new SessionException("invalid_submission");
                    wireChecksum ^= Arrays.hashCode(wire);
                } else uploads.put(url, body);
                return new Response(204, "");
            }
            assertEquals(BASE + "/submissions/" + SUBMISSION, url);
            if (countOnly) wireChecksum ^= Arrays.hashCode(body.getBytes(StandardCharsets.UTF_8));
            else submitted = JsonParser.parseString(body).getAsJsonObject();
            return new Response(200, response());
        }
        private String response() {
            var response = new JsonObject();
            response.addProperty("destinationId", TARGET.toString()); response.addProperty("fromDestinationId", SOURCE.toString());
            response.addProperty("submissionId", SUBMISSION.toString()); response.addProperty("caseId", CASE.toString());
            response.add("attachments", announce.get("announcedAttachments"));
            return response.toString();
        }
        private String limits() {
            return "{\"maxNumber\":40,\"maxSizeIndividualBytes\":" + (countOnly ? 8388608 : 33554432)
                    + ",\"maxSizeAggregateBytes\":" + (countOnly ? 134217728 : 67108864) + "}";
        }
    }
}
