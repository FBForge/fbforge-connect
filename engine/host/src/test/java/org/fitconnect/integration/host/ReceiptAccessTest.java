package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptAccessTest {
    private static final UUID DEST = UUID.randomUUID(), SUB = UUID.randomUUID(), CASE = UUID.randomUUID();
    private static final Map<String,String> HEADERS = Map.of("Authorization", "Bearer synthetic", "Content-Type", "application/jose");
    private static SignedReceipt receipt(UUID submission) { return new SignedReceipt(DEST, submission, CASE, "accept", "synthetic-sign", "e30.e30.AA"); }
    private static String endpoint(ApiVersion api) { return "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue() + "/cases/" + CASE + "/events"; }
    private static ResourceExchange remote(AtomicInteger writes) {
        return new ResourceExchange() {
            public String get(String u, Map<String,String> h) { throw new AssertionError("No GET in receipt dispatch"); }
            public Response request(String method, String url, Map<String,String> headers, String body) {
                writes.incrementAndGet(); assertEquals("POST", method); assertEquals(receipt(SUB).jwt(), body);
                return new Response(204, "");
            }
        };
    }
    @Test void onlyOneConfirmedPostToThePreparedCaseAndApiCanReachTheRemote() {
        for (var api : ApiVersion.values()) {
            var writes = new AtomicInteger(); var access = new ReceiptAccess(api, remote(writes));
            var prepared = access.prepare(receipt(SUB));
            assertFalse(new com.google.gson.Gson().toJson(prepared).contains(receipt(SUB).jwt()));
            assertThrows(SessionException.class, () -> access.request("POST", endpoint(api), HEADERS, receipt(SUB).jwt()));
            assertEquals("send_locked", assertThrows(SessionException.class, () -> access.execute(UUID.randomUUID().toString(), (value, io) -> fail("Wrong attempt cannot dispatch"))).code());
            var result = access.execute(prepared.attemptId(), (value, io) -> io.request("POST", endpoint(api), HEADERS, value.jwt()));
            assertEquals("confirmed", result.status()); assertEquals(SUB.toString(), result.submissionId()); assertEquals(CASE.toString(), result.caseId());
            assertEquals(1, writes.get());
            assertThrows(SessionException.class, () -> access.execute(prepared.attemptId(), (v, io) -> fail("No replay")));
            assertThrows(SessionException.class, () -> access.prepare(receipt(SUB)));
            access.prepare(receipt(UUID.randomUUID()));
            assertThrows(SessionException.class, () -> access.prepare(receipt(SUB)));
            assertEquals(1, writes.get());
        }
    }
    @Test void expiryCancellationAndContextInvalidationNeverDispatchAnEvent() {
        var writes = new AtomicInteger(); var clock = new AtomicLong();
        var access = new ReceiptAccess(ApiVersion.V2, remote(writes), clock::get);
        var prepared = access.prepare(receipt(SUB)); clock.set(60000);
        assertEquals("confirmation_expired", access.execute(prepared.attemptId(), (v, io) -> fail("Expired")).error());
        prepared = access.prepare(receipt(SUB)); access.cancel(prepared.attemptId());
        String cancelled = prepared.attemptId();
        assertThrows(SessionException.class, () -> access.execute(cancelled, (v, io) -> fail("Cancelled")));
        prepared = access.prepare(receipt(SUB)); access.invalidate(); String invalidated = prepared.attemptId();
        assertThrows(SessionException.class, () -> access.execute(invalidated, (v, io) -> fail("Invalidated")));
        access.close(); assertThrows(SessionException.class, () -> access.prepare(receipt(SUB))); assertEquals(0, writes.get());
    }
    @Test void lostAcknowledgementsLockTheSessionEvenIfTheSdkSwallowsAnError() {
        for (boolean swallow : List.of(false, true)) {
            var writes = new AtomicInteger();
            var access = new ReceiptAccess(ApiVersion.V3, new ResourceExchange() {
                public String get(String u, Map<String,String> h) { throw new AssertionError(); }
                public Response request(String m, String u, Map<String,String> h, String b) { writes.incrementAndGet(); throw new SessionException("resource_unavailable"); }
            });
            var prepared = access.prepare(receipt(SUB));
            var result = access.execute(prepared.attemptId(), (value, io) -> {
                try { io.request("POST", endpoint(ApiVersion.V3), HEADERS, value.jwt()); }
                catch (SessionException failure) { if (!swallow) throw failure; }
            });
            assertEquals("uncertain", result.status()); assertEquals(1, writes.get());
            access.invalidate();
            assertThrows(SessionException.class, () -> access.prepare(receipt(UUID.randomUUID())));
        }
    }
    @Test void malformedAcknowledgementsAndDeniedReadsCannotBeHiddenByTheSdk() {
        for (int variant = 0; variant < 4; variant++) {
            var writes = new AtomicInteger(); int selected = variant;
            var access = new ReceiptAccess(ApiVersion.V2, new ResourceExchange() {
                public String get(String u, Map<String,String> h) { throw new AssertionError(); }
                public Response request(String m, String u, Map<String,String> h, String b) {
                    writes.incrementAndGet();
                    return selected == 0 ? new Response(204, "unexpected") : selected == 1 ? new Response(302, "") : selected == 2 ? null : new Response(204, "");
                }
            });
            var prepared = access.prepare(receipt(SUB));
            var result = access.execute(prepared.attemptId(), (value, io) -> {
                if (selected == 3) try { io.get(endpoint(ApiVersion.V2), HEADERS); } catch (SessionException expected) { }
                io.request("POST", endpoint(ApiVersion.V2), HEADERS, value.jwt());
            });
            assertEquals(selected == 3 ? "failed" : "uncertain", result.status());
            assertEquals(selected == 3 ? 0 : 1, writes.get());
        }
        assertEquals("invalid_submission", new SessionException("invalid_submission").code());
        assertEquals("authentication_failed", new SessionException("unexpected upstream text").code());
    }
    @Test void wrongRouteBodyHeadersOrMissingDispatchFailBeforeAnyNetworkWrite() {
        for (String variant : List.of("route", "body", "headers", "missing")) {
            var writes = new AtomicInteger(); var access = new ReceiptAccess(ApiVersion.V2, remote(writes));
            var prepared = access.prepare(receipt(SUB));
            var result = access.execute(prepared.attemptId(), (value, io) -> {
                if (!variant.equals("missing")) io.request("POST", variant.equals("route") ? endpoint(ApiVersion.V3) : endpoint(ApiVersion.V2),
                        variant.equals("headers") ? Map.of("Authorization", "Bearer synthetic", "Content-Type", "application/json") : HEADERS,
                        variant.equals("body") ? "tampered" : value.jwt());
            });
            assertEquals("failed", result.status()); assertEquals(0, writes.get());
        }
    }
    @Test void parallelSdkPostAttemptsStillReachTheRemoteAtMostOnce() {
        var writes = new AtomicInteger(); var replies = new AtomicInteger(); var denied = new AtomicInteger();
        var access = new ReceiptAccess(ApiVersion.V2, remote(writes)); var prepared = access.prepare(receipt(SUB));
        var result = access.execute(prepared.attemptId(), (value, io) -> {
            try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
                var start = new java.util.concurrent.CountDownLatch(1);
                var tasks = new ArrayList<java.util.concurrent.Future<?>>();
                for (int i = 0; i < 2; i++) tasks.add(executor.submit(() -> {
                    try { start.await(); io.request("POST", endpoint(ApiVersion.V2), HEADERS, value.jwt()); }
                    catch (SessionException expected) { denied.incrementAndGet(); }
                    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new RuntimeException(failure); }
                    replies.incrementAndGet();
                }));
                start.countDown();
                for (var task : tasks) task.get(5, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception failure) { throw new RuntimeException(failure); }
        });
        assertEquals(2, replies.get()); assertEquals(1, denied.get()); assertEquals(1, writes.get());
        assertEquals("uncertain", result.status());
        assertThrows(SessionException.class, () -> access.prepare(receipt(SUB)));
    }
}
