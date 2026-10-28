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

class ReceiverEventLogTest extends ReceiverTestSupport {
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
                    var fixture = new ReceiverFixture(api, false, false);
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
    void sessionEventLogsNeedNoPrivateKeyAndRetireResultsOnFailureReplacementAndLogout()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var fixture = new ReceiverFixture(api, false, false);
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
            var fixture = new ReceiverFixture(api, false, false);
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
}
