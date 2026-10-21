package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderContentTest extends SenderTestSupport {
    @Test
    void v2ReportsWrongDataFormatWithoutAnnouncingOrDisclosingParserMessages() throws Exception {
        try (var adapters = registry()) {
            for (String mime : List.of("application/xml", "application/json")) {
                var remote = new SenderCapture("v2");
                remote.metadata = "2.0.0";
                remote.dataMimeType = mime;
                var original = input(null, null);
                byte[] data =
                        (mime.equals("application/xml") ? "{\"vorname\":\"Erika\"}" : "{not-json")
                                .getBytes(StandardCharsets.UTF_8);
                var request =
                        new SubmissionInput(
                                null,
                                TARGET,
                                SERVICE,
                                original.serviceName(),
                                original.region(),
                                SCHEMA,
                                mime,
                                data,
                                List.of(),
                                null,
                                null);
                var gate = new SendAccess(ApiVersion.V2, remote);
                var prepared = gate.prepare(request);
                try (var session =
                        adapters.openSession(
                                ApiVersion.V2,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                gate)) {
                    var result =
                            adapters.withSession(
                                    ApiVersion.V2,
                                    session,
                                    s -> gate.execute(prepared.attemptId(), s, workspace));
                    assertEquals("failed", result.status());
                    assertEquals("data_format_invalid", result.error());
                    assertEquals("data_format_invalid", result.diagnostics().getLast().code());
                    assertEquals(0, remote.posts);
                    assertEquals(0, remote.uploadAttempts);
                    assertFalse(new Gson().toJson(result).contains("Erika"));
                }
            }
        }
    }

    @Test
    void stagedFilesTravelThroughStrictProtocolConfirmationAndBothRealSdkAdapters()
            throws Exception {
        for (ApiVersion api : ApiVersion.values())
            for (boolean offerReply : new boolean[] {false, true}) {
                var capture = new SenderCapture(api.wireValue());
                capture.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                capture.allowReplies = offerReply;
                try (var adapters = registry();
                        var store = new ContentStore(workspace);
                        var sessions =
                                new SessionManager(
                                        adapters,
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        ignored -> capture,
                                        store);
                        var engine = new Engine(adapters, sessions)) {
                    var session = sessions.open(api, SessionRole.ONLINE_SERVICE, "id", "secret");
                    String data = staged(store, session.sessionId(), DATA);
                    String attachment =
                            staged(
                                    store,
                                    session.sessionId(),
                                    "Testanlage".getBytes(StandardCharsets.UTF_8));
                    var draft = new JsonObject();
                    draft.addProperty("destinationId", TARGET.toString());
                    if (api == ApiVersion.V3)
                        draft.addProperty("fromDestinationId", SOURCE.toString());
                    else draft.add("fromDestinationId", JsonNull.INSTANCE);
                    draft.addProperty("serviceIdentifier", SERVICE);
                    draft.addProperty("serviceName", "Synthetischer Antrag");
                    draft.addProperty("region", "DE000000000000");
                    draft.addProperty("schemaUri", SCHEMA.toString());
                    draft.addProperty("mimeType", "application/json");
                    draft.addProperty("contentId", data);
                    draft.add("caseId", JsonNull.INSTANCE);
                    draft.add("processMessage", JsonNull.INSTANCE);
                    if (offerReply) {
                        var offer = new JsonObject();
                        offer.addProperty("schemaUri", REPLY_SCHEMA.toString());
                        offer.addProperty("mimeType", "application/xml");
                        draft.add("replyOffer", offer);
                    }
                    var item = new JsonObject();
                    item.addProperty("contentId", attachment);
                    item.addProperty("fileName", "Anlage.txt");
                    item.addProperty("mimeType", "text/plain");
                    item.addProperty("description", "Synthetische Beschreibung");
                    var attachments = new JsonArray();
                    attachments.add(item);
                    draft.add("attachments", attachments);
                    var command = new JsonObject();
                    command.addProperty("protocolVersion", 1);
                    command.addProperty("id", "send-test");
                    command.addProperty("apiVersion", api.wireValue());
                    command.addProperty("sessionId", session.sessionId());
                    command.addProperty("command", "prepare_send");
                    command.addProperty("sendDocument", draft.toString());
                    if (offerReply) {
                        for (String invalid :
                                List.of(
                                        "{\"schemaUri\":\"/relative\",\"mimeType\":\"application/xml\"}",
                                        "{\"schemaUri\":\"urn:test:reply\",\"mimeType\":\"text/html\"}",
                                        "{\"schemaUri\":\"urn:test:reply\",\"mimeType\":\"application/json\",\"privateKey\":{}}")) {
                            var malformed = draft.deepCopy();
                            malformed.add("replyOffer", JsonParser.parseString(invalid));
                            command.addProperty("sendDocument", malformed.toString());
                            var denied =
                                    JsonParser.parseString(engine.handle(command.toString()))
                                            .getAsJsonObject();
                            assertFalse(denied.get("ok").getAsBoolean(), denied.toString());
                            assertEquals("invalid_submission", denied.get("error").getAsString());
                            assertEquals(0, capture.posts);
                        }
                        command.addProperty("sendDocument", draft.toString());
                    }
                    var prepared =
                            JsonParser.parseString(engine.handle(command.toString()))
                                    .getAsJsonObject();
                    assertTrue(prepared.get("ok").getAsBoolean(), prepared.toString());
                    var payload = prepared.getAsJsonObject("result").getAsJsonObject("data");
                    assertEquals(
                            DATA.length,
                            payload.getAsJsonObject("summary").get("dataBytes").getAsInt());
                    if (offerReply) {
                        var expectedOffer = draft.getAsJsonObject("replyOffer").deepCopy();
                        expectedOffer.add("processMessages", new JsonArray());
                        assertEquals(
                                expectedOffer,
                                payload.getAsJsonObject("summary").get("replyOffer"));
                    } else
                        assertTrue(
                                payload.getAsJsonObject("summary").get("replyOffer").isJsonNull());
                    assertFalse(payload.toString().contains("givenName"));
                    assertFalse(payload.toString().contains("sdk-"));
                    assertEquals(0, capture.posts, "Preparation cannot write to FIT-Connect");
                    // Confirmation binds immutable bytes, even if the staging handle is discarded
                    // meanwhile.
                    store.discard(session.sessionId(), data);
                    command.remove("sendDocument");
                    command.addProperty("command", "execute_send");
                    command.addProperty(
                            "attemptId",
                            payload.getAsJsonObject("attempt").get("attemptId").getAsString());
                    var outcome =
                            JsonParser.parseString(engine.handle(command.toString()))
                                    .getAsJsonObject();
                    assertEquals(
                            "sent",
                            outcome.getAsJsonObject("result")
                                    .getAsJsonObject("data")
                                    .get("status")
                                    .getAsString(),
                            outcome.toString());
                    assertArrayEquals(
                            DATA, decrypt(capture.submitted.get("encryptedData").getAsString()));
                    assertFalse(
                            JsonParser.parseString(engine.handle(command.toString()))
                                    .getAsJsonObject()
                                    .get("ok")
                                    .getAsBoolean());
                    assertEquals(1, capture.posts);
                    command.remove("attemptId");
                    command.addProperty("command", "list_reply_channels");
                    var channelsResult =
                            JsonParser.parseString(engine.handle(command.toString()))
                                    .getAsJsonObject();
                    assertTrue(channelsResult.get("ok").getAsBoolean(), channelsResult.toString());
                    var channels =
                            channelsResult
                                    .getAsJsonObject("result")
                                    .getAsJsonObject("data")
                                    .getAsJsonArray("channels");
                    assertEquals(offerReply ? 1 : 0, channels.size());
                    if (offerReply) {
                        var channel = channels.get(0).getAsJsonObject();
                        assertEquals("bound", channel.get("status").getAsString());
                        assertEquals(
                                outcome.getAsJsonObject("result")
                                        .getAsJsonObject("data")
                                        .get("caseId"),
                                channel.get("caseId"));
                        assertEquals(
                                "reply-key:"
                                        + payload.getAsJsonObject("attempt")
                                                .get("attemptId")
                                                .getAsString(),
                                channel.get("keyId").getAsString());
                        assertEquals(
                                Set.of(
                                        "attemptId",
                                        "destinationId",
                                        "fromDestinationId",
                                        "caseId",
                                        "submissionId",
                                        "keyId",
                                        "status"),
                                channel.keySet());
                        checkReplyReceiveProtocol(
                                engine, sessions, store, session, api, capture, channel);
                    }
                    try (var files = Files.list(store.workspace(session.sessionId()))) {
                        assertEquals(0, files.count());
                    }
                }
                try (var roots = Files.list(workspace)) {
                    assertEquals(0, roots.count());
                }
            }
    }

    @Test
    void preparedSnapshotsShareOneGlobalBudgetEvenAfterTheirStagingFilesAreDiscarded()
            throws Exception {
        try (var adapters = registry();
                var store = new ContentStore(workspace);
                var sessions =
                        new SessionManager(
                                adapters,
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                ignored ->
                                        (u, h) -> {
                                            throw new AssertionError("Preparation is local");
                                        },
                                store)) {
            var a = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "id", "secret");
            var b = sessions.open(ApiVersion.V3, SessionRole.ONLINE_SERVICE, "id", "secret");
            var c = sessions.open(ApiVersion.V2, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret");
            byte[] bytes = new byte[32 * 1024 * 1024];
            Arrays.fill(bytes, (byte) 'a');
            var approvals = new ArrayList<SessionManager.Prepared>();
            for (var active : List.of(a, b)) {
                ApiVersion api = ApiVersion.parse(active.apiVersion());
                String handle = staged(store, active.sessionId(), bytes);
                approvals.add(
                        (SessionManager.Prepared)
                                sessions.prepareSend(
                                                api, active.sessionId(), draftDocument(api, handle))
                                        .data());
                store.discard(active.sessionId(), handle);
            }
            String small = staged(store, c.sessionId(), "{}".getBytes(StandardCharsets.UTF_8));
            assertEquals(
                    "content_limit",
                    assertThrows(
                                    SessionException.class,
                                    () ->
                                            sessions.prepareSend(
                                                    ApiVersion.V2,
                                                    c.sessionId(),
                                                    draftDocument(ApiVersion.V2, small)))
                            .code());
            assertEquals(
                    approvals.getFirst().attempt().attemptId(),
                    ((SendAccess.State)
                                    sessions.send(ApiVersion.V2, a.sessionId(), "send_state", null)
                                            .data())
                            .attemptId());
            sessions.send(
                    ApiVersion.V2,
                    a.sessionId(),
                    "cancel_send",
                    approvals.getFirst().attempt().attemptId());
            assertEquals(
                    "prepared",
                    ((SessionManager.Prepared)
                                    sessions.prepareSend(
                                                    ApiVersion.V2,
                                                    c.sessionId(),
                                                    draftDocument(ApiVersion.V2, small))
                                            .data())
                            .attempt()
                            .status());
        }
        try (var roots = Files.list(workspace)) {
            assertEquals(0, roots.count());
        }
    }

    @Test
    void bothSdkAdaptersHandleXmlAndRejectDoctypeBeforeAnnouncing() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                for (boolean doctype : List.of(false, true)) {
                    var capture = new SenderCapture(api.wireValue());
                    capture.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                    capture.dataMimeType = "application/xml";
                    byte[] bytes =
                            ((doctype
                                                    ? "<!DOCTYPE antrag SYSTEM 'file:///synthetic-does-not-exist'>"
                                                    : "")
                                            + "<antrag><vorname>Erika</vorname></antrag>")
                                    .getBytes(StandardCharsets.UTF_8);
                    var request =
                            new SubmissionInput(
                                    api == ApiVersion.V3 ? SOURCE : null,
                                    TARGET,
                                    SERVICE,
                                    "Test",
                                    null,
                                    SCHEMA,
                                    "application/xml",
                                    bytes,
                                    List.of(),
                                    null,
                                    null);
                    var access = new SendAccess(api, capture);
                    try (var session =
                            adapters.openSession(
                                    api,
                                    "id",
                                    "secret",
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    access)) {
                        var prepared = access.prepare(request);
                        var result =
                                adapters.withSession(
                                        api,
                                        session,
                                        s -> access.execute(prepared.attemptId(), s, workspace));
                        assertEquals(
                                doctype ? "failed" : "sent",
                                result.status(),
                                api + ": " + result.error());
                        assertEquals(doctype ? 0 : 1, capture.posts);
                        if (!doctype)
                            assertArrayEquals(
                                    bytes,
                                    decrypt(capture.submitted.get("encryptedData").getAsString()));
                    }
                }
            }
        }
    }
}
