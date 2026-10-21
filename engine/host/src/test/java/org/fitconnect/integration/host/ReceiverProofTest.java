package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverProofTest extends ReceiverTestSupport {
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
                        var fixture = new ReceiverFixture(api, compressed, false);
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
                            assertEquals(
                                    ReceiverFixture.SCHEMA, result.schemaSnapshot().schemaUri());
                            var snapshot =
                                    JsonParser.parseString(result.schemaSnapshot().document())
                                            .getAsJsonObject();
                            assertEquals(1, snapshot.get("schemaPackage").getAsInt());
                            assertTrue(
                                    snapshot.getAsJsonObject("documents")
                                            .has(ReceiverFixture.SCHEMA));
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
                                            UUID.fromString(ReceiverFixture.ATT),
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
    void nativeProtocolRetainsProofAcrossReadsAndInvalidatesItOnFailureKeyChangeLookupAndLogout()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var activeFixture =
                    new java.util.concurrent.atomic.AtomicReference<>(
                            new ReceiverFixture(api, false, false));
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
                                .get(ReceiverFixture.SCHEMA)
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
                                                                ReceiverFixture.SCHEMA,
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
                activeFixture.set(new ReceiverFixture(api, false, true));
                assertEquals("verification_failed", failure(engine.handle(request.toString())));
                assertEquals("invalid_resource", failure(engine.handle(read)));
                assertWorkspaceEmpty(content.workspace(owner));
                activeFixture.set(new ReceiverFixture(api, false, false));
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
    void validEncryptionAndSignedEventsCannotHideAWrongContentHash() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new ReceiverFixture(api, false, true);
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
                        var fixture = new ReceiverFixture(api, false, false, rewrite);
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
                    var fixture = new ReceiverFixture(api, false, false);
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
                        var fixture = new ReceiverFixture(api, false, false);
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
}
