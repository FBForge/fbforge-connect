package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;

class ReplyReceiveAccessTest {
    private static final String REPLY = "11111111-1111-4111-8111-111111111111";
    private static final String CASE = "22222222-2222-4222-8222-222222222222";
    private static final String ATT = "33333333-3333-4333-8333-333333333333";
    private static final String RECEIVER = "44444444-4444-4444-8444-444444444444";
    private static final String SENDER = "55555555-5555-4555-8555-555555555555";
    private static final String HEADER = Base64.getUrlEncoder().withoutPadding().encodeToString(
            "{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"synthetic-reply\"}".getBytes(StandardCharsets.UTF_8));
    private static String wire(String tag) { return HEADER + ".AQID.AQID.AQID." + tag; }
    private static String envelope() {
        return "{\"replyId\":\"" + REPLY + "\",\"caseId\":\"" + CASE + "\",\"attachments\":[\"" + ATT
                + "\"],\"encryptedMetadata\":\"" + wire("bWV0YQ") + "\",\"encryptedData\":\"" + wire("ZGF0YQ") + "\"}";
    }
    private static String base(ApiVersion api) { return "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue(); }
    private static ResourceExchange remote(AtomicInteger calls) {
        return (url, headers) -> {
            calls.incrementAndGet();
            if (url.endsWith("/replies/" + REPLY)) return envelope();
            if (url.endsWith("/attachments/" + ATT)) return wire("YXR0");
            if (url.endsWith("/cases/" + CASE)) return "{\"caseId\":\"" + CASE + "\",\"destinationId\":\"" + RECEIVER + "\",\"fromDestinationId\":\"" + SENDER + "\"}";
            if (url.endsWith("/destinations/" + RECEIVER)) return "{\"destinationId\":\"" + RECEIVER + "\"}";
            if (url.endsWith("/destinations/" + SENDER)) return "{\"destinationId\":\"" + SENDER + "\"}";
            return "{}";
        };
    }
    private static void fails(String code, org.junit.jupiter.api.function.Executable operation) {
        assertEquals(code, assertThrows(SessionException.class, operation).code());
    }

    @Test void bothVersionsScopeReplyReadsAndSdkTagsToTheSelectedCase() {
        for (var api : ApiVersion.values()) {
            var calls = new AtomicInteger(); var root = base(api);
            try (var read = ReceiveAccess.forReply(api, CASE, REPLY, remote(calls))) {
                read.get(root + "/replies/" + REPLY, Map.of());
                read.get(root + "/cases/" + CASE, Map.of());
                read.get(root + "/destinations/" + RECEIVER, Map.of());
                read.get(root + "/destinations/" + SENDER, Map.of());
                read.get(root + "/replies/" + REPLY + "/events?offset=0&limit=100", Map.of());
                read.get(root + "/cases/" + CASE + "/events?replyId=" + REPLY + "&offset=0&limit=100", Map.of());
                read.get(root + "/replies/" + REPLY + "/attachments/" + ATT, Map.of());
                read.verifyAuthenticationTags(UUID.fromString(CASE), UUID.fromString(REPLY), "bWV0YQ", "ZGF0YQ", Map.of(UUID.fromString(ATT), "YXR0"));
                assertEquals(7, calls.get());
            }
        }
    }

    @Test void preEnvelopeCrossCaseCrossCollectionAndUnobservedParticipantReadsNeverReachHttp() {
        for (var api : ApiVersion.values()) {
            var root = base(api);
            for (var path : List.of("/cases/" + CASE, "/destinations/" + SENDER, "/replies/" + REPLY + "/attachments/" + ATT,
                    "/replies/" + REPLY + "/events?offset=0&limit=100")) {
                var calls = new AtomicInteger();
                try (var read = ReceiveAccess.forReply(api, CASE, REPLY, remote(calls))) {
                    fails("endpoint_blocked", () -> read.get(root + path, Map.of())); assertEquals(0, calls.get());
                }
            }
            for (var path : List.of("/submissions/" + REPLY, "/cases/" + ATT, "/destinations/" + SENDER,
                    "/replies/" + ATT, "/cases/" + CASE + "/events?replyId=" + ATT + "&offset=0&limit=100",
                    "/cases/" + CASE + "/events?submissionId=" + REPLY + "&offset=0&limit=100")) {
                var calls = new AtomicInteger();
                try (var read = ReceiveAccess.forReply(api, CASE, REPLY, remote(calls))) {
                    read.get(root + "/replies/" + REPLY, Map.of());
                    fails("endpoint_blocked", () -> read.get(root + path, Map.of())); assertEquals(1, calls.get());
                }
            }
            fails("endpoint_blocked", () -> ReceiveAccess.allowedTransport(api, root + "/replies/" + REPLY));
            for (String method : List.of("POST", "PUT", "PATCH", "DELETE")) {
                var calls = new AtomicInteger();
                try (var read = ReceiveAccess.forReply(api, CASE, REPLY, remote(calls))) {
                    fails("endpoint_blocked", () -> read.request(method, root + "/replies/" + REPLY, Map.of(), "{}"));
                    assertEquals(0, calls.get());
                }
            }
        }
    }

    @Test void changedEnvelopeCaseParticipantsOrDownloadedTagsPermanentlyRevokeTheLease() {
        for (var api : ApiVersion.values()) {
            var response = new AtomicReference<>(envelope()); var root = base(api);
            try (var read = ReceiveAccess.forReply(api, CASE, REPLY, (u, h) -> response.get())) {
                read.get(root + "/replies/" + REPLY, Map.of());
                response.set(envelope().replace(CASE, ATT));
                fails("invalid_resource", () -> read.get(root + "/replies/" + REPLY, Map.of()));
                fails("endpoint_blocked", () -> read.get(root + "/replies/" + REPLY, Map.of()));
            }
            response.set(envelope());
            try (var read = ReceiveAccess.forReply(api, CASE, REPLY, (u, h) -> response.get())) {
                read.get(root + "/replies/" + REPLY, Map.of());
                response.set("{\"caseId\":\"" + CASE + "\",\"destinationId\":\"" + RECEIVER + "\"}");
                read.get(root + "/cases/" + CASE, Map.of());
                response.set(response.get().replace(RECEIVER, SENDER));
                fails("invalid_resource", () -> read.get(root + "/cases/" + CASE, Map.of()));
            }
            for (int variant = 0; variant < 6; variant++) {
                try (var read = ReceiveAccess.forReply(api, CASE, REPLY, remote(new AtomicInteger()))) {
                    read.get(root + "/replies/" + REPLY, Map.of());
                    if (variant != 0) read.get(root + "/replies/" + REPLY + "/attachments/" + ATT, Map.of());
                    String expectedCase = variant == 1 ? ATT : CASE, expectedReply = variant == 2 ? ATT : REPLY;
                    String metadata = variant == 3 ? "wrong" : "bWV0YQ", data = variant == 4 ? "wrong" : "ZGF0YQ";
                    var tags = Map.of(UUID.fromString(ATT), variant == 5 ? "wrong" : "YXR0");
                    fails("verification_failed", () -> read.verifyAuthenticationTags(UUID.fromString(expectedCase), UUID.fromString(expectedReply), metadata, data, tags));
                    fails("endpoint_blocked", () -> read.get(root + "/replies/" + REPLY, Map.of()));
                }
            }
        }
    }

    @Test void replyLeaseEnforcesTestVersionDeadlineAndCredentialFreeTrustReads() {
        for (var api : ApiVersion.values()) {
            var root = base(api); var clock = new AtomicLong(); var calls = new AtomicInteger();
            var forwarded = new AtomicReference<Map<String,String>>();
            try (var read = ReceiveAccess.forReply(api, CASE, REPLY, (u, h) -> { calls.incrementAndGet(); forwarded.set(h); return "{}"; }, clock::get)) {
                read.get("https://test.fit-connect.fitko.dev/submission-api/.well-known/jwks.json", Map.of("Authorization", "Bearer synthetic", "Accept", "application/json"));
                assertEquals(Map.of("Accept", "application/json"), forwarded.get());
                clock.set(150000);
                fails("resource_unavailable", () -> read.get(root + "/replies/" + REPLY, Map.of())); assertEquals(1, calls.get());
            }
            for (var bad : List.of(root.replace("test.fit-connect.fitko.dev", "prod.fit-connect.fitko.dev") + "/replies/" + REPLY,
                    root.replace("https:", "http:") + "/replies/" + REPLY,
                    root.replace("/" + api.wireValue(), api == ApiVersion.V2 ? "/v3" : "/v2") + "/replies/" + REPLY))
                fails("endpoint_blocked", () -> ReceiveAccess.allowedReplyTransport(api, bad));
        }
    }
}
