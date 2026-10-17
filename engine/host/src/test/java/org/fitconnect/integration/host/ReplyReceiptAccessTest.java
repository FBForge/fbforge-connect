package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReplyReceiptAccessTest {
    private static final UUID CASE = UUID.randomUUID(), REPLY = UUID.randomUUID();
    private static final Map<String, String> HEADERS =
            Map.of("Authorization", "Bearer synthetic", "Content-Type", "application/json");

    private PreparedReplyReceipt prepared() {
        return new PreparedReplyReceipt(
                new ReplyReceiptRequest(CASE, REPLY, "reject", "technical-error", null, null),
                "{\"problems\":[]}",
                null);
    }

    private String endpoint(ApiVersion api) {
        return "https://test.fit-connect.fitko.dev/submission-api/"
                + api.wireValue()
                + "/replies/"
                + REPLY
                + "/reject";
    }

    private AuthenticatedSession writer(ApiVersion api, String variant) {
        return (AuthenticatedSession)
                Proxy.newProxyInstance(
                        getClass().getClassLoader(),
                        new Class[] {AuthenticatedSession.class},
                        (proxy, method, args) -> {
                            assertEquals("sendReplyReceipt", method.getName());
                            var transport = (ResourceExchange) args[1];
                            String url = endpoint(api);
                            if (variant.equals("foreign"))
                                url = url.replace(REPLY.toString(), CASE.toString());
                            if (variant.equals("api"))
                                url =
                                        url.replace(
                                                "/" + api.wireValue() + "/",
                                                api == ApiVersion.V2 ? "/v3/" : "/v2/");
                            if (variant.equals("prod"))
                                url = url.replace("test.fit-connect", "fit-connect");
                            if (variant.equals("read"))
                                transport.get(
                                        url.replace("/reject", "/events?offset=0&limit=20"),
                                        HEADERS);
                            transport.request(
                                    "PUT",
                                    url,
                                    HEADERS,
                                    variant.equals("body") ? "{}" : prepared().body());
                            if (variant.equals("twice"))
                                transport.request("PUT", url, HEADERS, prepared().body());
                            return variant.equals("unverified") ? null : UUID.randomUUID();
                        });
    }

    @Test
    void preparationCancellationExpiryAndInvalidationNeverWrite() {
        var clock = new AtomicLong();
        for (String action : List.of("cancel", "expire", "invalidate"))
            try (var gate =
                    new ReplyReceiptAccess(
                            ApiVersion.V3,
                            (u, h) -> {
                                fail("Preparing must not dispatch");
                                return null;
                            },
                            clock::get)) {
                clock.set(0);
                var attempt = gate.prepare(prepared());
                if (action.equals("cancel")) gate.cancel(attempt.attemptId());
                else if (action.equals("invalidate")) gate.invalidate();
                else {
                    clock.set(60000);
                    assertEquals("failed", gate.state().status());
                }
                assertThrows(
                        SessionException.class,
                        () ->
                                gate.execute(
                                        attempt.attemptId(),
                                        writer(ApiVersion.V3, ""),
                                        Path.of("."),
                                        () -> {}));
            }
    }

    @Test
    void writesAreBoundToExactApiReplyActionAndBodyAndHaveNoRetry() {
        for (var api : ApiVersion.values())
            for (String attack :
                    List.of(
                            "",
                            "foreign",
                            "api",
                            "prod",
                            "read",
                            "body",
                            "twice",
                            "unverified",
                            "timeout")) {
                var writes = new AtomicInteger();
                var remote =
                        new ResourceExchange() {
                            public String get(String u, Map<String, String> h) {
                                fail("No GET expected");
                                return null;
                            }

                            public Response request(
                                    String m, String u, Map<String, String> h, String b) {
                                writes.incrementAndGet();
                                assertEquals(endpoint(api), u);
                                if (attack.equals("timeout"))
                                    throw new SessionException("resource_unavailable");
                                return new Response(200, "synthetic-token");
                            }
                        };
                try (var gate = new ReplyReceiptAccess(api, remote)) {
                    var attempt = gate.prepare(prepared());
                    var outcome =
                            gate.execute(
                                    attempt.attemptId(),
                                    writer(api, attack),
                                    Path.of("."),
                                    () -> {});
                    boolean dispatched =
                            Set.of("", "twice", "unverified", "timeout").contains(attack);
                    assertEquals(dispatched ? 1 : 0, writes.get(), attack);
                    assertEquals(
                            attack.isEmpty() ? "confirmed" : dispatched ? "uncertain" : "failed",
                            outcome.status(),
                            attack);
                    assertThrows(
                            SessionException.class,
                            () ->
                                    gate.execute(
                                            attempt.attemptId(),
                                            writer(api, ""),
                                            Path.of("."),
                                            () -> {}));
                    if (dispatched)
                        assertThrows(SessionException.class, () -> gate.prepare(prepared()));
                }
            }
    }

    @Test
    void staleNativeEvidenceBlocksWriteBeforeSdkDispatchAndJsonCannotInjectTags() {
        try (var gate =
                new ReplyReceiptAccess(
                        ApiVersion.V3,
                        (u, h) -> {
                            fail("No dispatch");
                            return null;
                        })) {
            var attempt = gate.prepare(prepared());
            assertEquals(
                    "failed",
                    gate.execute(
                                    attempt.attemptId(),
                                    writer(ApiVersion.V3, ""),
                                    Path.of("."),
                                    () -> {
                                        throw new SessionException("verification_failed");
                                    })
                            .status());
        }
        String draft =
                "{\"caseId\":\""
                        + CASE
                        + "\",\"replyId\":\""
                        + REPLY
                        + "\",\"action\":\"reject\",\"reason\":\"technical-error\",\"description\":null,\"attachmentId\":null,\"proofId\":null}";
        assertEquals("reject", ReplyReceiptDraft.resolve(draft).request().action());
        assertThrows(
                SessionException.class,
                () ->
                        ReplyReceiptDraft.resolve(
                                draft.replace(
                                        "\"proofId\":null",
                                        "\"proofId\":null,\"authenticationTags\":{}")));
        assertThrows(
                SessionException.class,
                () ->
                        ReplyReceiptDraft.resolve(
                                draft.replace("reject", "accept")
                                        .replace("\"technical-error\"", "null")));
    }
}
