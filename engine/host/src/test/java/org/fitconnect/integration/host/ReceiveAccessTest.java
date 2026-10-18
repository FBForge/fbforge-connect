package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiveAccessTest {
    private static final String DEST = "11111111-1111-4111-8111-111111111111";
    private static final String SUB = "22222222-2222-4222-8222-222222222222";
    private static final String CASE = "33333333-3333-4333-8333-333333333333";
    private static final String ATT = "44444444-4444-4444-8444-444444444444";

    private static String base(ApiVersion api) {
        return "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
    }

    private static String wire(String header) {
        return Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(header.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                + ".AQID.AQID.AQID.AQID";
    }

    private static final String JWE =
            wire("{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"synthetic\"}");

    private static String detail() {
        return "{\"destinationId\":\""
                + DEST
                + "\",\"submissionId\":\""
                + SUB
                + "\",\"caseId\":\""
                + CASE
                + "\",\"encryptedMetadata\":\""
                + JWE
                + "\",\"encryptedData\":\""
                + JWE
                + "\",\"attachments\":[\""
                + ATT
                + "\"]}";
    }

    private static SessionException blocked(org.junit.jupiter.api.function.Executable work) {
        return assertThrows(SessionException.class, work);
    }

    @Test
    void bothVersionsBindSubsequentReadsToTheEnvelopeAndNeverForwardWrites() {
        for (ApiVersion api : ApiVersion.values()) {
            AtomicInteger calls = new AtomicInteger();
            ResourceExchange remote =
                    (url, headers) -> {
                        calls.incrementAndGet();
                        return url.endsWith("/" + SUB)
                                ? detail()
                                : url.contains("/attachments/") ? JWE : "{}";
                    };
            String base = base(api);
            try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                blocked(
                        () ->
                                read.get(
                                        base + "/cases/" + CASE + "/events?offset=0&limit=100",
                                        Map.of()));
                assertEquals(0, calls.get());
            }
            try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                assertEquals(detail(), read.get(base + "/submissions/" + SUB, Map.of()));
                read.get(base + "/submissions/" + SUB + "/attachments/" + ATT, Map.of());
                read.get(base + "/submissions/" + SUB + "/events?offset=0&limit=100", Map.of());
                read.get(
                        base
                                + "/cases/"
                                + CASE
                                + "/events?submissionId="
                                + SUB
                                + "&offset=0&limit=100",
                        Map.of());
            }
            for (String bad :
                    List.of(
                            base + "/submissions/" + ATT,
                            base + "/submissions/" + SUB + "/attachments/" + DEST,
                            base + "/cases/" + DEST + "/events?offset=0&limit=100",
                            base
                                    + "/cases/"
                                    + CASE
                                    + "/events?submissionId="
                                    + ATT
                                    + "&offset=0&limit=100")) {
                try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                    read.get(base + "/submissions/" + SUB, Map.of());
                    int before = calls.get();
                    assertEquals("endpoint_blocked", blocked(() -> read.get(bad, Map.of())).code());
                    assertEquals(before, calls.get());
                }
            }
            for (String method : List.of("POST", "PUT", "PATCH", "DELETE")) {
                try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                    int before = calls.get();
                    assertEquals(
                            "endpoint_blocked",
                            blocked(
                                            () ->
                                                    read.request(
                                                            method,
                                                            base + "/submissions/" + SUB,
                                                            Map.of(),
                                                            "{}"))
                                    .code());
                    assertEquals(before, calls.get());
                }
            }
        }
    }

    @Test
    void malformedOrChangingEnvelopeCannotAuthorizeAttachmentOrCaseReads() {
        for (ApiVersion api : ApiVersion.values()) {
            for (String invalid :
                    List.of(
                            detail().replace(DEST, ATT),
                            detail().replace(SUB, ATT),
                            detail().replace(
                                            "[\"" + ATT + "\"]",
                                            "[\"" + ATT + "\",\"" + ATT + "\"]"),
                            detail().replace(
                                            "\"caseId\"", "\"caseId\":null,\"duplicateCaseId\""))) {
                try (var read = new ReceiveAccess(api, DEST, SUB, (u, h) -> invalid)) {
                    blocked(() -> read.get(base(api) + "/submissions/" + SUB, Map.of()));
                    blocked(
                            () ->
                                    read.get(
                                            base(api)
                                                    + "/submissions/"
                                                    + SUB
                                                    + "/attachments/"
                                                    + ATT,
                                            Map.of()));
                }
            }
            var response = new AtomicReference<>(detail());
            try (var read = new ReceiveAccess(api, DEST, SUB, (u, h) -> response.get())) {
                read.get(base(api) + "/submissions/" + SUB, Map.of());
                response.set(detail().replace(CASE, DEST));
                assertEquals(
                        "invalid_resource",
                        blocked(() -> read.get(base(api) + "/submissions/" + SUB, Map.of()))
                                .code());
                assertEquals(
                        "endpoint_blocked",
                        blocked(
                                        () ->
                                                read.get(
                                                        base(api)
                                                                + "/cases/"
                                                                + CASE
                                                                + "/events?offset=0&limit=100",
                                                        Map.of()))
                                .code());
            }
        }
    }

    @Test
    void exactTestOriginVersionAndBoundedQueriesAreRequired() {
        for (ApiVersion api : ApiVersion.values()) {
            String base = base(api),
                    event = base + "/submissions/" + SUB + "/events?offset=0&limit=100";
            assertNotNull(ReceiveAccess.allowedTransport(api, event));
            for (String bad :
                    List.of(
                            event.replace("https:", "http:"),
                            event.replace("test.fit-connect.fitko.dev", "other.invalid"),
                            event.replace(
                                    "/" + api.wireValue() + "/",
                                    api == ApiVersion.V2 ? "/v3/" : "/v2/"),
                            event + "&offset=0",
                            event + "&secret=not-forwarded",
                            event.replace("limit=100", "limit=101"),
                            event.replace("offset=0", "offset=10001"),
                            event + "#fragment",
                            base + "/submissions/" + SUB + "/%2e%2e"))
                assertEquals(
                        "endpoint_blocked",
                        blocked(() -> ReceiveAccess.allowedTransport(api, bad)).code());
        }
    }

    @Test
    void publicTrustLookupsStayOnTestAndNeverCarryAuthorization() {
        for (ApiVersion api : ApiVersion.values()) {
            AtomicReference<Map<String, String>> sent = new AtomicReference<>();
            try (var read =
                    new ReceiveAccess(
                            api,
                            DEST,
                            SUB,
                            (u, h) -> {
                                sent.set(h);
                                return u.endsWith("/test-key") ? "{\"kid\":\"test-key\"}" : "{}";
                            })) {
                read.get(
                        "https://test.fit-connect.fitko.dev/submission-api/.well-known/jwks.json",
                        Map.of("Authorization", "Bearer synthetic", "Accept", "application/json"));
                assertEquals(Map.of("Accept", "application/json"), sent.get());
                read.get(
                        base(api) + "/destinations/" + DEST + "/keys/test-key",
                        Map.of("authorization", "Bearer synthetic"));
                assertTrue(sent.get().isEmpty());
                blocked(
                        () ->
                                read.get(
                                        "https://auth-testing.fit-connect.fitko.dev/.well-known/jwks.json",
                                        Map.of()));
            }
        }
    }

    @Test
    void deadlineAndClosePermanentlyRevokeTheReadScope() {
        var clock = new AtomicLong(1000);
        var calls = new AtomicInteger();
        var read =
                new ReceiveAccess(
                        ApiVersion.V2,
                        DEST,
                        SUB,
                        (u, h) -> {
                            calls.incrementAndGet();
                            return detail();
                        },
                        clock::get);
        clock.set(151000);
        assertEquals(
                "resource_unavailable",
                blocked(() -> read.get(base(ApiVersion.V2) + "/submissions/" + SUB, Map.of()))
                        .code());
        assertEquals(0, calls.get());
        read.close();
        clock.set(1000);
        assertEquals(
                "endpoint_blocked",
                blocked(() -> read.get(base(ApiVersion.V2) + "/submissions/" + SUB, Map.of()))
                        .code());
    }

    @Test
    void cumulativeResponsesAndRequestCountAreBoundedAcrossTheWholeReceive() {
        AtomicInteger calls = new AtomicInteger();
        String body =
                "{\"destinationId\":\""
                        + DEST
                        + "\",\"padding\":\""
                        + "x".repeat(1024 * 1024 - 100)
                        + "\"}";
        try (var read =
                new ReceiveAccess(
                        ApiVersion.V3,
                        DEST,
                        SUB,
                        (u, h) -> {
                            calls.incrementAndGet();
                            return body;
                        })) {
            for (int i = 0; i < 128; i++)
                read.get(base(ApiVersion.V3) + "/destinations/" + DEST, Map.of());
            assertEquals(
                    "content_limit",
                    blocked(() -> read.get(base(ApiVersion.V3) + "/destinations/" + DEST, Map.of()))
                            .code());
            int before = calls.get();
            assertEquals(
                    "endpoint_blocked",
                    blocked(() -> read.get(base(ApiVersion.V3) + "/destinations/" + DEST, Map.of()))
                            .code());
            assertEquals(before, calls.get());
        }
        calls.set(0);
        try (var read =
                new ReceiveAccess(
                        ApiVersion.V2,
                        DEST,
                        SUB,
                        (u, h) -> {
                            calls.incrementAndGet();
                            return "{\"destinationId\":\"" + DEST + "\"}";
                        })) {
            for (int i = 0; i < 1024; i++)
                read.get(base(ApiVersion.V2) + "/destinations/" + DEST, Map.of());
            assertEquals(
                    "content_limit",
                    blocked(() -> read.get(base(ApiVersion.V2) + "/destinations/" + DEST, Map.of()))
                            .code());
            assertEquals(1024, calls.get());
        }
    }

    @Test
    void keyPathsRejectTraversalAndHeadersRejectCredentialSmuggling() {
        String base = base(ApiVersion.V2);
        for (String segment :
                List.of("..", "%2e%2e", "%2fetc", "%5cfile", "%252e%252e", "%0asecret"))
            assertEquals(
                    "endpoint_blocked",
                    blocked(
                                    () ->
                                            ReceiveAccess.allowedTransport(
                                                    ApiVersion.V2,
                                                    base
                                                            + "/destinations/"
                                                            + DEST
                                                            + "/keys/"
                                                            + segment))
                            .code());
        for (Map<String, String> headers :
                List.of(
                        Map.of(
                                "Authorization",
                                "Bearer synthetic",
                                "authorization",
                                "Bearer other"),
                        Map.of("Cookie", "synthetic"),
                        Map.of("Authorization", "Bearer synthetic\r\nOther: value"))) {
            try (var read =
                    new ReceiveAccess(
                            ApiVersion.V2,
                            DEST,
                            SUB,
                            (u, h) -> {
                                fail("Unsafe headers cannot reach HTTP");
                                return null;
                            })) {
                assertEquals(
                        "endpoint_blocked",
                        blocked(() -> read.get(base + "/submissions/" + SUB, headers)).code());
            }
        }
    }

    @Test
    void oversizedAmbiguousAndUnsupportedJweHeadersNeverReachSdkParsing() {
        for (String header :
                List.of(
                        "{\"alg\":\"RSA-OAEP-256\",\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"synthetic\"}",
                        "{\"alg\":\"RSA-OAEP\",\"enc\":\"A256GCM\",\"kid\":\"synthetic\"}",
                        "{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"synthetic\",\"zip\":\"other\"}",
                        "{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"synthetic\",\"padding\":\""
                                + "x".repeat(16384)
                                + "\"}")) {
            try (var read =
                    new ReceiveAccess(
                            ApiVersion.V3,
                            DEST,
                            SUB,
                            (u, h) -> detail().replace(JWE, wire(header)))) {
                assertEquals(
                        "invalid_resource",
                        blocked(
                                        () ->
                                                read.get(
                                                        base(ApiVersion.V3) + "/submissions/" + SUB,
                                                        Map.of()))
                                .code());
            }
        }
    }
}
