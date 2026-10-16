package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Proxy;
import java.net.URI;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReplyAccessTest {
    private static final UUID DEST = UUID.fromString("11111111-1111-4111-8111-111111111111"),
            SUB = UUID.fromString("22222222-2222-4222-8222-222222222222"),
            CASE = UUID.fromString("33333333-3333-4333-8333-333333333333"),
            ONLINE = UUID.fromString("44444444-4444-4444-8444-444444444444"),
            REPLY = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final Map<String, String> HEADERS =
            Map.of("Authorization", "Bearer synthetic-only");
    private static final URI SCHEMA = URI.create("urn:test:reply");

    private ReplyInput input() {
        return new ReplyInput(
                DEST,
                SUB,
                CASE,
                SCHEMA,
                "application/json",
                new byte[] {'{', '}'},
                List.of(),
                null);
    }

    private ReplyRecipient recipient() {
        return new ReplyRecipient(
                DEST,
                SUB,
                CASE,
                ONLINE,
                "native-test-public-key",
                List.of(new ReplyRecipient.Schema(SCHEMA, "application/json")));
    }

    private AuthenticatedSession sdk(ApiVersion api, String variant) {
        return (AuthenticatedSession)
                Proxy.newProxyInstance(
                        getClass().getClassLoader(),
                        new Class[] {AuthenticatedSession.class},
                        (proxy, method, args) -> {
                            if (method.getName().equals("replyRecipient")) return recipient();
                            assertEquals("sendReply", method.getName());
                            var transport = (ResourceExchange) args[2];
                            String base =
                                    "https://test.fit-connect.fitko.dev/submission-api/"
                                            + api.wireValue();
                            transport.request("GET", base + "/cases/" + CASE, HEADERS, null);
                            if (variant.equals("foreign-write"))
                                transport.request("POST", base + "/submissions", HEADERS, "{}");
                            if (variant.equals("foreign-read"))
                                transport.request("GET", base + "/cases/" + ONLINE, HEADERS, null);
                            if (variant.equals("prod"))
                                transport.request(
                                        "GET",
                                        "https://fit-connect.fitko.dev/submission-api/"
                                                + api.wireValue()
                                                + "/cases/"
                                                + CASE,
                                        HEADERS,
                                        null);
                            String announce =
                                    "{\"caseId\":\""
                                            + (variant.equals("wrong-case") ? ONLINE : CASE)
                                            + "\",\"fromDestinationId\":\""
                                            + DEST
                                            + "\",\"announcedAttachments\":[]}";
                            transport.request("POST", base + "/replies", HEADERS, announce);
                            if (variant.equals("duplicate-post"))
                                transport.request("POST", base + "/replies", HEADERS, announce);
                            transport.request(
                                    "PUT",
                                    base + "/replies/" + REPLY,
                                    HEADERS,
                                    "synthetic encrypted body");
                            return new ReplyResult(REPLY, CASE, api == ApiVersion.V3 ? DEST : null);
                        });
    }

    private ResourceExchange remote(AtomicInteger writes, String variant, AtomicLong time) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                throw new AssertionError("request required");
            }

            public Response request(
                    String method, String url, Map<String, String> headers, String body) {
                if (method.equals("GET")) {
                    if (url.contains("/destination-api/"))
                        return new Response(200, "{\"destinationId\":\"" + DEST + "\"}");
                    return new Response(
                            200,
                            "{\"caseId\":\""
                                    + CASE
                                    + "\",\"destinationId\":\""
                                    + (variant.equals("foreign-case-response") ? ONLINE : DEST)
                                    + "\",\"fromDestinationId\":\""
                                    + (variant.equals("foreign-sender-response") ? SUB : ONLINE)
                                    + "\"}");
                }
                writes.incrementAndGet();
                if (variant.equals("lost-ack")) throw new SessionException("resource_unavailable");
                if (variant.equals("late-ack")) time.set(150_000);
                return new Response(
                        method.equals("POST") ? 201 : 200,
                        "{\"replyId\":\""
                                + (variant.equals("wrong-final-id") && method.equals("PUT")
                                        ? SUB
                                        : REPLY)
                                + "\",\"caseId\":\""
                                + CASE
                                + "\",\"fromDestinationId\":\""
                                + DEST
                                + "\"}");
            }
        };
    }

    @Test
    void confirmationIsOneShotCaseBoundAndNeverWritesDuringPreparation() {
        for (var api : ApiVersion.values()) {
            var writes = new AtomicInteger();
            var time = new AtomicLong();
            var access = new ReplyAccess(api, remote(writes, "ok", time), time::get);
            assertThrows(
                    SessionException.class, () -> access.get("https://example.invalid", HEADERS));
            var attempt = access.prepare(input(), recipient());
            assertEquals(0, writes.get());
            assertEquals(2, access.pendingBytes());
            assertThrows(
                    SessionException.class,
                    () ->
                            access.execute(
                                    UUID.randomUUID().toString(),
                                    sdk(api, "ok"),
                                    Path.of("."),
                                    () -> {}));
            var result =
                    access.execute(attempt.attemptId(), sdk(api, "ok"), Path.of("."), () -> {});
            assertEquals("sent", result.status());
            assertEquals(REPLY.toString(), result.replyId());
            assertEquals(2, writes.get());
            assertEquals(0, access.pendingBytes());
            assertThrows(
                    SessionException.class,
                    () ->
                            access.execute(
                                    attempt.attemptId(), sdk(api, "ok"), Path.of("."), () -> {}));
            assertEquals(2, writes.get());
        }
    }

    @Test
    void foreignCasesRoutesAndProofsCannotReachAWrite() {
        for (var api : ApiVersion.values())
            for (String variant :
                    List.of(
                            "foreign-write",
                            "foreign-read",
                            "prod",
                            "wrong-case",
                            "foreign-case-response",
                            "proof")) {
                var writes = new AtomicInteger();
                var time = new AtomicLong();
                var access = new ReplyAccess(api, remote(writes, variant, time), time::get);
                var attempt = access.prepare(input(), recipient());
                var result =
                        access.execute(
                                attempt.attemptId(),
                                sdk(api, variant),
                                Path.of("."),
                                () -> {
                                    if (variant.equals("proof"))
                                        throw new SessionException("verification_failed");
                                });
                assertEquals("failed", result.status(), api + ":" + variant);
                assertEquals(0, writes.get());
            }
        var writes = new AtomicInteger();
        var time = new AtomicLong();
        var access =
                new ReplyAccess(
                        ApiVersion.V3, remote(writes, "foreign-sender-response", time), time::get);
        var attempt = access.prepare(input(), recipient());
        assertEquals(
                "failed",
                access.execute(
                                attempt.attemptId(),
                                sdk(ApiVersion.V3, "ok"),
                                Path.of("."),
                                () -> {})
                        .status());
        assertEquals(0, writes.get());
    }

    @Test
    void lostLateOrContradictoryWriteAcknowledgmentsRemainLocked() {
        for (var api : ApiVersion.values())
            for (String variant :
                    List.of("lost-ack", "late-ack", "wrong-final-id", "duplicate-post")) {
                var writes = new AtomicInteger();
                var time = new AtomicLong();
                var access = new ReplyAccess(api, remote(writes, variant, time), time::get);
                var attempt = access.prepare(input(), recipient());
                var result =
                        access.execute(
                                attempt.attemptId(), sdk(api, variant), Path.of("."), () -> {});
                assertEquals("uncertain", result.status(), api + ":" + variant);
                assertTrue(writes.get() > 0);
                access.invalidatePrepared();
                assertThrows(SessionException.class, () -> access.prepare(input(), recipient()));
                assertThrows(SessionException.class, () -> access.cancel(attempt.attemptId()));
                assertThrows(
                        SessionException.class,
                        () ->
                                access.execute(
                                        attempt.attemptId(),
                                        sdk(api, "ok"),
                                        Path.of("."),
                                        () -> {}));
            }
    }

    @Test
    void expiredCancelledAndInvalidatedConfirmationsReleasePlaintextWithoutWriting() {
        for (String variant : List.of("expired", "cancelled", "invalidated")) {
            var writes = new AtomicInteger();
            var time = new AtomicLong();
            var access = new ReplyAccess(ApiVersion.V2, remote(writes, "ok", time), time::get);
            var attempt = access.prepare(input(), recipient());
            if (variant.equals("expired")) {
                time.set(60_000);
                assertEquals(
                        "confirmation_expired",
                        access.execute(
                                        attempt.attemptId(),
                                        sdk(ApiVersion.V2, "ok"),
                                        Path.of("."),
                                        () -> {})
                                .error());
            } else {
                if (variant.equals("cancelled")) access.cancel(attempt.attemptId());
                else access.invalidatePrepared();
                assertThrows(
                        SessionException.class,
                        () ->
                                access.execute(
                                        attempt.attemptId(),
                                        sdk(ApiVersion.V2, "ok"),
                                        Path.of("."),
                                        () -> {}));
            }
            assertEquals(0, access.pendingBytes());
            assertEquals(0, writes.get());
        }
    }

    @Test
    void nativeReplyHttpProfileRejectsProdOtherApisUnrelatedWritesAndEncodedPaths() {
        for (var api : ApiVersion.values()) {
            String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
            for (var call :
                    List.of(
                            Map.entry("GET", base + "/cases/" + CASE),
                            Map.entry("GET", base + "/destinations/" + DEST),
                            Map.entry("POST", base + "/replies"),
                            Map.entry("PUT", base + "/replies/" + REPLY),
                            Map.entry("PUT", base + "/replies/" + REPLY + "/attachments/" + SUB)))
                assertEquals(
                        call.getValue(),
                        SendHttpTransport.allowedReply(api, call.getKey(), call.getValue())
                                .toString());
            for (var call :
                    List.of(
                            Map.entry("POST", base + "/submissions"),
                            Map.entry("GET", base + "/replies"),
                            Map.entry("POST", base + "/cases/" + CASE + "/events"),
                            Map.entry("DELETE", base + "/replies/" + REPLY),
                            Map.entry("POST", base + "/replies?other=1"),
                            Map.entry("POST", base + "/%72eplies"),
                            Map.entry(
                                    "POST",
                                    base.replace("test.fit-connect", "fit-connect") + "/replies"),
                            Map.entry(
                                    "POST",
                                    base.replace(
                                                    "/" + api.wireValue(),
                                                    api == ApiVersion.V2 ? "/v3" : "/v2")
                                            + "/replies")))
                assertThrows(
                        SessionException.class,
                        () -> SendHttpTransport.allowedReply(api, call.getKey(), call.getValue()));
        }
    }
}
