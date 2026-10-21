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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.Deflater;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ReceiverKernelTest {
    private static final String DEST = "11111111-1111-4111-8111-111111111111";
    private static final String SUB = "22222222-2222-4222-8222-222222222222";
    private static final String CASE = "33333333-3333-4333-8333-333333333333";
    private static String pem, registration;
    private static RSAPrivateCrtKey privateKey;
    @TempDir Path workspace;

    @BeforeAll
    static void key(@TempDir Path directory) throws Exception {
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

    private static AdapterRegistry registry() {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    private static AuthenticatedSession open(AdapterRegistry registry, ApiVersion api)
            throws Exception {
        return registry.openSession(
                api,
                "id",
                "secret",
                (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                (u, h) -> {
                    throw new AssertionError("Receiver must use its own scoped transport");
                });
    }

    @Test
    void missingOrDiscardedDestinationKeysPreventAnyReceiveRequest() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    ResourceExchange noNetwork =
                            (u, h) -> {
                                fail("No eligible native key must mean no HTTP request");
                                return null;
                            };
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            DEST, SUB, noNetwork, workspace,
                                                            Map.of())));
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            CASE, SUB, noNetwork, workspace,
                                                            Map.of())));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardKeys();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            DEST, SUB, noNetwork, workspace,
                                                            Map.of())));
                }
        }
    }

    @ParameterizedTest
    @EnumSource(ApiVersion.class)
    void digitalConsentWithoutReplyChannelDoesNotReportAnAuthenticationFailure(ApiVersion api)
            throws Exception {
        try (var adapters = registry();
                var session = open(adapters, api)) {
            String applicationMetadata = "{\"application\":{\"noEReply\":false}}";
            String applicationHash = hash(applicationMetadata.getBytes(StandardCharsets.UTF_8));
            var fixture =
                    new Fixture(
                            api,
                            false,
                            false,
                            text -> {
                                var metadata = JsonParser.parseString(text).getAsJsonObject();
                                metadata.addProperty(
                                        "$schema",
                                        "https://schema.fitko.de/fit-connect/metadata/2.1.0/metadata.schema.json");
                                var reference = new JsonObject();
                                reference.addProperty("zustimmungZumDigitalenBescheid", true);
                                metadata.add("additionalReferenceInfo", reference);
                                var dataSet = new JsonObject();
                                dataSet.addProperty(
                                        "dataSetId", "55555555-5555-4555-8555-555555555555");
                                var schema = new JsonObject();
                                schema.addProperty("schemaUri", "urn:test:application-metadata");
                                schema.addProperty("mimeType", "application/json");
                                dataSet.add("schema", schema);
                                var digest = new JsonObject();
                                digest.addProperty("type", "sha512");
                                digest.addProperty("content", applicationHash);
                                dataSet.add("hash", digest);
                                dataSet.addProperty("content", applicationMetadata);
                                var dataSets = new JsonArray();
                                dataSets.add(dataSet);
                                metadata.add("dataSets", dataSets);
                                return metadata.toString();
                            });
            session.importKey(DEST, "decrypt", pem, List.of(registration));
            try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                var content = session.receive(DEST, SUB, scope, workspace, fixture.schemas());
                assertArrayEquals(fixture.data, content.data());
            }
            var evidence = session.receiptEvidence(DEST, SUB);
            var error =
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
            assertEquals("reply_channel_missing", error.code());
            assertEquals(evidence, session.receiptEvidence(DEST, SUB));
            session.check();
        }
    }

    @Test
    void bothSdkReplySendersUseOnlyTheVerifiedChannelAndEncryptDataAndAttachments()
            throws Exception {
        for (var api : ApiVersion.values())
            for (boolean dataSet : api == ApiVersion.V3 ? List.of(false, true) : List.of(false))
                try (var adapters = registry();
                        var session = open(adapters, api)) {
                    var answerKey = JsonParser.parseString(registration).getAsJsonObject();
                    answerKey.remove("x5c");
                    answerKey.remove("use");
                    answerKey.addProperty("kid", "synthetic-reply");
                    String offer =
                            "\"replyChannel\":{\"fitConnect\":{\"encryptionPublicKey\":"
                                    + answerKey
                                    + ",\"processStandards\":[\"urn:test:answer\"]}},";
                    var fixture =
                            new Fixture(
                                    api,
                                    false,
                                    false,
                                    text -> {
                                        if (!dataSet)
                                            return text.replace(
                                                    "\"contentStructure\":",
                                                    offer + "\"contentStructure\":");
                                        var root = JsonParser.parseString(text).getAsJsonObject();
                                        root.addProperty(
                                                "$schema",
                                                "https://schema.fitko.de/fit-connect/metadata/3.0.0/metadata.schema.json");
                                        var fit = new JsonObject();
                                        fit.add("encryptionPublicKey", answerKey);
                                        fit.addProperty("destinationId", ReplyCapture.ONLINE);
                                        var schema = new JsonObject();
                                        schema.addProperty("schemaUri", "urn:test:answer");
                                        schema.addProperty("mimeType", "application/json");
                                        var supported = new JsonArray();
                                        supported.add(schema);
                                        fit.add("supportedSchemas", supported);
                                        var channel = new JsonObject();
                                        channel.add("fitConnect", fit);
                                        var content = new JsonObject();
                                        content.add("replyChannels", channel);
                                        var entry = new JsonObject();
                                        entry.addProperty(
                                                "dataSetId", UUID.randomUUID().toString());
                                        entry.addProperty("content", content.toString());
                                        var digest = new JsonObject();
                                        digest.addProperty("type", "sha512");
                                        try {
                                            digest.addProperty(
                                                    "content",
                                                    hash(
                                                            content.toString()
                                                                    .getBytes(
                                                                            StandardCharsets
                                                                                    .UTF_8)));
                                        } catch (Exception failure) {
                                            throw new AssertionError(failure);
                                        }
                                        entry.add("hash", digest);
                                        var reference = new JsonObject();
                                        reference.addProperty(
                                                "schemaUri",
                                                "https://schema.fitko.de/fit-connect/metadata/dataset/reply-channel-1.0.0.schema.json");
                                        reference.addProperty("mimeType", "application/json");
                                        entry.add("schema", reference);
                                        var entries = new JsonArray();
                                        entries.add(entry);
                                        root.add("dataSets", entries);
                                        return root.toString();
                                    });
                    var input =
                            new ReplyInput(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    java.net.URI.create("urn:test:answer"),
                                    "application/json",
                                    "{\"status\":\"erhalten\"}".getBytes(StandardCharsets.UTF_8),
                                    List.of(
                                            new SubmissionInput.Attachment(
                                                    "Antwort.txt",
                                                    "text/plain",
                                                    "Synthetische Antwort",
                                                    "Antwortanlage"
                                                            .getBytes(StandardCharsets.UTF_8))),
                                    null);
                    ResourceExchange forbidden =
                            (url, headers) -> {
                                throw new AssertionError("Unverified reply reached HTTP: " + url);
                            };
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, forbidden));
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    ResourceExchange supportingReplies =
                            (url, headers) -> {
                                String resource =
                                        fixture.get(url, headers)
                                                .replace(
                                                        "\"submissionSchemas\":",
                                                        "\"replyChannels\":{\"fitConnect\":{\"processStandards\":[\"urn:test:answer\"]}},\"submissionSchemas\":");
                                if (url.endsWith("/submissions/" + SUB) && api == ApiVersion.V3)
                                    resource =
                                            resource.replace(
                                                    "\"submissionId\":",
                                                    "\"fromDestinationId\":\""
                                                            + ReplyCapture.ONLINE
                                                            + "\",\"submissionId\":");
                                return resource;
                            };
                    try (var scope = new ReceiveAccess(api, DEST, SUB, supportingReplies)) {
                        session.receive(DEST, SUB, scope, workspace, fixture.schemas());
                    }
                    var recipient = session.replyRecipient(DEST, SUB);
                    assertEquals(UUID.fromString(CASE), recipient.caseId());
                    assertEquals(
                            List.of(
                                    new ReplyRecipient.Schema(
                                            java.net.URI.create("urn:test:answer"),
                                            dataSet ? "application/json" : null)),
                            recipient.schemas());
                    if (dataSet) {
                        assertEquals(
                                UUID.fromString(ReplyCapture.ONLINE),
                                recipient.replyDestinationId());
                        var wrongMime =
                                new ReplyInput(
                                        input.destinationId(),
                                        input.submissionId(),
                                        input.caseId(),
                                        input.schemaUri(),
                                        "application/xml",
                                        input.data(),
                                        List.of(),
                                        null);
                        assertThrows(
                                SessionException.class,
                                () -> session.sendReply(wrongMime, workspace, forbidden));
                    }
                    assertFalse(recipient.toString().contains("synthetic-reply"));
                    for (var wrong :
                            List.of(
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            input.caseId(),
                                            java.net.URI.create("urn:test:other"),
                                            input.mimeType(),
                                            input.data(),
                                            input.attachments(),
                                            null),
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            UUID.randomUUID(),
                                            input.schemaUri(),
                                            input.mimeType(),
                                            input.data(),
                                            input.attachments(),
                                            null)))
                        assertThrows(
                                SessionException.class,
                                () -> session.sendReply(wrong, workspace, forbidden));
                    for (String advertised :
                            api == ApiVersion.V2 ? List.of("2.0.0", "2.1.0") : List.of("3.0.0")) {
                        var capture = new ReplyCapture(api, advertised);
                        var access = new ReplyAccess(api, capture);
                        var prepared = access.prepare(input, recipient);
                        assertEquals(0, capture.posts);
                        ReplyAccess.State sent;
                        try {
                            sent =
                                    access.execute(
                                            prepared.attemptId(),
                                            session,
                                            workspace,
                                            () ->
                                                    assertEquals(
                                                            recipient,
                                                            session.replyRecipient(DEST, SUB)));
                        } catch (Exception failure) {
                            throw new AssertionError(
                                    api
                                            + " reply SDK failed, requested resources: "
                                            + capture.calls,
                                    failure);
                        }
                        assertEquals(
                                "sent",
                                sent.status(),
                                api + ": " + sent + " resources: " + capture.calls);
                        assertEquals(ReplyCapture.REPLY, sent.replyId());
                        assertEquals(input.caseId().toString(), sent.caseId());
                        assertThrows(
                                SessionException.class,
                                () ->
                                        access.execute(
                                                prepared.attemptId(),
                                                session,
                                                workspace,
                                                () -> {}));
                        assertEquals(1, capture.posts);
                        assertNotNull(capture.submitted);
                        assertArrayEquals(
                                input.data(),
                                openReply(capture.submitted.get("encryptedData").getAsString()));
                        var metadata =
                                JsonParser.parseString(
                                                new String(
                                                        openReply(
                                                                capture.submitted
                                                                        .get("encryptedMetadata")
                                                                        .getAsString()),
                                                        StandardCharsets.UTF_8))
                                        .getAsJsonObject();
                        assertEquals(
                                "https://schema.fitko.de/fit-connect/metadata/"
                                        + advertised
                                        + "/metadata.schema.json",
                                metadata.get("$schema").getAsString(),
                                api.wireValue());
                        assertTrue(metadata.toString().contains("Antwort.txt"));
                        assertEquals(capture.announced.size(), capture.uploads.size());
                        assertFalse(capture.uploads.isEmpty());
                        assertTrue(
                                capture.uploads.values().stream()
                                        .anyMatch(
                                                value -> {
                                                    try {
                                                        return Arrays.equals(
                                                                "Antwortanlage"
                                                                        .getBytes(
                                                                                StandardCharsets
                                                                                        .UTF_8),
                                                                openReply(value));
                                                    } catch (Exception failure) {
                                                        throw new AssertionError(failure);
                                                    }
                                                }));
                    }
                    var obsolete = new ReplyCapture(api, "1.5.0");
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, obsolete));
                    assertEquals(
                            0,
                            obsolete.posts,
                            "Metadata 1.x must fail before any reply announcement");
                    if (!dataSet)
                        for (String xml :
                                List.of(
                                        "<antwort><status>erhalten</status></antwort>",
                                        "<!DOCTYPE antwort><antwort/>")) {
                            var xmlInput =
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            input.caseId(),
                                            input.schemaUri(),
                                            "application/xml",
                                            xml.getBytes(StandardCharsets.UTF_8),
                                            List.of(),
                                            input.processMessage());
                            var xmlRemote =
                                    new ReplyCapture(api, api == ApiVersion.V2 ? "2.0.0" : "3.0.0");
                            var xmlAccess = new ReplyAccess(api, xmlRemote);
                            var xmlAttempt = xmlAccess.prepare(xmlInput, recipient);
                            var xmlResult =
                                    xmlAccess.execute(
                                            xmlAttempt.attemptId(), session, workspace, () -> {});
                            if (xml.startsWith("<!DOCTYPE")) {
                                assertEquals("failed", xmlResult.status());
                                assertEquals(0, xmlRemote.posts);
                            } else {
                                assertEquals("sent", xmlResult.status(), xmlResult.toString());
                                assertArrayEquals(
                                        xmlInput.data(),
                                        openReply(
                                                xmlRemote
                                                        .submitted
                                                        .get("encryptedData")
                                                        .getAsString()));
                            }
                        }
                    session.discardReceived();
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, forbidden));
                }
    }

    private static final class ReplyCapture implements ResourceExchange {
        static final String REPLY = "55555555-5555-4555-8555-555555555555",
                ONLINE = "66666666-6666-4666-8666-666666666666";
        final ApiVersion api;
        final String metadataVersion;
        final List<String> calls = new ArrayList<>();
        final Map<String, String> uploads = new LinkedHashMap<>();
        Set<String> announced = Set.of();
        int posts;
        JsonObject submitted;

        ReplyCapture(ApiVersion api, String metadataVersion) {
            this.api = api;
            this.metadataVersion = metadataVersion;
        }

        public String get(String url, Map<String, String> headers) {
            throw new AssertionError("SDK must use request");
        }

        public Response request(
                String method, String url, Map<String, String> headers, String body) {
            String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
            calls.add(method + " " + url);
            assertEquals(url, SendHttpTransport.allowedReply(api, method, url).toString());
            assertTrue(
                    url.startsWith(base + "/")
                            || url.equals(
                                    "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/"
                                            + DEST),
                    url);
            if (method.equals("GET")) {
                if (url.equals(base + "/cases?offset=0&limit=1"))
                    return new Response(
                            200, "{\"cases\":[],\"offset\":0,\"count\":0,\"totalCount\":0}");
                if (url.equals(base + "/cases/" + CASE))
                    return new Response(
                            200,
                            "{\"caseId\":\""
                                    + CASE
                                    + "\",\"destinationId\":\""
                                    + DEST
                                    + "\",\"fromDestinationId\":\""
                                    + ONLINE
                                    + "\"}");
                if (url.contains("/destinations/") && !url.endsWith("/limits")) {
                    String id = url.substring(url.lastIndexOf('/') + 1);
                    assertTrue(Set.of(DEST, ONLINE).contains(id));
                    return new Response(
                            200,
                            "{\"destinationId\":\""
                                    + id
                                    + "\",\"type\":\""
                                    + (id.equals(DEST) ? "A" : "B")
                                    + "\",\"status\":\"active\",\"metadataVersions\":[\""
                                    + metadataVersion
                                    + "\"],\"publicServices\":[]}");
                }
                if (url.equals(base + "/cases/" + CASE + "/limits"))
                    return new Response(
                            200, "{\"attachments\":{\"reply\":{\"applicable\":" + limits() + "}}}");
                if (url.equals(base + "/limits/" + DEST + "/" + ONLINE))
                    return new Response(200, "{\"attachments\":{\"applicable\":" + limits() + "}}");
            }
            if (method.equals("POST") && url.equals(base + "/replies")) {
                posts++;
                var value = JsonParser.parseString(body).getAsJsonObject();
                assertEquals(CASE, value.get("caseId").getAsString());
                if (api == ApiVersion.V3) {
                    assertEquals(DEST, value.get("fromDestinationId").getAsString());
                    assertTrue(
                            !value.has("processMessage")
                                    || value.get("processMessage").isJsonNull(),
                            "Normal reply must not invent an unoffered process message");
                }
                var ids = new HashSet<String>();
                for (var id : value.getAsJsonArray("announcedAttachments"))
                    assertTrue(ids.add(id.getAsString()));
                announced = Set.copyOf(ids);
                return new Response(201, result());
            }
            if (method.equals("PUT")
                    && url.startsWith(base + "/replies/" + REPLY + "/attachments/")) {
                String id = url.substring(url.lastIndexOf('/') + 1);
                assertTrue(announced.contains(id));
                assertNull(uploads.put(id, body));
                return new Response(204, "");
            }
            if (method.equals("PUT") && url.equals(base + "/replies/" + REPLY)) {
                assertNull(submitted);
                submitted = JsonParser.parseString(body).getAsJsonObject();
                return new Response(200, result());
            }
            throw new AssertionError("Unexpected reply SDK request: " + method + " " + url);
        }

        String result() {
            return "{\"replyId\":\""
                    + REPLY
                    + "\",\"caseId\":\""
                    + CASE
                    + "\",\"fromDestinationId\":\""
                    + DEST
                    + "\",\"attachments\":[]}";
        }

        String limits() {
            return "{\"maxNumber\":40,\"maxSizeIndividualBytes\":33554432,\"maxSizeAggregateBytes\":67108864}";
        }
    }

    @Test
    void nativeReplyProtocolBindsStagedContentToTheCurrentProofAndOneConfirmedSdkWrite()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var answerKey = JsonParser.parseString(registration).getAsJsonObject();
            answerKey.remove("x5c");
            answerKey.remove("use");
            answerKey.addProperty("kid", "synthetic-reply");
            String standards = "[\"urn:test:answer\",\"urn:test:answer-a\",\"urn:test:answer-b\"]";
            String offer =
                    "\"replyChannel\":{\"fitConnect\":{\"encryptionPublicKey\":"
                            + answerKey
                            + ",\"processStandards\":"
                            + standards
                            + "}},";
            var fixture =
                    new Fixture(
                            api,
                            false,
                            false,
                            text ->
                                    text.replace(
                                            "\"contentStructure\":",
                                            offer + "\"contentStructure\":"));
            var capture = new ReplyCapture(api, api == ApiVersion.V2 ? "2.0.0" : "3.0.0");
            ResourceExchange remote =
                    new ResourceExchange() {
                        public String get(String url, Map<String, String> headers) {
                            if (url.contains("/destination-api/") && url.contains("/keys?"))
                                return "{\"keys\":["
                                        + registration
                                        + "],\"offset\":0,\"count\":1,\"totalCount\":1}";
                            return fixture.get(url, headers)
                                    .replace(
                                            "\"submissionSchemas\":",
                                            "\"replyChannels\":{\"fitConnect\":{\"processStandards\":"
                                                    + standards
                                                    + "}},\"submissionSchemas\":");
                        }

                        public Response request(
                                String method,
                                String url,
                                Map<String, String> headers,
                                String body) {
                            return capture.request(method, url, headers, body);
                        }
                    };
            try (var adapters = registry();
                    var content = new ContentStore(workspace);
                    var sessions =
                            new SessionManager(
                                    adapters,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content);
                    var engine = new Engine(adapters, sessions)) {
                String owner =
                        sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                .sessionId();
                sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                byte[] schema =
                        fixture.schemas().get(Fixture.SCHEMA).getBytes(StandardCharsets.UTF_8);
                String schemaHandle = content.begin(owner, schema.length).contentId();
                content.append(owner, schemaHandle, 0, b64Standard(schema));
                String catalog =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemas",
                                                List.of(
                                                        Map.of(
                                                                "uri",
                                                                Fixture.SCHEMA,
                                                                "contentId",
                                                                schemaHandle))));
                String proof =
                        success(
                                        engine.handle(
                                                command(
                                                                api,
                                                                owner,
                                                                "verify_submission",
                                                                "destinationId",
                                                                DEST,
                                                                "submissionId",
                                                                SUB,
                                                                "schemaDocument",
                                                                catalog)
                                                        .toString()))
                                .get("proofId")
                                .getAsString();
                var target =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString()));
                assertEquals(3, target.get("total").getAsInt());
                assertEquals(2, target.getAsJsonArray("schemas").size());
                assertEquals(
                        "urn:test:answer-b",
                        success(
                                        engine.handle(
                                                command(
                                                                api,
                                                                owner,
                                                                "reply_target",
                                                                "proofId",
                                                                proof,
                                                                "offset",
                                                                2)
                                                        .toString()))
                                .getAsJsonArray("schemas")
                                .get(0)
                                .getAsJsonObject()
                                .get("schemaUri")
                                .getAsString());
                assertEquals(
                        "invalid_input",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        1)
                                                .toString())));
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        UUID.randomUUID().toString(),
                                                        "offset",
                                                        0)
                                                .toString())));
                assertFalse(target.toString().contains("encryptionPublicKey"));
                assertFalse(target.toString().contains("synthetic-token"));
                byte[] answer = "{\"status\":\"erhalten\"}".getBytes(StandardCharsets.UTF_8);
                String dataHandle = content.begin(owner, answer.length).contentId();
                content.append(owner, dataHandle, 0, b64Standard(answer));
                byte[] answerSchema =
                        "{\"$id\":\"urn:test:answer\",\"type\":\"object\",\"required\":[\"status\"],\"properties\":{\"status\":{\"const\":\"erhalten\"}},\"additionalProperties\":false}"
                                .getBytes(StandardCharsets.UTF_8);
                String localSchema = content.begin(owner, answerSchema.length).contentId();
                content.append(owner, localSchema, 0, b64Standard(answerSchema));
                String schemaSelection =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemaUri",
                                                "urn:test:answer",
                                                "mimeType",
                                                "application/json",
                                                "allowExternalSchemas",
                                                false,
                                                "schemaContentId",
                                                localSchema));
                for (String invalidSchema :
                        List.of(
                                new String(answerSchema, StandardCharsets.UTF_8)
                                        .replace("urn:test:answer", "urn:test:other"),
                                "{\"type\":\"object\"}",
                                "{\"$id\":false}",
                                "{\"$id\":\"relative.json\"}")) {
                    byte[] invalidSchemaBytes = invalidSchema.getBytes(StandardCharsets.UTF_8);
                    String invalidSchemaHandle =
                            content.begin(owner, invalidSchemaBytes.length).contentId();
                    content.append(owner, invalidSchemaHandle, 0, b64Standard(invalidSchemaBytes));
                    var invalidSelection =
                            JsonParser.parseString(schemaSelection).getAsJsonObject();
                    invalidSelection.addProperty("schemaContentId", invalidSchemaHandle);
                    assertEquals(
                            "schema_id_mismatch",
                            failure(
                                    engine.handle(
                                            command(
                                                            api,
                                                            owner,
                                                            "load_reply_schema",
                                                            "proofId",
                                                            proof,
                                                            "schemaDocument",
                                                            invalidSelection.toString())
                                                    .toString())));
                    assertEquals(0, capture.posts);
                    content.discard(owner, invalidSchemaHandle);
                }
                var loadedSchema =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "load_reply_schema",
                                                        "proofId",
                                                        proof,
                                                        "schemaDocument",
                                                        schemaSelection)
                                                .toString()));
                content.discard(owner, localSchema);
                String loadedSchemaId = loadedSchema.get("schemaId").getAsString();
                var draft = new JsonObject();
                draft.addProperty("schemaId", loadedSchemaId);
                draft.addProperty("proofId", proof);
                draft.addProperty("schemaUri", "urn:test:answer");
                draft.addProperty("mimeType", "application/json");
                draft.addProperty("contentId", dataHandle);
                draft.add("attachments", new JsonArray());
                draft.add("processMessage", JsonNull.INSTANCE);
                byte[] invalidAnswer = "{\"status\":\"wrong\"}".getBytes(StandardCharsets.UTF_8);
                String invalidHandle = content.begin(owner, invalidAnswer.length).contentId();
                content.append(owner, invalidHandle, 0, b64Standard(invalidAnswer));
                var invalidDraft = draft.deepCopy();
                invalidDraft.addProperty("contentId", invalidHandle);
                assertEquals(
                        "data_schema_invalid",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        invalidDraft.toString())
                                                .toString())));
                assertEquals(0, capture.posts);
                content.discard(owner, invalidHandle);
                var foreignSchema = draft.deepCopy();
                foreignSchema.addProperty("schemaId", UUID.randomUUID().toString());
                assertEquals(
                        "schema_required",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        foreignSchema.toString())
                                                .toString())));
                var malformed = draft.deepCopy();
                malformed.add("publicJwk", answerKey);
                assertEquals(
                        "invalid_submission",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        malformed.toString())
                                                .toString())));
                var prepared =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        draft.toString())
                                                .toString()));
                assertEquals(0, capture.posts);
                assertEquals(
                        "prepared",
                        prepared.getAsJsonObject("attempt").get("status").getAsString());
                assertEquals(
                        SUB, prepared.getAsJsonObject("summary").get("submissionId").getAsString());
                assertEquals(
                        answer.length,
                        prepared.getAsJsonObject("summary").get("dataBytes").getAsInt());
                String attempt = prepared.getAsJsonObject("attempt").get("attemptId").getAsString();
                success(
                        engine.handle(
                                command(api, owner, "cancel_reply", "attemptId", attempt)
                                        .toString()));
                assertEquals(0, capture.posts);
                prepared =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        draft.toString())
                                                .toString()));
                attempt = prepared.getAsJsonObject("attempt").get("attemptId").getAsString();
                content.discard(owner, dataHandle);
                var result =
                        success(
                                engine.handle(
                                        command(api, owner, "execute_reply", "attemptId", attempt)
                                                .toString()));
                assertEquals("sent", result.get("status").getAsString(), result.toString());
                assertEquals(1, capture.posts);
                assertArrayEquals(
                        answer, openReply(capture.submitted.get("encryptedData").getAsString()));
                assertEquals(
                        "send_locked",
                        failure(
                                engine.handle(
                                        command(api, owner, "execute_reply", "attemptId", attempt)
                                                .toString())));
                // Replying preserves the original content proof for a subsequent explicit
                // accept/reject.
                success(
                        engine.handle(
                                command(
                                                api,
                                                owner,
                                                "list_received_contents",
                                                "proofId",
                                                proof,
                                                "offset",
                                                0)
                                        .toString()));
                success(
                        engine.handle(
                                command(api, owner, "discard_received", "proofId", proof)
                                        .toString()));
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString())));
                assertEquals(1, capture.posts);
            }
        }
    }

    private static String b64Standard(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static byte[] openReply(String jwe) throws Exception {
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

    @Test
    void anEmptyEventLogCannotReleaseContentOrTriggerAutomaticRejection() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var reads = new AtomicInteger();
                    var writes = new AtomicInteger();
                    var fixture = new Fixture(api, false, false);
                    var remote =
                            new ResourceExchange() {
                                public String get(String url, Map<String, String> headers) {
                                    reads.incrementAndGet();
                                    if (url.contains("/events?"))
                                        return "{\"eventLog\":[],\"offset\":0,\"count\":0,\"totalCount\":0}";
                                    assertTrue(url.endsWith("/submissions/" + SUB), url);
                                    return fixture.get(url, headers);
                                }

                                public Response request(
                                        String method,
                                        String url,
                                        Map<String, String> headers,
                                        String body) {
                                    if (!method.equals("GET")) writes.incrementAndGet();
                                    return ResourceExchange.super.request(
                                            method, url, headers, body);
                                }
                            };
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST, SUB, scope, workspace,
                                                                Map.of())));
                    }
                    assertTrue(reads.get() >= 2);
                    assertEquals(0, writes.get());
                    assertEquals(1, session.loadedKeys().size());
                }
        }
    }

    @Test
    void bothSdkPipelinesVerifySignedEventsDecryptHashBoundContentAndPreserveMetadataBytes()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                for (boolean compressed : List.of(false, true))
                    try (var session = open(registry, api)) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                        var fixture = new Fixture(api, compressed, false);
                        try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                            var result =
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            DEST,
                                                            SUB,
                                                            scope,
                                                            workspace,
                                                            fixture.schemas()));
                            assertArrayEquals(fixture.data, result.data());
                            assertNotNull(result.schemaSnapshot(), api.toString());
                            assertEquals(Fixture.SCHEMA, result.schemaSnapshot().schemaUri());
                            var snapshot =
                                    JsonParser.parseString(result.schemaSnapshot().document())
                                            .getAsJsonObject();
                            assertEquals(1, snapshot.get("schemaPackage").getAsInt());
                            assertTrue(snapshot.getAsJsonObject("documents").has(Fixture.SCHEMA));
                            assertArrayEquals(fixture.metadata, result.metadata());
                            assertEquals(UUID.fromString(CASE), result.caseId());
                            assertEquals(1, result.attachments().size());
                            assertEquals(
                                    "Synthetische Beschreibung",
                                    result.attachments().getFirst().description());
                            assertArrayEquals(
                                    "Testanlage".getBytes(StandardCharsets.UTF_8),
                                    result.attachments().getFirst().bytes());
                            assertTrue(
                                    result.issues().stream()
                                            .noneMatch(ReceivedContent.Issue::error));
                            assertFalse(result.toString().contains("Erika"));
                            var evidence =
                                    registry.withSession(
                                            api, session, s -> s.receiptEvidence(DEST, SUB));
                            assertEquals(UUID.fromString(DEST), evidence.destinationId());
                            assertEquals(UUID.fromString(SUB), evidence.submissionId());
                            assertEquals(UUID.fromString(CASE), evidence.caseId());
                            assertEquals(
                                    fixture.encryptedMetadata.split("\\.")[4], evidence.metadata());
                            assertEquals(fixture.encryptedData.split("\\.")[4], evidence.data());
                            assertEquals(
                                    Map.of(
                                            UUID.fromString(Fixture.ATT),
                                            fixture.encryptedAttachment.split("\\.")[4]),
                                    evidence.attachments());
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s -> s.receiptEvidence(CASE, SUB)));
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s -> s.receiptEvidence(DEST, CASE)));
                            registry.withSession(
                                    api,
                                    session,
                                    s -> {
                                        s.retainKeys(DEST, List.of(registration));
                                        return null;
                                    });
                            assertEquals(
                                    evidence,
                                    registry.withSession(
                                            api, session, s -> s.receiptEvidence(DEST, SUB)));
                        }
                        assertEquals(1, session.loadedKeys().size());
                    }
        }
    }

    @Test
    void receiptEvidenceIsUnavailableBeforeVerificationAfterFailureOrAfterKeyChanges()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.receiptEvidence(DEST, SUB)));
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var valid = new Fixture(api, false, false);
                    for (String invalidation :
                            List.of(
                                    "discard-proof",
                                    "discard-keys",
                                    "replace-key",
                                    "withdraw-key",
                                    "failed-receive")) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                        try (var read = new ReceiveAccess(api, DEST, SUB, valid)) {
                            registry.withSession(
                                    api,
                                    session,
                                    s -> s.receive(DEST, SUB, read, workspace, valid.schemas()));
                        }
                        assertNotNull(
                                registry.withSession(
                                        api, session, s -> s.receiptEvidence(DEST, SUB)));
                        switch (invalidation) {
                            case "discard-proof" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.discardReceived();
                                                return null;
                                            });
                            case "discard-keys" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.discardKeys();
                                                return null;
                                            });
                            case "replace-key" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.importKey(
                                                            DEST,
                                                            "decrypt",
                                                            pem,
                                                            List.of(registration)));
                            case "withdraw-key" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.retainKeys(DEST, List.of());
                                                return null;
                                            });
                            case "failed-receive" -> {
                                var bad = new Fixture(api, false, true);
                                try (var read = new ReceiveAccess(api, DEST, SUB, bad)) {
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    registry.withSession(
                                                            api,
                                                            session,
                                                            s ->
                                                                    s.receive(
                                                                            DEST,
                                                                            SUB,
                                                                            read,
                                                                            workspace,
                                                                            bad.schemas())));
                                }
                            }
                        }
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api, session, s -> s.receiptEvidence(DEST, SUB)),
                                invalidation);
                    }
                }
        }
    }

    @Test
    void bothSdkSignersProduceBoundPs512AcceptAndRejectTokensWithoutSendingAnything()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    String signRegistration = signingRegistration("synthetic-sign");
                    TestCertificatePolicy.validate(
                            JsonParser.parseString(signRegistration).getAsJsonObject(),
                            TestCertificatePolicy.Purpose.SIGNING,
                            java.time.Instant.now());
                    var accept =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "sign", pem, List.of(signRegistration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(accept, workspace)));
                    for (String reason :
                            List.of(
                                    "technical-error",
                                    "metadata-encryption-issue",
                                    "data-encryption-issue",
                                    "attachment-encryption-issue",
                                    "data-schema-violation")) {
                        var reject =
                                new ReceiptRequest(
                                        UUID.fromString(DEST),
                                        UUID.fromString(SUB),
                                        UUID.fromString(CASE),
                                        "reject",
                                        null,
                                        reason,
                                        "Synthetischer Test\nKeine echten Daten",
                                        reason.startsWith("attachment-")
                                                ? UUID.fromString(Fixture.ATT)
                                                : null);
                        var signed =
                                registry.withSession(
                                        api, session, s -> s.signReceipt(reject, workspace));
                        var claims = checkedReceipt(signed, "reject");
                        var event =
                                claims.getAsJsonObject("events")
                                        .getAsJsonObject(
                                                "https://schema.fitko.de/fit-connect/events/reject-submission");
                        assertFalse(event.has("authenticationTags"));
                        assertEquals(1, event.getAsJsonArray("problems").size());
                        var problem = event.getAsJsonArray("problems").get(0).getAsJsonObject();
                        assertEquals(reject.description(), problem.get("detail").getAsString());
                        assertEquals(
                                Set.of("type", "title", "detail", "instance"), problem.keySet());
                        assertEquals(
                                "https://schema.fitko.de/fit-connect/events/problems/"
                                        + (reason.equals("technical-error")
                                                ? "technical-error"
                                                : reason.equals("data-schema-violation")
                                                        ? "schema-violation"
                                                        : "encryption-issue"),
                                problem.get("type").getAsString());
                        assertFalse(problem.get("title").getAsString().isBlank());
                        assertEquals(
                                reason.equals("technical-error")
                                        ? "other"
                                        : reason.startsWith("metadata-")
                                                ? "metadata"
                                                : reason.startsWith("attachment-")
                                                        ? "attachment:" + Fixture.ATT
                                                        : "data",
                                problem.get("instance").getAsString());
                    }
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new Fixture(api, false, false);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.receive(DEST, SUB, scope, workspace, fixture.schemas()));
                    }
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(signRegistration, registration));
                                return null;
                            });
                    var signed =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(accept, workspace));
                    var claims = checkedReceipt(signed, "accept");
                    var event =
                            claims.getAsJsonObject("events")
                                    .getAsJsonObject(
                                            "https://schema.fitko.de/fit-connect/events/accept-submission");
                    var tags = event.getAsJsonObject("authenticationTags");
                    assertEquals(
                            fixture.encryptedData.split("\\.")[4], tags.get("data").getAsString());
                    assertEquals(
                            fixture.encryptedMetadata.split("\\.")[4],
                            tags.get("metadata").getAsString());
                    assertEquals(
                            fixture.encryptedAttachment.split("\\.")[4],
                            tags.getAsJsonObject("attachments").get(Fixture.ATT).getAsString());
                    assertFalse(event.has("problems"));
                    assertFalse(signed.toString().contains(signed.jwt()));
                    var wrongCase =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(Fixture.ATT),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> s.signReceipt(wrongCase, workspace)));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardReceived();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(accept, workspace)));
                }
        }
    }

    @Test
    void receiptSigningNeverUsesADecryptionKeyAndRequiresAnExplicitKidWhenAmbiguous()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "reject",
                                    null,
                                    "technical-error",
                                    null,
                                    null);
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(request, workspace)));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("second-sign"))));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(request, workspace)));
                    var selected =
                            new ReceiptRequest(
                                    request.destinationId(),
                                    request.submissionId(),
                                    request.caseId(),
                                    request.action(),
                                    "synthetic-sign",
                                    request.reason(),
                                    null,
                                    null);
                    checkedReceipt(
                            registry.withSession(
                                    api, session, s -> s.signReceipt(selected, workspace)),
                            "reject");
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardKeys();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(selected, workspace)));
                }
        }
    }

    @Test
    void bothSdkCaseClientsDispatchTheExactSignedTokenOnlyThroughTheConfirmedGate()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "reject",
                                    null,
                                    "technical-error",
                                    null,
                                    null);
                    var token =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(request, workspace));
                    var writes = new AtomicInteger();
                    ResourceExchange transport =
                            new ResourceExchange() {
                                public String get(String u, Map<String, String> h) {
                                    throw new AssertionError("No receipt read");
                                }

                                public Response request(
                                        String method,
                                        String url,
                                        Map<String, String> headers,
                                        String body) {
                                    assertEquals("POST", method);
                                    assertEquals(
                                            "https://test.fit-connect.fitko.dev/submission-api/"
                                                    + api.wireValue()
                                                    + "/cases/"
                                                    + CASE
                                                    + "/events",
                                            url);
                                    assertEquals(token.jwt(), body);
                                    assertTrue(
                                            headers.entrySet().stream()
                                                    .anyMatch(
                                                            h ->
                                                                    h.getKey()
                                                                                    .equalsIgnoreCase(
                                                                                            "Authorization")
                                                                            && h.getValue()
                                                                                    .startsWith(
                                                                                            "Bearer ")));
                                    assertTrue(
                                            headers.entrySet().stream()
                                                    .anyMatch(
                                                            h ->
                                                                    h.getKey()
                                                                                    .equalsIgnoreCase(
                                                                                            "Content-Type")
                                                                            && h.getValue()
                                                                                    .equals(
                                                                                            "application/jose")));
                                    writes.incrementAndGet();
                                    return new Response(204, "");
                                }
                            };
                    var gate = new ReceiptAccess(api, transport);
                    var prepared = gate.prepare(token);
                    var result =
                            gate.execute(
                                    prepared.attemptId(),
                                    (value, io) ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s -> {
                                                        s.sendReceipt(value, io);
                                                        return null;
                                                    }));
                    assertEquals("confirmed", result.status());
                    assertEquals(1, writes.get());
                    var wrongCase =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    UUID.randomUUID(),
                                    token.action(),
                                    token.signingKid(),
                                    token.jwt());
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(wrongCase, transport);
                                                return null;
                                            }));
                    var wrongAction =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    token.caseId(),
                                    "accept",
                                    token.signingKid(),
                                    token.jwt());
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(wrongAction, transport);
                                                return null;
                                            }));
                    String jwt = token.jwt();
                    int at = jwt.lastIndexOf('.') + 1;
                    var tampered =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    token.caseId(),
                                    token.action(),
                                    token.signingKid(),
                                    jwt.substring(0, at)
                                            + (jwt.charAt(at) == 'A' ? 'B' : 'A')
                                            + jwt.substring(at + 1));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(tampered, transport);
                                                return null;
                                            }));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardKeys();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(token, transport);
                                                return null;
                                            }));
                    assertEquals(1, writes.get());
                }
        }
    }

    @Test
    void acceptDispatchRequiresTheStillValidNativeReceiveProof() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new Fixture(api, false, false);
                    try (var read = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.receive(DEST, SUB, read, workspace, fixture.schemas()));
                    }
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    var token =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(request, workspace));
                    var writes = new AtomicInteger();
                    ResourceExchange transport =
                            new ResourceExchange() {
                                public String get(String u, Map<String, String> h) {
                                    throw new AssertionError();
                                }

                                public Response request(
                                        String m, String u, Map<String, String> h, String b) {
                                    assertEquals("POST", m);
                                    assertEquals(token.jwt(), b);
                                    writes.incrementAndGet();
                                    return new Response(204, "");
                                }
                            };
                    var gate = new ReceiptAccess(api, transport);
                    var prepared = gate.prepare(token);
                    assertEquals(
                            "confirmed",
                            gate.execute(
                                            prepared.attemptId(),
                                            (value, io) ->
                                                    registry.withSession(
                                                            api,
                                                            session,
                                                            s -> {
                                                                s.sendReceipt(value, io);
                                                                return null;
                                                            }))
                                    .status());
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardReceived();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(token, transport);
                                                return null;
                                            }));
                    assertEquals(1, writes.get());
                }
        }
    }

    @Test
    void sessionOwnedReceiptsRecheckKeysAndIdentityAndPreserveUncertainOutcomes() throws Exception {
        for (var api : ApiVersion.values())
            for (String mode :
                    List.of("confirmed", "withdrawn", "changed-case", "context", "lost")) {
                var fixture = new Fixture(api, false, false);
                var writes = new AtomicInteger();
                var changed = new java.util.concurrent.atomic.AtomicBoolean();
                ResourceExchange remote =
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                if (url.contains("/destination-api/") && url.contains("/keys?")) {
                                    boolean withdrawn = changed.get() && mode.equals("withdrawn");
                                    return "{\"keys\":["
                                            + (withdrawn
                                                    ? ""
                                                    : signingRegistration("synthetic-sign"))
                                            + "],\"offset\":0,\"count\":"
                                            + (withdrawn ? 0 : 1)
                                            + ",\"totalCount\":"
                                            + (withdrawn ? 0 : 1)
                                            + "}";
                                }
                                String result = fixture.get(url, headers);
                                if (url.endsWith("/submissions/" + SUB)
                                        && changed.get()
                                        && mode.equals("changed-case")) {
                                    var envelope = JsonParser.parseString(result).getAsJsonObject();
                                    envelope.addProperty("caseId", UUID.randomUUID().toString());
                                    return envelope.toString();
                                }
                                return result;
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                assertEquals("POST", method);
                                assertEquals(
                                        "https://test.fit-connect.fitko.dev/submission-api/"
                                                + api.wireValue()
                                                + "/cases/"
                                                + CASE
                                                + "/events",
                                        url);
                                checkedReceiptUnchecked(body);
                                writes.incrementAndGet();
                                if (mode.equals("lost"))
                                    throw new SessionException("resource_unavailable");
                                return new Response(204, "");
                            }
                        };
                try (var registry = registry();
                        var content = new ContentStore(workspace);
                        var sessions =
                                new SessionManager(
                                        registry,
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        ignored -> remote,
                                        content)) {
                    String owner =
                            sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                    .sessionId();
                    sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                    sessions.resource(api, owner, "import_key", DEST, 0, "sign", pem);
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "reject",
                                    null,
                                    "technical-error",
                                    "Synthetischer Test",
                                    null);
                    var engine = new Engine(registry, sessions);
                    var prepared =
                            new Gson()
                                    .fromJson(
                                            success(
                                                    engine.handle(
                                                            command(
                                                                            api,
                                                                            owner,
                                                                            "prepare_receipt",
                                                                            "receiptDocument",
                                                                            new Gson()
                                                                                    .toJson(
                                                                                            request))
                                                                    .toString())),
                                            SessionManager.PreparedReceipt.class);
                    assertFalse(new Gson().toJson(prepared).contains("synthetic-token"));
                    assertWorkspaceEmpty(content.workspace(owner));
                    assertEquals(0, writes.get());
                    changed.set(true);
                    String attempt = prepared.attempt().attemptId();
                    if (mode.equals("context")) {
                        sessions.lookup(api, owner, "load_submission", DEST, SUB, 0);
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                        assertEquals(
                                "cancelled",
                                ((ReceiptAccess.State)
                                                sessions.receipt(api, owner, "receipt_state", null)
                                                        .data())
                                        .status());
                    } else {
                        var result =
                                new Gson()
                                        .fromJson(
                                                success(
                                                        engine.handle(
                                                                command(
                                                                                api,
                                                                                owner,
                                                                                "execute_receipt",
                                                                                "attemptId",
                                                                                attempt)
                                                                        .toString())),
                                                ReceiptAccess.State.class);
                        assertEquals(
                                mode.equals("confirmed")
                                        ? "confirmed"
                                        : mode.equals("lost") ? "uncertain" : "failed",
                                result.status());
                        assertEquals(SUB, result.submissionId());
                        assertEquals(CASE, result.caseId());
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                        if (mode.equals("lost")) {
                            sessions.resource(api, owner, "discard_keys", null, 0, null, null);
                            assertEquals(
                                    "uncertain",
                                    ((ReceiptAccess.State)
                                                    sessions.receipt(
                                                                    api,
                                                                    owner,
                                                                    "receipt_state",
                                                                    null)
                                                            .data())
                                            .status());
                        }
                        if (mode.equals("confirmed"))
                            assertEquals(
                                    1,
                                    ((DestinationAccess.KeyState)
                                                    sessions.resource(
                                                                    api,
                                                                    owner,
                                                                    "loaded_keys",
                                                                    null,
                                                                    0,
                                                                    null,
                                                                    null)
                                                            .data())
                                            .keys()
                                            .size());
                    }
                    assertEquals(
                            mode.equals("confirmed") || mode.equals("lost") ? 1 : 0,
                            writes.get(),
                            mode);
                }
            }
    }

    @Test
    void sessionAcceptIsProofApiRoleAndAttemptBoundAndKeepsReusableKeysAfterConfirmation()
            throws Exception {
        for (var api : ApiVersion.values())
            for (boolean discard : List.of(false, true)) {
                var fixture = new Fixture(api, false, false);
                var writes = new AtomicInteger();
                ResourceExchange remote =
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                if (url.contains("/destination-api/") && url.contains("/keys?"))
                                    return "{\"keys\":["
                                            + registration
                                            + ","
                                            + signingRegistration("synthetic-sign")
                                            + "],\"offset\":0,\"count\":2,\"totalCount\":2}";
                                return fixture.get(url, headers);
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                try {
                                    checkedReceipt(
                                            new SignedReceipt(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(SUB),
                                                    UUID.fromString(CASE),
                                                    "accept",
                                                    "synthetic-sign",
                                                    body),
                                            "accept");
                                } catch (Exception failure) {
                                    throw new AssertionError(failure);
                                }
                                writes.incrementAndGet();
                                return new Response(204, "");
                            }
                        };
                try (var registry = registry();
                        var content = new ContentStore(workspace);
                        var sessions =
                                new SessionManager(
                                        registry,
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        ignored -> remote,
                                        content)) {
                    String owner =
                            sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                    .sessionId();
                    sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                    sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                    sessions.resource(api, owner, "import_key", DEST, 0, "sign", pem);
                    byte[] schema =
                            fixture.schemas().get(Fixture.SCHEMA).getBytes(StandardCharsets.UTF_8);
                    String handle = content.begin(owner, schema.length).contentId();
                    content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
                    String catalog =
                            new Gson()
                                    .toJson(
                                            Map.of(
                                                    "schemas",
                                                    List.of(
                                                            Map.of(
                                                                    "uri",
                                                                    Fixture.SCHEMA,
                                                                    "contentId",
                                                                    handle))));
                    var proof =
                            (ReceiveStore.Summary)
                                    sessions.verify(api, owner, DEST, SUB, catalog).data();
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    var prepared =
                            (SessionManager.PreparedReceipt)
                                    sessions.prepareReceipt(api, owner, request, proof.proofId())
                                            .data();
                    assertEquals(proof.warnings(), prepared.warnings());
                    assertWorkspaceEmpty(content.workspace(owner));
                    String other =
                            sessions.open(api, SessionRole.ONLINE_SERVICE, "other", "secret")
                                    .sessionId();
                    String attempt = prepared.attempt().attemptId();
                    assertThrows(
                            SessionException.class,
                            () -> sessions.receipt(api, other, "execute_receipt", attempt));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    sessions.receipt(
                                            api == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2,
                                            owner,
                                            "execute_receipt",
                                            attempt));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    sessions.receipt(
                                            api,
                                            owner,
                                            "execute_receipt",
                                            UUID.randomUUID().toString()));
                    if (discard) {
                        sessions.received(api, owner, "discard_received", proof.proofId(), null, 0);
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                    } else {
                        assertEquals(
                                "confirmed",
                                ((ReceiptAccess.State)
                                                sessions.receipt(
                                                                api,
                                                                owner,
                                                                "execute_receipt",
                                                                attempt)
                                                        .data())
                                        .status());
                        assertThrows(
                                SessionException.class,
                                () ->
                                        sessions.received(
                                                api,
                                                owner,
                                                "list_received_contents",
                                                proof.proofId(),
                                                null,
                                                0));
                        assertEquals(
                                2,
                                ((DestinationAccess.KeyState)
                                                sessions.resource(
                                                                api,
                                                                owner,
                                                                "loaded_keys",
                                                                null,
                                                                0,
                                                                null,
                                                                null)
                                                        .data())
                                        .keys()
                                        .size());
                    }
                    assertEquals(discard ? 0 : 1, writes.get());
                }
            }
    }

    private static void checkedReceiptUnchecked(String body) {
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

    @Test
    void sessionEventLogsNeedNoPrivateKeyAndRetireResultsOnFailureReplacementAndLogout()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var fixture = new Fixture(api, false, false);
            var unavailable = new java.util.concurrent.atomic.AtomicBoolean();
            ResourceExchange remote =
                    (url, headers) -> {
                        assertFalse(
                                url.endsWith("/submissions/" + SUB),
                                "Event Log must not require an available envelope");
                        if (unavailable.get()) throw new SessionException("resource_unavailable");
                        if (url.contains("/destination-api/") && url.contains("/keys?"))
                            return "{\"keys\":["
                                    + registration
                                    + "],\"offset\":0,\"count\":1,\"totalCount\":1}";
                        return fixture.get(url, headers);
                    };
            try (var adapters = registry();
                    var content = new ContentStore(workspace);
                    var sessions =
                            new SessionManager(
                                    adapters,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content)) {
                String owner =
                        sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                .sessionId();
                var first =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, owner, DEST, CASE, SUB).data();
                assertEquals(2, first.total());
                assertWorkspaceEmpty(content.workspace(owner));
                var page =
                        (EventLogStore.Page)
                                sessions.eventLogResource(
                                                api,
                                                owner,
                                                "list_event_log",
                                                first.logId(),
                                                null,
                                                null,
                                                0)
                                        .data();
                var chunk =
                        (EventLogStore.Chunk)
                                sessions.eventLogResource(
                                                api,
                                                owner,
                                                "read_event_log",
                                                first.logId(),
                                                page.events().getFirst().eventId(),
                                                "claims",
                                                0)
                                        .data();
                assertTrue(
                        new String(
                                        Base64.getDecoder().decode(chunk.chunk()),
                                        StandardCharsets.UTF_8)
                                .contains("case:" + CASE));
                assertTrue(
                        ((DestinationAccess.KeyState)
                                        sessions.resource(
                                                        api,
                                                        owner,
                                                        "loaded_keys",
                                                        null,
                                                        0,
                                                        null,
                                                        null)
                                                .data())
                                .keys()
                                .isEmpty());
                ApiVersion otherApi = api == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2;
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        otherApi,
                                        owner,
                                        "list_event_log",
                                        first.logId(),
                                        null,
                                        null,
                                        0));
                var second =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, owner, DEST, CASE, SUB).data();
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        owner,
                                        "list_event_log",
                                        first.logId(),
                                        null,
                                        null,
                                        0));
                unavailable.set(true);
                assertThrows(
                        SessionException.class,
                        () -> sessions.loadEventLog(api, owner, DEST, CASE, SUB));
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        owner,
                                        "list_event_log",
                                        second.logId(),
                                        null,
                                        null,
                                        0));
                unavailable.set(false);
                var invalidated =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, owner, DEST, CASE, SUB).data();
                assertThrows(
                        SessionException.class,
                        () -> sessions.loadEventLog(api, owner, DEST, "invalid", SUB));
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        owner,
                                        "list_event_log",
                                        invalidated.logId(),
                                        null,
                                        null,
                                        0));
                String otherOwner =
                        sessions.open(api, SessionRole.ONLINE_SERVICE, "other-id", "other-secret")
                                .sessionId();
                var owned =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, owner, DEST, CASE, SUB).data();
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        otherOwner,
                                        "list_event_log",
                                        owned.logId(),
                                        null,
                                        null,
                                        0));
                var replacement =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, otherOwner, DEST, CASE, SUB).data();
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        owner,
                                        "list_event_log",
                                        owned.logId(),
                                        null,
                                        null,
                                        0));
                sessions.close(api, owner);
                assertEquals(
                        2,
                        ((EventLogStore.Page)
                                        sessions.eventLogResource(
                                                        api,
                                                        otherOwner,
                                                        "list_event_log",
                                                        replacement.logId(),
                                                        null,
                                                        null,
                                                        0)
                                                .data())
                                .total());
                sessions.resource(api, otherOwner, "load_destination", DEST, 0, null, null);
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        otherOwner,
                                        "list_event_log",
                                        replacement.logId(),
                                        null,
                                        null,
                                        0));
                var last =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, otherOwner, DEST, CASE, SUB).data();
                sessions.close(api, otherOwner);
                assertThrows(
                        SessionException.class,
                        () ->
                                sessions.eventLogResource(
                                        api,
                                        otherOwner,
                                        "list_event_log",
                                        last.logId(),
                                        null,
                                        null,
                                        0));
            }
        }
    }

    @Test
    void eventLogProtocolReturnsOnlyBoundedPublicDataForBothSdkVersions() throws Exception {
        for (var api : ApiVersion.values()) {
            var fixture = new Fixture(api, false, false);
            try (var adapters = registry();
                    var content = new ContentStore(workspace);
                    var sessions =
                            new SessionManager(
                                    adapters,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> fixture,
                                    content);
                    var engine = new Engine(adapters, sessions)) {
                String owner =
                        sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                .sessionId();
                var request =
                        command(
                                api,
                                owner,
                                "load_event_log",
                                "destinationId",
                                DEST,
                                "caseId",
                                CASE,
                                "submissionId",
                                SUB);
                var summary = success(engine.handle(request.toString()));
                String log = summary.get("logId").getAsString();
                assertEquals(2, summary.get("total").getAsInt());
                assertFalse(summary.toString().contains("synthetic-token"));
                var list = command(api, owner, "list_event_log", "logId", log, "offset", 0);
                var page = success(engine.handle(list.toString()));
                assertFalse(page.toString().contains("claimsJson"));
                String event =
                        page.getAsJsonArray("events")
                                .get(0)
                                .getAsJsonObject()
                                .get("eventId")
                                .getAsString();
                var read =
                        command(
                                api,
                                owner,
                                "read_event_log",
                                "logId",
                                log,
                                "eventId",
                                event,
                                "part",
                                "claims",
                                "byteOffset",
                                0);
                var payload = success(engine.handle(read.toString()));
                assertTrue(payload.get("complete").getAsBoolean());
                assertTrue(
                        new String(
                                        Base64.getDecoder()
                                                .decode(payload.get("chunk").getAsString()),
                                        StandardCharsets.UTF_8)
                                .contains("submission:" + SUB));
                for (var malformed :
                        List.of(request.deepCopy(), list.deepCopy(), read.deepCopy())) {
                    malformed.addProperty("unexpected", "synthetic");
                    assertFalse(
                            JsonParser.parseString(engine.handle(malformed.toString()))
                                    .getAsJsonObject()
                                    .get("ok")
                                    .getAsBoolean());
                }
                read.addProperty("part", "private");
                assertFalse(
                        JsonParser.parseString(engine.handle(read.toString()))
                                .getAsJsonObject()
                                .get("ok")
                                .getAsBoolean());
                success(
                        engine.handle(
                                command(api, owner, "discard_event_log", "logId", log).toString()));
                assertFalse(
                        JsonParser.parseString(engine.handle(list.toString()))
                                .getAsJsonObject()
                                .get("ok")
                                .getAsBoolean());
            }
        }
    }

    @Test
    void caseLogsVerifyMultipleSubjectsAndNeverRequireContentOrPrivateKeys() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new Fixture(api, false, false);
                    var original =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    var decoded =
                            JsonParser.parseString(
                                            new String(
                                                    Base64.getUrlDecoder()
                                                            .decode(
                                                                    original.get(1)
                                                                            .getAsString()
                                                                            .split("\\.")[1]),
                                                    StandardCharsets.UTF_8))
                                    .getAsJsonObject();
                    var tags =
                            decoded.getAsJsonObject("events")
                                    .entrySet()
                                    .iterator()
                                    .next()
                                    .getValue()
                                    .getAsJsonObject()
                                    .getAsJsonObject("authenticationTags");
                    String reply = UUID.randomUUID().toString();
                    for (String attack : List.of("", "case", "signature", "subject", "empty")) {
                        var tokens = original.deepCopy();
                        tokens.add(event("create-reply", null, 0, "reply:" + reply, CASE));
                        String token =
                                event(
                                        "submit-reply",
                                        tags,
                                        0,
                                        (attack.equals("subject") ? "submission:" : "reply:")
                                                + reply,
                                        attack.equals("case")
                                                ? UUID.randomUUID().toString()
                                                : CASE);
                        if (attack.equals("signature")) {
                            var parts = token.split("\\.");
                            parts[2] =
                                    (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
                            token = String.join(".", parts);
                        }
                        tokens.add(token);
                        if (attack.equals("empty")) tokens = new JsonArray();
                        var page = new JsonObject();
                        page.addProperty("offset", 0);
                        page.addProperty("count", tokens.size());
                        page.addProperty("totalCount", tokens.size());
                        page.add("eventLog", tokens);
                        try (var source =
                                EventLogAccess.forCase(
                                        api,
                                        CASE,
                                        (url, headers) -> {
                                            if (url.contains("/events?")) return page.toString();
                                            assertTrue(
                                                    url.contains("/keys/")
                                                            || url.endsWith(
                                                                    "/.well-known/jwks.json"),
                                                    "Case logs must not read content");
                                            return fixture.get(url, headers);
                                        })) {
                            if (attack.isEmpty() || attack.equals("empty")) {
                                var log =
                                        registry.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.caseEventLog(
                                                                UUID.fromString(CASE),
                                                                source,
                                                                workspace));
                                assertEquals(attack.isEmpty() ? 4 : 0, log.entries().size());
                                if (attack.isEmpty()) {
                                    assertEquals(
                                            "submission", log.entries().getFirst().subjectType());
                                    assertEquals("reply", log.entries().getLast().subjectType());
                                    assertEquals(
                                            UUID.fromString(reply),
                                            log.entries().getLast().subjectId());
                                }
                            } else
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                registry.withSession(
                                                        api,
                                                        session,
                                                        value ->
                                                                value.caseEventLog(
                                                                        UUID.fromString(CASE),
                                                                        source,
                                                                        workspace)),
                                        api + ": " + attack);
                        }
                    }
                }
        }
    }

    @Test
    void bothSdksVerifyEventLogsWithoutPrivateKeysOrSubmissionContent() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new Fixture(api, false, false);
                    var contentReads = new AtomicInteger();
                    ResourceExchange remote =
                            (url, headers) -> {
                                if (url.endsWith("/submissions/" + SUB)) {
                                    contentReads.incrementAndGet();
                                    throw new SessionException("resource_missing");
                                }
                                return fixture.get(url, headers);
                            };
                    try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.eventLog(
                                                        UUID.fromString(DEST),
                                                        UUID.fromString(CASE),
                                                        UUID.fromString(SUB),
                                                        source,
                                                        workspace));
                        assertEquals(2, result.entries().size());
                        assertEquals(UUID.fromString(SUB), result.submissionId());
                        assertEquals(
                                List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"),
                                result.warnings());
                        assertTrue(
                                result.entries()
                                        .get(1)
                                        .claimsJson()
                                        .contains("authenticationTags"));
                        assertTrue(result.entries().get(1).headerJson().contains("PS512"));
                        assertEquals(0, contentReads.get());
                        assertTrue(
                                registry.withSession(api, session, s -> s.loadedKeys()).isEmpty());
                    }
                }
        }
    }

    @Test
    void sdkWrappingDoesNotHideReadFailuresDuringReceiveOrEventLogVerification() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    var fixture = new Fixture(api, false, false);
                    for (String code :
                            List.of(
                                    "resource_denied",
                                    "resource_missing",
                                    "resource_unavailable",
                                    "endpoint_blocked"))
                        for (String failedPath : List.of("/events?", "/.well-known/jwks.json")) {
                            ResourceExchange remote =
                                    (url, headers) -> {
                                        if (url.contains(failedPath))
                                            throw new SessionException(code);
                                        return fixture.get(url, headers);
                                    };
                            try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                                assertEquals(
                                        code,
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                session.receive(
                                                                        DEST,
                                                                        SUB,
                                                                        read,
                                                                        workspace,
                                                                        fixture.schemas()))
                                                .code(),
                                        api + " receive");
                                assertThrows(
                                        SessionException.class,
                                        () -> session.receiptEvidence(DEST, SUB));
                            }
                            try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
                                assertEquals(
                                        code,
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                session.eventLog(
                                                                        UUID.fromString(DEST),
                                                                        UUID.fromString(CASE),
                                                                        UUID.fromString(SUB),
                                                                        source,
                                                                        workspace))
                                                .code(),
                                        api + " events");
                            }
                        }
                }
        }
    }

    @Test
    void testServiceKeysWithoutCertificatesAndOfficialTestIssuersWorkForReceiveAndEventLogs()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                for (String issuer :
                        List.of(
                                "https://test.fit-connect.fitko.dev",
                                "https://submission-api-testing.fit-connect.fitko.dev"))
                    try (var session = open(registry, api)) {
                        session.importKey(DEST, "decrypt", pem, List.of(registration));
                        var fixture = new Fixture(api, false, false);
                        ResourceExchange remote =
                                (url, headers) -> {
                                    String body = fixture.get(url, headers);
                                    if (url.endsWith("/.well-known/jwks.json")) {
                                        var document =
                                                JsonParser.parseString(body).getAsJsonObject();
                                        for (var key : document.getAsJsonArray("keys")) {
                                            key.getAsJsonObject().remove("x5c");
                                            key.getAsJsonObject().remove("use");
                                        }
                                        return document.toString();
                                    }
                                    if (url.contains("/events?")) {
                                        var page = JsonParser.parseString(body).getAsJsonObject();
                                        var events = page.getAsJsonArray("eventLog");
                                        for (int i = 0; i < events.size(); i++) {
                                            String[] parts =
                                                    events.get(i).getAsString().split("\\.");
                                            var claims =
                                                    JsonParser.parseString(
                                                                    new String(
                                                                            Base64.getUrlDecoder()
                                                                                    .decode(
                                                                                            parts[
                                                                                                    1]),
                                                                            StandardCharsets.UTF_8))
                                                            .getAsJsonObject();
                                            claims.addProperty("iss", issuer);
                                            String payload =
                                                    parts[0]
                                                            + "."
                                                            + b64(
                                                                    claims.toString()
                                                                            .getBytes(
                                                                                    StandardCharsets
                                                                                            .UTF_8));
                                            try {
                                                var signer = Signature.getInstance("RSASSA-PSS");
                                                signer.setParameter(
                                                        new PSSParameterSpec(
                                                                "SHA-512",
                                                                "MGF1",
                                                                MGF1ParameterSpec.SHA512,
                                                                64,
                                                                1));
                                                signer.initSign(privateKey);
                                                signer.update(
                                                        payload.getBytes(
                                                                StandardCharsets.US_ASCII));
                                                events.set(
                                                        i,
                                                        new JsonPrimitive(
                                                                payload
                                                                        + "."
                                                                        + b64(signer.sign())));
                                            } catch (Exception failure) {
                                                throw new AssertionError(failure);
                                            }
                                        }
                                        return page.toString();
                                    }
                                    return body;
                                };
                        try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                            assertArrayEquals(
                                    fixture.data,
                                    session.receive(DEST, SUB, read, workspace, fixture.schemas())
                                            .data());
                        }
                        try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
                            assertEquals(
                                    2,
                                    session.eventLog(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(CASE),
                                                    UUID.fromString(SUB),
                                                    source,
                                                    workspace)
                                            .entries()
                                            .size());
                        }
                    }
        }
    }

    @Test
    void sdkEventLogsRejectTamperingForeignSubjectsAmbiguousSubmitAndIncompletePages()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new Fixture(api, false, false);
                    for (String mode :
                            List.of(
                                    "wrong-subject",
                                    "wrong-subject-type",
                                    "wrong-case",
                                    "wrong-issuer",
                                    "duplicate-id",
                                    "duplicate-submit",
                                    "tampered",
                                    "missing-page",
                                    "empty")) {
                        var page = JsonParser.parseString(fixture.events).getAsJsonObject();
                        var events = page.getAsJsonArray("eventLog");
                        if (mode.equals("empty")) {
                            events = new JsonArray();
                            page.add("eventLog", events);
                            page.addProperty("totalCount", 0);
                        } else if (mode.equals("missing-page")) events.remove(1);
                        else if (mode.equals("duplicate-submit")) {
                            var claims =
                                    JsonParser.parseString(
                                                    new String(
                                                            Base64.getUrlDecoder()
                                                                    .decode(
                                                                            events.get(1)
                                                                                    .getAsString()
                                                                                    .split("\\.")[
                                                                                    1]),
                                                            StandardCharsets.UTF_8))
                                            .getAsJsonObject();
                            events.add(
                                    event(
                                            "submit-submission",
                                            claims.getAsJsonObject("events")
                                                    .getAsJsonObject(
                                                            "https://schema.fitko.de/fit-connect/events/submit-submission")
                                                    .getAsJsonObject("authenticationTags"),
                                            0));
                            page.addProperty("totalCount", 3);
                        } else {
                            String wire = events.get(1).getAsString();
                            if (mode.equals("tampered")) {
                                int at = wire.lastIndexOf('.') + 1;
                                wire =
                                        wire.substring(0, at)
                                                + (wire.charAt(at) == 'A' ? 'B' : 'A')
                                                + wire.substring(at + 1);
                            } else {
                                String[] parts = wire.split("\\.");
                                var claims =
                                        JsonParser.parseString(
                                                        new String(
                                                                Base64.getUrlDecoder()
                                                                        .decode(parts[1]),
                                                                StandardCharsets.UTF_8))
                                                .getAsJsonObject();
                                if (mode.equals("wrong-subject"))
                                    claims.addProperty("sub", "submission:" + Fixture.ATT);
                                if (mode.equals("wrong-subject-type"))
                                    claims.addProperty("sub", "reply:" + SUB);
                                if (mode.equals("wrong-case"))
                                    claims.addProperty("txn", "case:" + Fixture.ATT);
                                if (mode.equals("wrong-issuer"))
                                    claims.addProperty(
                                            "iss",
                                            "https://prod.fit-connect.fitko.net/submission-api");
                                if (mode.equals("duplicate-id"))
                                    claims.add(
                                            "jti",
                                            JsonParser.parseString(
                                                            new String(
                                                                    Base64.getUrlDecoder()
                                                                            .decode(
                                                                                    events.get(0)
                                                                                            .getAsString()
                                                                                            .split(
                                                                                                    "\\.")[
                                                                                            1]),
                                                                    StandardCharsets.UTF_8))
                                                    .getAsJsonObject()
                                                    .get("jti"));
                                String payload =
                                        parts[0]
                                                + "."
                                                + b64(
                                                        claims.toString()
                                                                .getBytes(StandardCharsets.UTF_8));
                                var signer = Signature.getInstance("RSASSA-PSS");
                                signer.setParameter(
                                        new PSSParameterSpec(
                                                "SHA-512",
                                                "MGF1",
                                                MGF1ParameterSpec.SHA512,
                                                64,
                                                1));
                                signer.initSign(privateKey);
                                signer.update(payload.getBytes(StandardCharsets.US_ASCII));
                                wire = payload + "." + b64(signer.sign());
                            }
                            events.set(1, new JsonPrimitive(wire));
                        }
                        page.addProperty("count", events.size());
                        String body = page.toString();
                        try (var source =
                                new EventLogAccess(
                                        api,
                                        CASE,
                                        SUB,
                                        (url, headers) ->
                                                url.contains("/events?")
                                                        ? body
                                                        : fixture.get(url, headers))) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.eventLog(
                                                                    UUID.fromString(DEST),
                                                                    UUID.fromString(CASE),
                                                                    UUID.fromString(SUB),
                                                                    source,
                                                                    workspace)),
                                    mode);
                        }
                    }
                }
        }
    }

    @Test
    void bothSdksCollectAndVerifyEveryPageOfALargerEventLog() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new Fixture(api, false, false);
                    var all =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    for (int i = 0; i < 99; i++) all.add(event("notify-submission", null, 0));
                    var first = new JsonObject();
                    first.addProperty("offset", 0);
                    first.addProperty("count", 100);
                    first.addProperty("totalCount", 101);
                    var firstEvents = new JsonArray();
                    for (int i = 0; i < 100; i++) firstEvents.add(all.get(i));
                    first.add("eventLog", firstEvents);
                    var second = new JsonObject();
                    second.addProperty("offset", 100);
                    second.addProperty("count", 1);
                    second.addProperty("totalCount", 101);
                    var last = new JsonArray();
                    last.add(all.get(100));
                    second.add("eventLog", last);
                    var pages = new AtomicInteger();
                    try (var source =
                            new EventLogAccess(
                                    api,
                                    CASE,
                                    SUB,
                                    (url, headers) -> {
                                        if (!url.contains("/events?"))
                                            return fixture.get(url, headers);
                                        pages.incrementAndGet();
                                        return url.contains("offset=100")
                                                ? second.toString()
                                                : first.toString();
                                    })) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.eventLog(
                                                        UUID.fromString(DEST),
                                                        UUID.fromString(CASE),
                                                        UUID.fromString(SUB),
                                                        source,
                                                        workspace));
                        assertEquals(101, result.entries().size());
                        assertEquals(2, pages.get());
                        assertEquals(
                                99,
                                result.entries().stream()
                                        .filter(e -> e.eventType().endsWith("notify-submission"))
                                        .count());
                    }
                }
        }
    }

    @Test
    void largeEventLogsReuseTrustKeysWithinOneVerificationAndRefreshOnTheNextRead()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new Fixture(api, false, false);
                    var tokens =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    for (int i = 0; i < 298; i++) tokens.add(event("notify-submission", null, 0));
                    var keys = new AtomicInteger();
                    for (int repeat = 0; repeat < 2; repeat++) {
                        try (var source =
                                new EventLogAccess(
                                        api,
                                        CASE,
                                        SUB,
                                        (url, headers) -> {
                                            if (url.endsWith("/.well-known/jwks.json"))
                                                keys.incrementAndGet();
                                            if (!url.contains("/events?"))
                                                return fixture.get(url, headers);
                                            var params = new HashMap<String, Integer>();
                                            for (String pair :
                                                    java.net
                                                            .URI
                                                            .create(url)
                                                            .getRawQuery()
                                                            .split("&")) {
                                                var parts = pair.split("=");
                                                params.put(parts[0], Integer.parseInt(parts[1]));
                                            }
                                            int offset = params.get("offset"),
                                                    end =
                                                            Math.min(
                                                                    tokens.size(),
                                                                    offset + params.get("limit"));
                                            var page = new JsonObject();
                                            page.addProperty("offset", offset);
                                            page.addProperty("count", end - offset);
                                            page.addProperty("totalCount", tokens.size());
                                            var items = new JsonArray();
                                            for (int i = offset; i < end; i++)
                                                items.add(tokens.get(i));
                                            page.add("eventLog", items);
                                            return page.toString();
                                        })) {
                            assertEquals(
                                    300,
                                    session.eventLog(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(CASE),
                                                    UUID.fromString(SUB),
                                                    source,
                                                    workspace)
                                            .entries()
                                            .size());
                        }
                        assertEquals(
                                repeat + 1,
                                keys.get(),
                                "One key fetch per verification, fresh keys for the next verification");
                    }
                }
        }
    }

    private static String signingRegistration(String kid) {
        var key = JsonParser.parseString(registration).getAsJsonObject();
        key.addProperty("kid", kid);
        key.addProperty("alg", "PS512");
        key.addProperty("use", "sig");
        var ops = new JsonArray();
        ops.add("verify");
        key.add("key_ops", ops);
        return key.toString();
    }

    private static JsonObject checkedReceipt(SignedReceipt receipt, String action)
            throws Exception {
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

    @Test
    void nativeProtocolRetainsProofAcrossReadsAndInvalidatesItOnFailureKeyChangeLookupAndLogout()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var activeFixture =
                    new java.util.concurrent.atomic.AtomicReference<>(
                            new Fixture(api, false, false));
            var registered = new java.util.concurrent.atomic.AtomicBoolean(true);
            var envelopeReads = new AtomicInteger();
            ResourceExchange remote =
                    (url, headers) -> {
                        if (url.contains("/destination-api/") && url.contains("/keys?"))
                            return "{\"keys\":["
                                    + (registered.get() ? registration : "")
                                    + "],\"offset\":0,\"count\":"
                                    + (registered.get() ? 1 : 0)
                                    + ",\"totalCount\":"
                                    + (registered.get() ? 1 : 0)
                                    + "}";
                        if (url.endsWith("/submissions/" + SUB)) envelopeReads.incrementAndGet();
                        return activeFixture.get().get(url, headers);
                    };
            try (var registry = registry();
                    var content = new ContentStore(workspace);
                    var sessions =
                            new SessionManager(
                                    registry,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content);
                    var engine = new Engine(registry, sessions)) {
                String owner =
                        sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                .sessionId();
                sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                byte[] schema =
                        activeFixture
                                .get()
                                .schemas()
                                .get(Fixture.SCHEMA)
                                .getBytes(StandardCharsets.UTF_8);
                String handle = content.begin(owner, schema.length).contentId();
                content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
                String catalog =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemas",
                                                List.of(
                                                        Map.of(
                                                                "uri",
                                                                Fixture.SCHEMA,
                                                                "contentId",
                                                                handle))));
                var request =
                        command(
                                api,
                                owner,
                                "verify_submission",
                                "destinationId",
                                DEST,
                                "submissionId",
                                SUB,
                                "schemaDocument",
                                catalog);
                var result = success(engine.handle(request.toString()));
                String proof = result.get("proofId").getAsString();
                var log =
                        (EventLogStore.Summary)
                                sessions.loadEventLog(api, owner, DEST, CASE, SUB).data();
                sessions.eventLogResource(
                        api, owner, "discard_event_log", log.logId(), null, null, 0);
                assertFalse(result.toString().contains("Erika"));
                assertFalse(result.toString().contains("synthetic-token"));
                assertEquals(3, result.get("partCount").getAsInt());
                var pageRequest =
                        command(
                                api,
                                owner,
                                "list_received_contents",
                                "proofId",
                                proof,
                                "offset",
                                0);
                var page = success(engine.handle(pageRequest.toString()));
                var data = page.getAsJsonArray("parts").get(1).getAsJsonObject();
                String read =
                        command(
                                        api,
                                        owner,
                                        "read_received_content",
                                        "proofId",
                                        proof,
                                        "contentId",
                                        data.get("contentId").getAsString(),
                                        "byteOffset",
                                        0)
                                .toString();
                assertArrayEquals(
                        activeFixture.get().data,
                        Base64.getDecoder()
                                .decode(success(engine.handle(read)).get("chunk").getAsString()));
                // Closing a preview has no native mutation. Repeated reads retain the exact same
                // proof and bytes.
                assertArrayEquals(
                        activeFixture.get().data,
                        Base64.getDecoder()
                                .decode(success(engine.handle(read)).get("chunk").getAsString()));
                assertEquals(
                        proof,
                        success(engine.handle(pageRequest.toString()))
                                .get("proofId")
                                .getAsString());
                var last =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "list_received_contents",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        2)
                                                .toString()));
                assertEquals(
                        "Synthetische Beschreibung",
                        last.getAsJsonArray("parts")
                                .get(0)
                                .getAsJsonObject()
                                .get("description")
                                .getAsString());
                assertWorkspaceEmpty(content.workspace(owner));
                pageRequest.addProperty("apiVersion", api == ApiVersion.V2 ? "v3" : "v2");
                assertEquals("session_missing", failure(engine.handle(pageRequest.toString())));
                pageRequest.addProperty("apiVersion", api.wireValue());
                activeFixture.set(new Fixture(api, false, true));
                assertEquals("verification_failed", failure(engine.handle(request.toString())));
                assertEquals("invalid_resource", failure(engine.handle(read)));
                assertWorkspaceEmpty(content.workspace(owner));
                activeFixture.set(new Fixture(api, false, false));
                proof = success(engine.handle(request.toString())).get("proofId").getAsString();
                assertEquals(
                        1,
                        ((DestinationAccess.KeyState)
                                        sessions.resource(
                                                        api,
                                                        owner,
                                                        "loaded_keys",
                                                        null,
                                                        0,
                                                        null,
                                                        null)
                                                .data())
                                .keys()
                                .size());
                sessions.lookup(api, owner, "load_submission", DEST, SUB, 0);
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "list_received_contents",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString())));
                // A fresh receive still reuses the private key, but a withdrawn registration
                // removes it before reading ciphertext.
                proof = success(engine.handle(request.toString())).get("proofId").getAsString();
                int before = envelopeReads.get();
                registered.set(false);
                assertEquals("key_missing", failure(engine.handle(request.toString())));
                assertEquals(before, envelopeReads.get());
                assertEquals(
                        0,
                        ((DestinationAccess.KeyState)
                                        sessions.resource(
                                                        api,
                                                        owner,
                                                        "loaded_keys",
                                                        null,
                                                        0,
                                                        null,
                                                        null)
                                                .data())
                                .keys()
                                .size());
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "list_received_contents",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString())));
                registered.set(true);
                sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                proof = success(engine.handle(request.toString())).get("proofId").getAsString();
                String discard =
                        command(api, owner, "discard_received", "proofId", proof).toString();
                success(engine.handle(discard));
                assertEquals("invalid_resource", failure(engine.handle(discard)));
                proof = success(engine.handle(request.toString())).get("proofId").getAsString();
                sessions.resource(api, owner, "discard_keys", null, 0, null, null);
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "list_received_contents",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString())));
                sessions.close(api, owner);
                assertEquals("session_missing", failure(engine.handle(read)));
            }
        }
    }

    @Test
    void retainedKeysRequireTheExactCurrentRegistrationNotJustItsKid() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(registration));
                                s.discardReceived();
                                return null;
                            });
                    assertEquals(1, session.loadedKeys().size());
                    var changed = JsonParser.parseString(registration).getAsJsonObject();
                    changed.addProperty("alg", "PS512");
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(changed.toString()));
                                return null;
                            });
                    assertTrue(session.loadedKeys().isEmpty());
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    changed.addProperty("n", "AQAB");
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.retainKeys(DEST, List.of(changed.toString()));
                                                return null;
                                            }));
                    assertTrue(session.loadedKeys().isEmpty());
                }
        }
    }

    private static JsonObject command(ApiVersion api, String owner, String name, Object... fields) {
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

    private static JsonObject success(String response) {
        assertTrue(response.getBytes(StandardCharsets.UTF_8).length < FrameCodec.MAX_BYTES);
        var value = JsonParser.parseString(response).getAsJsonObject();
        assertTrue(value.get("ok").getAsBoolean(), response);
        return value.getAsJsonObject("result").getAsJsonObject("data");
    }

    private static String failure(String response) {
        var value = JsonParser.parseString(response).getAsJsonObject();
        assertFalse(value.get("ok").getAsBoolean());
        return value.get("error").getAsString();
    }

    private static void assertWorkspaceEmpty(Path directory) throws Exception {
        try (var files = Files.list(directory)) {
            assertEquals(0, files.count());
        }
    }

    @Test
    void validEncryptionAndSignedEventsCannotHideAWrongContentHash() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new Fixture(api, false, true);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        var failure =
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                registry.withSession(
                                                        api,
                                                        session,
                                                        s ->
                                                                s.receive(
                                                                        DEST,
                                                                        SUB,
                                                                        scope,
                                                                        workspace,
                                                                        fixture.schemas())));
                        assertEquals("verification_failed", failure.code());
                    }
                }
        }
    }

    @Test
    void unsupportedAmbiguousMetadataAndMissingSchemasCannotReleasePlaintext() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (var rewrite :
                            List.<java.util.function.UnaryOperator<String>>of(
                                    s -> s.replace("metadata/2.0.0/", "metadata/1.5.0/"),
                                    s ->
                                            s.replace(
                                                    "\"$schema\":",
                                                    "\"$schema\":\"https://example.invalid/other\",\"$schema\":"),
                                    s -> s.replace("Anlage.txt", "../outside.txt"),
                                    s -> s.replace("Anlage.txt", "NUL.txt"))) {
                        var fixture = new Fixture(api, false, false, rewrite);
                        try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST,
                                                                    SUB,
                                                                    scope,
                                                                    workspace,
                                                                    fixture.schemas())));
                        }
                    }
                    var fixture = new Fixture(api, false, false);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST, SUB, scope, workspace,
                                                                Map.of())));
                    }
                }
        }
    }

    @Test
    void tamperedJweAndSignedEventAndDuplicateSubmitEventsFailBothSdkPipelines() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (String attack : List.of("ciphertext", "signature", "duplicate-submit")) {
                        var fixture = new Fixture(api, false, false);
                        ResourceExchange remote =
                                (url, headers) -> {
                                    String response = fixture.get(url, headers);
                                    var document =
                                            url.contains("/events?")
                                                            || url.endsWith("/submissions/" + SUB)
                                                    ? JsonParser.parseString(response)
                                                            .getAsJsonObject()
                                                    : null;
                                    if (attack.equals("ciphertext")
                                            && url.endsWith("/submissions/" + SUB)) {
                                        String[] parts = fixture.encryptedData.split("\\.");
                                        parts[3] =
                                                (parts[3].charAt(0) == 'A' ? "B" : "A")
                                                        + parts[3].substring(1);
                                        document.addProperty(
                                                "encryptedData", String.join(".", parts));
                                    }
                                    if (url.contains("/events?")) {
                                        var events = document.getAsJsonArray("eventLog");
                                        if (attack.equals("signature")) {
                                            String[] parts =
                                                    events.get(1).getAsString().split("\\.");
                                            parts[2] =
                                                    (parts[2].charAt(0) == 'A' ? "B" : "A")
                                                            + parts[2].substring(1);
                                            events.set(
                                                    1, new JsonPrimitive(String.join(".", parts)));
                                        } else if (attack.equals("duplicate-submit")) {
                                            var claims =
                                                    JsonParser.parseString(
                                                                    new String(
                                                                            Base64.getUrlDecoder()
                                                                                    .decode(
                                                                                            events.get(
                                                                                                            1)
                                                                                                    .getAsString()
                                                                                                    .split(
                                                                                                            "\\.")[
                                                                                                    1]),
                                                                            StandardCharsets.UTF_8))
                                                            .getAsJsonObject();
                                            try {
                                                events.add(
                                                        event(
                                                                "submit-submission",
                                                                claims.getAsJsonObject("events")
                                                                        .getAsJsonObject(
                                                                                "https://schema.fitko.de/fit-connect/events/submit-submission")
                                                                        .getAsJsonObject(
                                                                                "authenticationTags"),
                                                                0));
                                            } catch (Exception failure) {
                                                throw new AssertionError(failure);
                                            }
                                            document.addProperty("count", 3);
                                            document.addProperty("totalCount", 3);
                                        }
                                    }
                                    return document == null ? response : document.toString();
                                };
                        try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST,
                                                                    SUB,
                                                                    scope,
                                                                    workspace,
                                                                    fixture.schemas())),
                                    api + " " + attack);
                        }
                    }
                }
        }
    }

    @Test
    void schemaReferencesCannotBypassTheNativeReadTransport() throws Exception {
        var requests = new AtomicInteger();
        var server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/schema",
                exchange -> {
                    requests.incrementAndGet();
                    byte[] response = "{\"type\":\"object\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    try (var out = exchange.getResponseBody()) {
                        out.write(response);
                    }
                });
        server.start();
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new Fixture(api, false, false);
                    var schemas =
                            Map.of(
                                    Fixture.SCHEMA,
                                    "{\"$ref\":\"http://127.0.0.1:"
                                            + server.getAddress().getPort()
                                            + "/schema\"}");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST, SUB, scope, workspace,
                                                                schemas)));
                    }
                    assertEquals(
                            0,
                            requests.get(),
                            "SDK sub-schema loaders must not bypass the native transport");
                }
        } finally {
            server.stop(0);
        }
    }

    @Test
    void v3ReceivesMetadataThreeAndCanReadAgainWithoutReimportingTheKey() throws Exception {
        try (var registry = registry();
                var session = open(registry, ApiVersion.V3)) {
            registry.withSession(
                    ApiVersion.V3,
                    session,
                    s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
            var fixture =
                    new Fixture(
                            ApiVersion.V3,
                            false,
                            false,
                            s -> s.replace("metadata/2.0.0/", "metadata/3.0.0/"));
            for (int i = 0; i < 2; i++)
                try (var scope = new ReceiveAccess(ApiVersion.V3, DEST, SUB, fixture)) {
                    var result =
                            registry.withSession(
                                    ApiVersion.V3,
                                    session,
                                    s -> s.receive(DEST, SUB, scope, workspace, fixture.schemas()));
                    assertArrayEquals(fixture.metadata, result.metadata());
                    byte[] copy = result.data();
                    copy[0] = 0;
                    assertArrayEquals(fixture.data, result.data());
                }
            assertEquals(1, session.loadedKeys().size());
        }
    }

    @Test
    void compressedDataCannotExpandBeyondTheNativeFileLimit() throws Exception {
        String large = "x".repeat(32 * 1024 * 1024);
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new Fixture(api, true, false, s -> s, large);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST,
                                                                SUB,
                                                                scope,
                                                                workspace,
                                                                fixture.schemas())));
                    }
                }
        }
    }

    @Test
    void bothSdkPipelinesReassembleOnlyTheAnnouncedFragmentsAndVerifyTheirCombinedHash()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    var fixture = new FragmentFixture(api, "Anlage.txt");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        fixture.parent.schemas()));
                        assertEquals(1, result.attachments().size());
                        assertArrayEquals(
                                "Testanlage".getBytes(StandardCharsets.UTF_8),
                                result.attachments().getFirst().bytes());
                        assertEquals("Anlage.txt", result.attachments().getFirst().fileName());
                        assertEquals(2, fixture.downloads.get());
                        var evidence =
                                registry.withSession(
                                        api, session, s -> s.receiptEvidence(DEST, SUB));
                        assertEquals(
                                Map.of(
                                        UUID.fromString(FragmentFixture.FIRST),
                                        fixture.first.split("\\.")[4],
                                        UUID.fromString(FragmentFixture.SECOND),
                                        fixture.second.split("\\.")[4]),
                                evidence.attachments());
                        var request =
                                new ReceiptRequest(
                                        UUID.fromString(DEST),
                                        UUID.fromString(SUB),
                                        UUID.fromString(CASE),
                                        "accept",
                                        null,
                                        null,
                                        null,
                                        null);
                        var claims =
                                checkedReceipt(
                                        registry.withSession(
                                                api,
                                                session,
                                                s -> s.signReceipt(request, workspace)),
                                        "accept");
                        var tags =
                                claims.getAsJsonObject("events")
                                        .getAsJsonObject(
                                                "https://schema.fitko.de/fit-connect/events/accept-submission")
                                        .getAsJsonObject("authenticationTags")
                                        .getAsJsonObject("attachments");
                        assertEquals(
                                Set.of(FragmentFixture.FIRST, FragmentFixture.SECOND),
                                tags.keySet());
                        assertEquals(
                                fixture.first.split("\\.")[4],
                                tags.get(FragmentFixture.FIRST).getAsString());
                        assertEquals(
                                fixture.second.split("\\.")[4],
                                tags.get(FragmentFixture.SECOND).getAsString());
                    }
                }
        }
    }

    @Test
    void bothSdkPipelinesResolveAnExplicitUrnSchemaWithoutNetworkFetching() throws Exception {
        String urn = "urn:synthetic:integration-test:data";
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture =
                            new Fixture(
                                    api, false, false, text -> text.replace(Fixture.SCHEMA, urn));
                    ResourceExchange remote =
                            (url, headers) ->
                                    fixture.get(url, headers).replace(Fixture.SCHEMA, urn);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        Map.of(
                                                                urn,
                                                                fixture.schemas()
                                                                        .get(Fixture.SCHEMA))));
                        assertArrayEquals(fixture.data, result.data());
                    }
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST,
                                                                SUB,
                                                                scope,
                                                                workspace,
                                                                Map.of(
                                                                        urn,
                                                                        "{\"type\":\"string\"}"))));
                    }
                }
        }
    }

    @Test
    void successfulXmlReceptionActuallyValidatesTheProvidedXsd() throws Exception {
        String xml = "<antrag><vorname>Erika</vorname></antrag>";
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture =
                            new Fixture(
                                    api,
                                    false,
                                    false,
                                    text -> text.replace("application/json", "application/xml"),
                                    xml);
                    ResourceExchange remote =
                            (url, headers) ->
                                    fixture.get(url, headers)
                                            .replace("application/json", "application/xml");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        Map.of(
                                                                Fixture.SCHEMA,
                                                                "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"antrag\"><xs:complexType><xs:sequence><xs:element name=\"vorname\" type=\"xs:string\"/></xs:sequence></xs:complexType></xs:element></xs:schema>")));
                        assertArrayEquals(xml.getBytes(StandardCharsets.UTF_8), result.data());
                        assertEquals("application/xml", result.mimeType());
                        assertEquals(Fixture.SCHEMA, result.schemaSnapshot().schemaUri());
                        var snapshot =
                                JsonParser.parseString(result.schemaSnapshot().document())
                                        .getAsJsonObject();
                        assertTrue(
                                snapshot.getAsJsonArray("schemas")
                                        .get(0)
                                        .getAsJsonObject()
                                        .get("text")
                                        .getAsString()
                                        .contains("name=\"vorname\""));
                        assertFalse(
                                result.issues().stream()
                                        .anyMatch(
                                                issue ->
                                                        issue.stage()
                                                                .equals("XML_SCHEMA_NOT_CHECKED")));
                    }
                }
        }
    }

    @Test
    void xmlSyntaxAndDoctypeFailuresCannotHideBehindASkippedXsdCheck() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (String xml :
                            List.of(
                                    "<antrag><vorname>Erika</antrag>",
                                    "<!DOCTYPE antrag [<!ENTITY x SYSTEM 'file:///not-readable'>]><antrag>&x;</antrag>")) {
                        var fixture =
                                new Fixture(
                                        api,
                                        false,
                                        false,
                                        text -> text.replace("application/json", "application/xml"),
                                        xml);
                        ResourceExchange remote =
                                (url, headers) ->
                                        fixture.get(url, headers)
                                                .replace("application/json", "application/xml");
                        try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST, SUB, scope, workspace,
                                                                    Map.of())));
                        }
                    }
                }
        }
    }

    @Test
    void unsafeFragmentFilenamesAreRejectedBeforeTheSdkWritesAnyFragment() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (String filename : List.of("../../../../outside.txt", "NUL.txt")) {
                        var fixture = new FragmentFixture(api, filename);
                        try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST,
                                                                    SUB,
                                                                    scope,
                                                                    workspace,
                                                                    fixture.parent.schemas())));
                        }
                        assertEquals(0, fixture.downloads.get());
                    }
                }
        }
    }

    private static final class FragmentFixture implements ResourceExchange {
        private static final String FIRST = "55555555-5555-4555-8555-555555555555",
                SECOND = "66666666-6666-4666-8666-666666666666";
        final Fixture parent;
        final String first, second, events;
        final AtomicInteger downloads = new AtomicInteger();

        FragmentFixture(ApiVersion api, String filename) throws Exception {
            parent =
                    new Fixture(
                            api,
                            false,
                            false,
                            text ->
                                    text.replace(
                                            "\"filename\":\"Anlage.txt\"",
                                            "\"filename\":\""
                                                    + filename
                                                    + "\",\"fragments\":[\""
                                                    + FIRST
                                                    + "\",\""
                                                    + SECOND
                                                    + "\"]"));
            first = encrypt("Test".getBytes(StandardCharsets.UTF_8), false);
            second = encrypt("anlage".getBytes(StandardCharsets.UTF_8), false);
            var tags = new JsonObject();
            tags.addProperty("metadata", parent.encryptedMetadata.split("\\.")[4]);
            tags.addProperty("data", parent.encryptedData.split("\\.")[4]);
            var fragments = new JsonObject();
            fragments.addProperty(FIRST, first.split("\\.")[4]);
            fragments.addProperty(SECOND, second.split("\\.")[4]);
            tags.add("attachments", fragments);
            events = eventPage(tags);
        }

        public String get(String url, Map<String, String> headers) {
            if (url.endsWith("/attachments/" + FIRST)) {
                downloads.incrementAndGet();
                return first;
            }
            if (url.endsWith("/attachments/" + SECOND)) {
                downloads.incrementAndGet();
                return second;
            }
            if (url.contains("/events?")) return events;
            String result = parent.get(url, headers);
            if (url.endsWith("/submissions/" + SUB)) {
                var body = JsonParser.parseString(result).getAsJsonObject();
                var ids = new JsonArray();
                ids.add(FIRST);
                ids.add(SECOND);
                body.add("attachments", ids);
                return body.toString();
            }
            return result;
        }
    }

    private static final class Fixture implements ResourceExchange {
        private static final String ATT = "44444444-4444-4444-8444-444444444444";
        private static final String SCHEMA = "https://example.invalid/fachdaten.schema.json";
        private static final String SERVICE = "urn:de:fim:leika:leistung:99008001014002";
        final ApiVersion api;
        final byte[] data, metadata;
        final String encryptedData, encryptedMetadata, encryptedAttachment, events;

        Fixture(ApiVersion api, boolean compressed, boolean wrongHash) throws Exception {
            this(api, compressed, wrongHash, s -> s);
        }

        Fixture(
                ApiVersion api,
                boolean compressed,
                boolean wrongHash,
                java.util.function.UnaryOperator<String> rewrite)
                throws Exception {
            this(
                    api,
                    compressed,
                    wrongHash,
                    rewrite,
                    compressed ? "Erika".repeat(220001) : "Erika");
        }

        Fixture(
                ApiVersion api,
                boolean compressed,
                boolean wrongHash,
                java.util.function.UnaryOperator<String> rewrite,
                String givenName)
                throws Exception {
            this.api = api;
            data =
                    (givenName.startsWith("<") ? givenName : "{\"vorname\":\"" + givenName + "\"}")
                            .getBytes(StandardCharsets.UTF_8);
            metadata =
                    rewrite.apply(
                                    "{\n  \"$schema\":\"https://schema.fitko.de/fit-connect/metadata/2.0.0/metadata.schema.json\",\n"
                                            + "\"contentStructure\":{\"data\":{\"hash\":{\"type\":\"sha512\",\"content\":\""
                                            + (wrongHash ? "0".repeat(128) : hash(data))
                                            + "\"},\"submissionSchema\":{\"schemaUri\":\""
                                            + SCHEMA
                                            + "\",\"mimeType\":\"application/json\"}},\"attachments\":[{\"attachmentId\":\""
                                            + ATT
                                            + "\",\"hash\":{\"type\":\"sha512\",\"content\":\""
                                            + hash("Testanlage".getBytes(StandardCharsets.UTF_8))
                                            + "\"},\"purpose\":\"form\",\"filename\":\"Anlage.txt\",\"description\":\"Synthetische Beschreibung\",\"mimeType\":\"text/plain\"}]}}")
                            .getBytes(StandardCharsets.UTF_8);
            encryptedData =
                    encrypt(
                            data,
                            compressed,
                            givenName.startsWith("<") ? "application/xml" : "application/json");
            encryptedMetadata = encrypt(metadata, compressed);
            encryptedAttachment =
                    encrypt(
                            "Testanlage".getBytes(StandardCharsets.UTF_8),
                            compressed,
                            "text/plain");
            var tags = new JsonObject();
            tags.addProperty("data", encryptedData.split("\\.")[4]);
            tags.addProperty("metadata", encryptedMetadata.split("\\.")[4]);
            var attachments = new JsonObject();
            attachments.addProperty(ATT, encryptedAttachment.split("\\.")[4]);
            tags.add("attachments", attachments);
            events = eventPage(tags);
        }

        Map<String, String> schemas() {
            return Map.of(
                    SCHEMA,
                    "{\"type\":\"object\",\"required\":[\"vorname\"],\"properties\":{\"vorname\":{\"type\":\"string\"}},\"additionalProperties\":false}");
        }

        public String get(String url, Map<String, String> headers) {
            String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
            if (url.equals(base + "/submissions/" + SUB)) {
                var result = new JsonObject();
                result.addProperty("destinationId", DEST);
                result.addProperty("submissionId", SUB);
                result.addProperty("caseId", CASE);
                var ids = new JsonArray();
                ids.add(ATT);
                result.add("attachments", ids);
                result.addProperty("encryptedData", encryptedData);
                result.addProperty("encryptedMetadata", encryptedMetadata);
                var service = new JsonObject();
                service.addProperty("identifier", SERVICE);
                service.addProperty("name", "Synthetischer Antrag");
                result.add("publicService", service);
                result.addProperty("region", "DE000000000000");
                return result.toString();
            }
            if (url.contains("/events?")) return events;
            if (url.equals(base + "/submissions/" + SUB + "/attachments/" + ATT))
                return encryptedAttachment;
            if (url.equals(
                    "https://test.fit-connect.fitko.dev/submission-api/.well-known/jwks.json")) {
                assertTrue(
                        headers.keySet().stream()
                                .noneMatch(n -> n.equalsIgnoreCase("Authorization")));
                var key = JsonParser.parseString(registration).getAsJsonObject();
                key.addProperty("kid", "synthetic-server");
                key.addProperty("alg", "PS512");
                key.addProperty("use", "sig");
                var ops = new JsonArray();
                ops.add("verify");
                key.add("key_ops", ops);
                var set = new JsonObject();
                var keys = new JsonArray();
                keys.add(key);
                set.add("keys", keys);
                return set.toString();
            }
            if (url.equals(base + "/destinations/" + DEST))
                return "{\"destinationId\":\""
                        + DEST
                        + "\",\"type\":\"A\",\"status\":\"active\",\"encryptionKid\":\"synthetic-decrypt\",\"metadataVersions\":[\"2.0.0\",\"3.0.0\"],\"publicServices\":[{\"identifier\":\""
                        + SERVICE
                        + "\",\"regions\":[\"DE000000000000\"],\"submissionSchemas\":[{\"schemaUri\":\""
                        + SCHEMA
                        + "\",\"mimeType\":\"application/json\"}]}]}";
            throw new AssertionError("Unexpected receiver resource: " + url);
        }
    }

    private static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(bytes));
    }

    private static String eventPage(JsonObject tags) throws Exception {
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

    private static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String encrypt(byte[] plain, boolean compressed) throws Exception {
        return encrypt(plain, compressed, "application/json");
    }

    private static String encrypt(byte[] plain, boolean compressed, String contentType)
            throws Exception {
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

    private static String event(String event, JsonObject tags, int secondsAgo) throws Exception {
        return event(event, tags, secondsAgo, "submission:" + SUB, CASE);
    }

    private static String event(
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
