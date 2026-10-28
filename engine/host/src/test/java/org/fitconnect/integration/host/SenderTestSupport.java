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
import java.security.spec.PSSParameterSpec;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

abstract class SenderTestSupport {
    static final UUID SOURCE = UUID.fromString("11111111-1111-4111-8111-111111111111");
    static final UUID TARGET = UUID.fromString("22222222-2222-4222-8222-222222222222");
    static final UUID SUBMISSION = UUID.fromString("33333333-3333-4333-8333-333333333333");
    static final UUID CASE = UUID.fromString("44444444-4444-4444-8444-444444444444");
    static final String SERVICE = "urn:de:fim:leika:leistung:99008001014002";
    static final URI SCHEMA = URI.create("https://example.invalid/schema.json");
    static final URI REPLY_SCHEMA = URI.create("urn:test:reply-schema");
    static final byte[] DATA =
            "{\"givenName\":\"Erika\",\"familyName\":\"Musterfrau\"}"
                    .getBytes(StandardCharsets.UTF_8);
    static RSAPrivateCrtKey privateKey;
    static JsonObject publicKey;
    @TempDir Path workspace;

    @BeforeAll
    static void fixture(@TempDir Path directory) throws Exception {
        if (privateKey != null) return;
        NativeResourceTest.syntheticKey(directory);
        var store = KeyStore.getInstance("PKCS12");
        try (var in = Files.newInputStream(directory.resolve("synthetic.p12"))) {
            store.load(in, "synthetic-test-only".toCharArray());
        }
        privateKey =
                (RSAPrivateCrtKey) store.getKey("synthetic", "synthetic-test-only".toCharArray());
        publicKey = new JsonObject();
        for (var entry :
                Map.of(
                                "kty",
                                "RSA",
                                "kid",
                                "synthetic-encrypt",
                                "alg",
                                "RSA-OAEP-256",
                                "use",
                                "enc",
                                "n",
                                integer(privateKey.getModulus()),
                                "e",
                                integer(privateKey.getPublicExponent()))
                        .entrySet()) publicKey.addProperty(entry.getKey(), entry.getValue());
        var x5c = new JsonArray();
        x5c.add(Base64.getEncoder().encodeToString(store.getCertificate("synthetic").getEncoded()));
        publicKey.add("x5c", x5c);
        var ops = new JsonArray();
        ops.add("wrapKey");
        publicKey.add("key_ops", ops);
    }

    static String integer(BigInteger value) {
        byte[] bytes = value.toByteArray();
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes[0] == 0 ? Arrays.copyOfRange(bytes, 1, bytes.length) : bytes);
    }

    static AdapterRegistry registry() {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    static SubmissionInput input(SubmissionInput.ProcessMessage process, UUID caseId) {
        return new SubmissionInput(
                SOURCE,
                TARGET,
                SERVICE,
                "Synthetischer Antrag",
                "DE000000000000",
                SCHEMA,
                "application/json",
                DATA,
                List.of(
                        new SubmissionInput.Attachment(
                                "Anlage.txt",
                                "text/plain",
                                "Synthetische Beschreibung",
                                "Testanlage".getBytes(StandardCharsets.UTF_8))),
                caseId,
                process);
    }

    static SubmissionInput replyInput(ApiVersion api) {
        return new SubmissionInput(
                api == ApiVersion.V3 ? SOURCE : null,
                TARGET,
                SERVICE,
                "Synthetischer Antrag",
                "DE000000000000",
                SCHEMA,
                "application/json",
                DATA,
                List.of(new SubmissionInput.Attachment("Anlage.txt", "text/plain", null, DATA)),
                null,
                null,
                new SubmissionInput.ReplyOffer(REPLY_SCHEMA, "application/xml"));
    }

    static JsonObject findJsonObject(JsonElement value, String field, String expected) {
        if (value.isJsonObject()) {
            var object = value.getAsJsonObject();
            if (object.has(field)
                    && object.get(field).isJsonPrimitive()
                    && expected.equals(object.get(field).getAsString())) return object;
            for (var child : object.entrySet()) {
                var found = findJsonObject(child.getValue(), field, expected);
                if (found != null) return found;
            }
        } else if (value.isJsonArray())
            for (var child : value.getAsJsonArray()) {
                var found = findJsonObject(child, field, expected);
                if (found != null) return found;
            }
        else if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
            String text = value.getAsString();
            if (text.startsWith("{"))
                try {
                    return findJsonObject(JsonParser.parseString(text), field, expected);
                } catch (JsonParseException ignored) {
                }
        }
        return null;
    }

    void exerciseReplyRoundtrip(
            AdapterRegistry adapters,
            ApiVersion sending,
            AuthenticatedSession sender,
            ApiVersion receiving,
            AuthenticatedSession receiver,
            SenderCapture original,
            boolean processReply)
            throws Exception {
        var channel = sender.replyChannels().getFirst();
        var metadata =
                JsonParser.parseString(
                        new String(
                                decrypt(original.submitted.get("encryptedMetadata").getAsString()),
                                StandardCharsets.UTF_8));
        var offered = findJsonObject(metadata, "kid", channel.keyId()).deepCopy();
        var incoming = new SenderIncomingReplyFixture(sending, offered, "application/json", false);
        var uploads = new LinkedHashMap<String, String>();
        var submitted = new java.util.concurrent.atomic.AtomicReference<JsonObject>();
        var announceProcess = new java.util.concurrent.atomic.AtomicReference<JsonElement>();
        var announced = new java.util.concurrent.atomic.AtomicReference<JsonArray>();
        var posts = new java.util.concurrent.atomic.AtomicInteger();
        String base = "https://test.fit-connect.fitko.dev/submission-api/" + receiving.wireValue();
        ResourceExchange transport =
                new ResourceExchange() {
                    String response() {
                        return "{\"replyId\":\""
                                + incoming.replyId
                                + "\",\"caseId\":\""
                                + CASE
                                + "\",\"fromDestinationId\":\""
                                + TARGET
                                + "\",\"attachments\":[]}";
                    }

                    public String get(String url, Map<String, String> headers) {
                        return request("GET", url, headers, null).body();
                    }

                    public Response request(
                            String method, String url, Map<String, String> headers, String body) {
                        if (method.equals("GET")) {
                            if (url.equals(base + "/cases/" + CASE))
                                return new Response(
                                        200,
                                        "{\"caseId\":\""
                                                + CASE
                                                + "\",\"destinationId\":\""
                                                + TARGET
                                                + "\",\"fromDestinationId\":\""
                                                + SOURCE
                                                + "\"}");
                            if (url.contains("/destinations/") && !url.endsWith("/limits"))
                                return new Response(
                                        200,
                                        "{\"destinationId\":\""
                                                + url.substring(url.lastIndexOf('/') + 1)
                                                + "\",\"type\":\"A\",\"status\":\"active\",\"metadataVersions\":[\""
                                                + original.metadata
                                                + "\"],\"publicServices\":[]}");
                            if (url.endsWith("/limits") || url.contains("/limits/"))
                                return new Response(
                                        200,
                                        "{\"attachments\":{\"reply\":{\"applicable\":"
                                                + original.limits()
                                                + "},\"applicable\":"
                                                + original.limits()
                                                + "}}");
                        }
                        if (method.equals("POST") && url.equals(base + "/replies")) {
                            posts.incrementAndGet();
                            var announcement = JsonParser.parseString(body).getAsJsonObject();
                            announceProcess.set(announcement.get("processMessage"));
                            announced.set(announcement.getAsJsonArray("announcedAttachments"));
                            return new Response(201, response());
                        }
                        if (method.equals("PUT") && url.contains("/attachments/")) {
                            assertNull(uploads.put(url.substring(url.lastIndexOf('/') + 1), body));
                            return new Response(204, "");
                        }
                        if (method.equals("PUT")
                                && url.equals(base + "/replies/" + incoming.replyId)) {
                            assertNull(
                                    submitted.getAndSet(
                                            JsonParser.parseString(body).getAsJsonObject()));
                            return new Response(200, response());
                        }
                        throw new AssertionError(
                                "Unexpected roundtrip reply request: " + method + " " + url);
                    }
                };
        var reply =
                new ReplyInput(
                        TARGET,
                        SUBMISSION,
                        CASE,
                        REPLY_SCHEMA,
                        "application/json",
                        incoming.data,
                        List.of(
                                new SubmissionInput.Attachment(
                                        "Antwort.txt",
                                        "text/plain",
                                        "Synthetische Antwortanlage",
                                        incoming.attachment)),
                        processReply
                                ? new SubmissionInput.ProcessMessage(
                                        "urn:test:process", "supplement")
                                : null);
        var packet = new JsonObject();
        packet.addProperty("schemaPackage", 1);
        packet.addProperty("schemaUri", REPLY_SCHEMA.toString());
        var documents = new JsonObject();
        documents.add(
                REPLY_SCHEMA.toString(),
                JsonParser.parseString(incoming.schemas().get(REPLY_SCHEMA.toString())));
        packet.add("documents", documents);
        boolean schemaValid =
                adapters.withSession(
                        receiving,
                        receiver,
                        value ->
                                value.validateDraft(
                                        new SchemaSnapshot(
                                                REPLY_SCHEMA.toString(), packet.toString()),
                                        "application/json",
                                        incoming.data));
        assertTrue(schemaValid);
        var gate = new ReplyAccess(receiving, transport);
        var pending =
                gate.prepare(
                        reply, receiver.replyRecipient(TARGET.toString(), SUBMISSION.toString()));
        assertEquals(
                "sent",
                adapters.withSession(
                                receiving,
                                receiver,
                                value ->
                                        gate.execute(
                                                pending.attemptId(), value, workspace, () -> {}))
                        .status(),
                sending + " -> " + receiving + " reply send");
        assertEquals(1, posts.get());
        assertEquals(1, uploads.size());
        incoming.sdkReply = submitted.get().deepCopy();
        incoming.sdkReply.addProperty("replyId", incoming.replyId.toString());
        incoming.sdkReply.addProperty("caseId", CASE.toString());
        incoming.sdkReply.addProperty("fromDestinationId", TARGET.toString());
        incoming.sdkReply.add("attachments", announced.get());
        incoming.sdkUploads = uploads;
        if (processReply) incoming.sdkReply.add("processMessage", announceProcess.get());
        try (var read =
                ReceiveAccess.forReply(
                        sending, CASE.toString(), incoming.replyId.toString(), incoming)) {
            var result =
                    adapters.withSession(
                            sending,
                            sender,
                            value ->
                                    value.receiveReply(
                                            CASE,
                                            incoming.replyId,
                                            read,
                                            workspace,
                                            incoming.schemas()));
            assertArrayEquals(
                    incoming.data, result.data(), sending + " -> " + receiving + " -> " + sending);
            assertArrayEquals(incoming.attachment, result.attachments().getFirst().bytes());
        }
        if (processReply) {
            var saved = adapters.withSession(sending, sender, AuthenticatedSession::archiveKeys);
            try (var restarted =
                    adapters.openSession(
                            sending,
                            "id",
                            "secret",
                            (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                            incoming)) {
                for (var archive : saved)
                    adapters.withSession(
                            sending,
                            restarted,
                            value -> {
                                value.restoreReplyKey(archive, workspace);
                                return null;
                            });
                try (var read =
                        ReceiveAccess.forReply(
                                sending, CASE.toString(), incoming.replyId.toString(), incoming)) {
                    assertArrayEquals(
                            incoming.data,
                            adapters.withSession(
                                            sending,
                                            restarted,
                                            value ->
                                                    value.receiveReply(
                                                            CASE,
                                                            incoming.replyId,
                                                            read,
                                                            workspace,
                                                            incoming.schemas()))
                                    .data());
                }
            }
            var unoffered = announceProcess.get().deepCopy().getAsJsonObject();
            unoffered.addProperty("messageId", "unoffered");
            incoming.sdkReply.add("processMessage", unoffered);
            try (var read =
                    ReceiveAccess.forReply(
                            sending, CASE.toString(), incoming.replyId.toString(), incoming)) {
                assertThrows(
                        SessionException.class,
                        () ->
                                adapters.withSession(
                                        sending,
                                        sender,
                                        value ->
                                                value.receiveReply(
                                                        CASE,
                                                        incoming.replyId,
                                                        read,
                                                        workspace,
                                                        incoming.schemas())));
            }
            incoming.sdkReply.add("processMessage", announceProcess.get());
        }
        try (var read =
                new EventLogAccess(
                        sending, CASE.toString(), incoming.replyId.toString(), incoming, true)) {
            assertEquals(
                    2,
                    adapters.withSession(
                                    sending,
                                    sender,
                                    value ->
                                            value.replyEventLog(
                                                    CASE, incoming.replyId, read, workspace))
                            .entries()
                            .size());
        }
    }

    static String submissionEvent(String name, JsonObject tags) throws Exception {
        var claims = new JsonObject();
        claims.addProperty(
                "$schema",
                "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json");
        claims.addProperty("iss", "https://submission-api-testing.fit-connect.fitko.dev");
        claims.addProperty("jti", UUID.randomUUID().toString());
        claims.addProperty("iat", java.time.Instant.now().getEpochSecond() - 1);
        claims.addProperty("sub", "submission:" + SUBMISSION);
        claims.addProperty("txn", "case:" + CASE);
        var events = new JsonObject();
        var body = new JsonObject();
        if (tags != null) body.add("authenticationTags", tags);
        events.add("https://schema.fitko.de/fit-connect/events/" + name, body);
        claims.add("events", events);
        var b64 = Base64.getUrlEncoder().withoutPadding();
        String payload =
                b64.encodeToString(
                                "{\"alg\":\"PS512\",\"kid\":\"synthetic-server\",\"typ\":\"secevent+jwt\"}"
                                        .getBytes(StandardCharsets.UTF_8))
                        + "."
                        + b64.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
        var signature = Signature.getInstance("RSASSA-PSS");
        signature.setParameter(
                new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        signature.initSign(privateKey);
        signature.update(payload.getBytes(StandardCharsets.US_ASCII));
        return payload + "." + b64.encodeToString(signature.sign());
    }

    static void assertDataHash(JsonObject metadata) throws Exception {
        var hash =
                metadata.getAsJsonObject("contentStructure")
                        .getAsJsonObject("data")
                        .getAsJsonObject("hash");
        assertEquals("sha512", hash.get("type").getAsString());
        assertEquals(
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(DATA)),
                hash.get("content").getAsString());
    }

    void checkReplyReceiveProtocol(
            Engine engine,
            SessionManager sessions,
            ContentStore store,
            SessionSnapshot active,
            ApiVersion api,
            SenderCapture capture,
            JsonObject channel)
            throws Exception {
        var metadata =
                JsonParser.parseString(
                        new String(
                                decrypt(capture.submitted.get("encryptedMetadata").getAsString()),
                                StandardCharsets.UTF_8));
        var fixture =
                new SenderIncomingReplyFixture(
                        api,
                        findJsonObject(metadata, "kid", channel.get("keyId").getAsString()),
                        "application/xml",
                        api == ApiVersion.V3);
        capture.incoming = fixture;
        var command = new JsonObject();
        command.addProperty("protocolVersion", 1);
        command.addProperty("id", "reply-receive");
        command.addProperty("apiVersion", api.wireValue());
        command.addProperty("sessionId", active.sessionId());
        command.addProperty("command", "verify_reply");
        command.addProperty("caseId", CASE.toString());
        command.addProperty("replyId", fixture.replyId.toString());
        command.addProperty("schemaDocument", "{\"schemas\":[]}");
        var missingSchema =
                JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
        assertFalse(missingSchema.get("ok").getAsBoolean(), missingSchema.toString());
        assertEquals("schema_consent_required", missingSchema.get("error").getAsString());
        // This synthetic URN has no remote source. Stage its XSD through the same native contract
        // as the UI.
        String schemaId =
                staged(
                        store,
                        active.sessionId(),
                        fixture.schemas()
                                .get(REPLY_SCHEMA.toString())
                                .getBytes(StandardCharsets.UTF_8));
        var schema = new JsonObject();
        schema.addProperty("uri", REPLY_SCHEMA.toString());
        schema.addProperty("contentId", schemaId);
        var schemaRows = new JsonArray();
        schemaRows.add(schema);
        var schemaDocument = new JsonObject();
        schemaDocument.add("schemas", schemaRows);
        command.addProperty("schemaDocument", schemaDocument.toString());
        var summary = protocolData(engine, command);
        String proof = summary.get("proofId").getAsString();
        assertEquals(fixture.replyId.toString(), summary.get("replyId").getAsString());
        assertEquals(CASE.toString(), summary.get("caseId").getAsString());
        assertEquals(channel.get("attemptId"), summary.get("channelAttemptId"));
        assertFalse(summary.has("submissionId"));
        assertFalse(summary.toString().contains("Erika"));
        var list = command.deepCopy();
        list.remove("caseId");
        list.remove("replyId");
        list.remove("schemaDocument");
        list.addProperty("command", "list_received_reply_contents");
        list.addProperty("proofId", proof);
        list.addProperty("offset", 0);
        var page = protocolData(engine, list);
        assertEquals(3, page.get("total").getAsInt());
        var read = list.deepCopy();
        read.remove("offset");
        read.addProperty("command", "read_received_reply_content");
        read.addProperty("byteOffset", 0);
        read.addProperty(
                "contentId",
                page.getAsJsonArray("parts")
                        .get(1)
                        .getAsJsonObject()
                        .get("contentId")
                        .getAsString());
        assertArrayEquals(
                fixture.data,
                Base64.getDecoder().decode(protocolData(engine, read).get("chunk").getAsString()));
        var logCommand = command.deepCopy();
        logCommand.remove("schemaDocument");
        logCommand.addProperty("command", "load_reply_event_log");
        var logSummary = protocolData(engine, logCommand);
        assertEquals(fixture.replyId.toString(), logSummary.get("replyId").getAsString());
        assertFalse(logSummary.has("submissionId"));
        assertFalse(logSummary.has("destinationId"));
        var logList = logCommand.deepCopy();
        logList.remove("caseId");
        logList.remove("replyId");
        logList.addProperty("command", "list_event_log");
        logList.addProperty("logId", logSummary.get("logId").getAsString());
        logList.addProperty("offset", 0);
        assertEquals(2, protocolData(engine, logList).getAsJsonArray("events").size());
        // Inspecting the independently verified reply log preserves the content proof.
        protocolData(engine, read);
        assertEquals(
                proof,
                protocolData(engine, list).get("proofId").getAsString(),
                "Preview read retains verification");
        var wrong = list.deepCopy();
        wrong.addProperty("command", "list_received_contents");
        assertProtocolFailure(engine, wrong);
        wrong = list.deepCopy();
        wrong.addProperty("offset", 1);
        assertProtocolFailure(engine, wrong);
        wrong = list.deepCopy();
        wrong.addProperty("apiVersion", api == ApiVersion.V2 ? "v3" : "v2");
        assertProtocolFailure(engine, wrong);
        wrong = command.deepCopy();
        wrong.addProperty("privateKey", "not-allowed");
        assertProtocolFailure(engine, wrong);
        var failed = command.deepCopy();
        failed.addProperty("schemaDocument", "{\"schemas\":[],\"extra\":true}");
        assertProtocolFailure(engine, failed);
        assertProtocolFailure(engine, read);
        protocolData(engine, command);
        fixture.attack = "ciphertext";
        assertProtocolFailure(engine, command);
        fixture.attack = "";
        summary = protocolData(engine, command);
        list.addProperty("proofId", summary.get("proofId").getAsString());
        list.addProperty("offset", 2);
        assertEquals(
                "Synthetische Antwortanlage",
                protocolData(engine, list)
                        .getAsJsonArray("parts")
                        .get(0)
                        .getAsJsonObject()
                        .get("description")
                        .getAsString());
        var other = sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "other", "secret");
        wrong = list.deepCopy();
        wrong.addProperty("sessionId", other.sessionId());
        assertProtocolFailure(engine, wrong);
        failed = command.deepCopy();
        failed.addProperty("sessionId", other.sessionId());
        assertProtocolFailure(engine, failed);
        assertProtocolFailure(
                engine, list); // Even a failed receive on another owner replaces the single global
        // snapshot.
        summary = protocolData(engine, command);
        var discard = list.deepCopy();
        discard.remove("offset");
        discard.addProperty("proofId", summary.get("proofId").getAsString());
        discard.addProperty("command", "discard_received_reply");
        protocolData(engine, discard);
        list.addProperty("proofId", summary.get("proofId").getAsString());
        assertProtocolFailure(engine, list);
        try (var files = Files.list(store.workspace(active.sessionId()))) {
            assertEquals(0, files.count());
        }
        assertEquals(
                1,
                ((SessionManager.ReplyChannels)
                                sessions.replyChannels(api, active.sessionId()).data())
                        .channels()
                        .size(),
                "Reading/discarding reply contents preserves its native key");
        store.discard(active.sessionId(), schemaId);
    }

    static JsonObject protocolData(Engine engine, JsonObject command) {
        var result = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
        assertTrue(result.get("ok").getAsBoolean(), result.toString());
        return result.getAsJsonObject("result").getAsJsonObject("data");
    }

    static void assertProtocolFailure(Engine engine, JsonObject command) {
        var result = JsonParser.parseString(engine.handle(command.toString())).getAsJsonObject();
        assertFalse(result.get("ok").getAsBoolean(), result.toString());
    }

    static String staged(ContentStore content, String owner, byte[] bytes) {
        var file = content.begin(owner, bytes.length);
        for (int offset = 0; offset < bytes.length; offset += ContentStore.CHUNK_BYTES)
            content.append(
                    owner,
                    file.contentId(),
                    offset,
                    Base64.getEncoder()
                            .encodeToString(
                                    Arrays.copyOfRange(
                                            bytes,
                                            offset,
                                            Math.min(
                                                    bytes.length,
                                                    offset + ContentStore.CHUNK_BYTES))));
        return file.contentId();
    }

    static String draftDocument(ApiVersion api, String handle) {
        var draft = new JsonObject();
        draft.addProperty("destinationId", TARGET.toString());
        if (api == ApiVersion.V3) draft.addProperty("fromDestinationId", SOURCE.toString());
        else draft.add("fromDestinationId", JsonNull.INSTANCE);
        draft.addProperty("serviceIdentifier", SERVICE);
        draft.addProperty("serviceName", "Test");
        draft.addProperty("region", "DE000000000000");
        draft.addProperty("schemaUri", SCHEMA.toString());
        draft.addProperty("mimeType", "application/json");
        draft.addProperty("contentId", handle);
        draft.add("caseId", JsonNull.INSTANCE);
        draft.add("processMessage", JsonNull.INSTANCE);
        draft.add("attachments", new JsonArray());
        return draft.toString();
    }

    static SubmissionInput maximumInput(ApiVersion api) {
        byte[] data = new byte[32 * 1024 * 1024], attachment = new byte[32 * 1024 * 1024];
        var random = new Random(42);
        random.nextBytes(data);
        random.nextBytes(attachment);
        for (int i = 0; i < data.length; i++) data[i] = (byte) ('a' + (data[i] & 255) % 26);
        byte[] prefix = "{\"payload\":\"".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(prefix, 0, data, 0, prefix.length);
        data[data.length - 2] = '"';
        data[data.length - 1] = '}';
        return new SubmissionInput(
                api == ApiVersion.V3 ? SOURCE : null,
                TARGET,
                SERVICE,
                "Synthetic maximum",
                "DE000000000000",
                SCHEMA,
                "application/json",
                data,
                List.of(
                        new SubmissionInput.Attachment(
                                "synthetic.bin", "application/octet-stream", null, attachment)),
                null,
                null);
    }

    static byte[] decrypt(String jwe) throws Exception {
        String[] parts = jwe.split("\\.", -1);
        assertEquals(5, parts.length);
        var decoder = Base64.getUrlDecoder();
        var header =
                JsonParser.parseString(new String(decoder.decode(parts[0]), StandardCharsets.UTF_8))
                        .getAsJsonObject();
        assertEquals("RSA-OAEP-256", header.get("alg").getAsString());
        assertEquals("A256GCM", header.get("enc").getAsString());
        assertEquals("synthetic-encrypt", header.get("kid").getAsString());
        var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(
                Cipher.DECRYPT_MODE,
                privateKey,
                new OAEPParameterSpec(
                        "SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        byte[] key = rsa.doFinal(decoder.decode(parts[1]));
        var aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(128, decoder.decode(parts[2])));
        aes.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
        byte[] ciphertext = decoder.decode(parts[3]), tag = decoder.decode(parts[4]);
        byte[] combined = Arrays.copyOf(ciphertext, ciphertext.length + tag.length);
        System.arraycopy(tag, 0, combined, ciphertext.length, tag.length);
        return aes.doFinal(combined);
    }
}
