package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;

class EventLogAccessTest {
    private static final String CASE = "11111111-1111-4111-8111-111111111111", SUB = "22222222-2222-4222-8222-222222222222";
    private static final String ROOT = "https://test.fit-connect.fitko.dev/submission-api";
    private static final Map<String,String> HEADERS = Map.of("Authorization", "Bearer synthetic", "Accept", "application/json");
    private static String events(ApiVersion api, String type, String id) { return ROOT + "/" + api.wireValue() + "/" + type + "/" + id + "/events?offset=0&limit=100"; }

    @Test void replyLogScopeCannotReadSubmissionsOrAnotherReplyAndRetainsApiAndCaseBoundaries() {
        for (var api : ApiVersion.values()) {
            String root = ROOT + "/" + api.wireValue();
            for (String endpoint : List.of(root + "/submissions/" + SUB + "/events?offset=0&limit=20",
                    root + "/replies/" + CASE + "/events?offset=0&limit=20",
                    root + "/cases/" + CASE + "/events?offset=0&limit=20&replyId=" + CASE))
                try (var source = new EventLogAccess(api, CASE, SUB, (u,h) -> { fail("Foreign log must not dispatch"); return null; }, true)) {
                    assertEquals("endpoint_blocked", assertThrows(SessionException.class, () -> source.get(endpoint, HEADERS)).code());
                }
            try (var source = new EventLogAccess(api, CASE, SUB, (u,h) -> "{\"offset\":0,\"count\":0,\"totalCount\":0,\"eventLog\":[]}", true)) {
                source.get(root + "/replies/" + SUB + "/events?offset=0&limit=20", HEADERS);
                assertTrue(source.completeEventTokens().isEmpty());
            }
        }
    }
    @Test void readsOnlyTheBoundCaseAndSubmissionWithoutLoadingSubmissionContent() {
        for (var api : ApiVersion.values()) {
            var calls = new AtomicInteger();
            String page = "{\"count\":0,\"offset\":0,\"totalCount\":0,\"eventLog\":[]}";
            for (String type : List.of("cases", "submissions")) try (var access = new EventLogAccess(api, CASE, SUB,
                    (url, headers) -> { calls.incrementAndGet(); assertEquals(HEADERS, headers); return page; })) {
                assertEquals(page, access.get(events(api, type, type.equals("cases") ? CASE : SUB), HEADERS));
                assertTrue(access.completeEventTokens().isEmpty());
                assertThrows(SessionException.class, () -> access.get(ROOT + "/" + api.wireValue() + "/submissions/" + SUB, HEADERS));
                assertThrows(SessionException.class, () -> access.get(events(api, "cases", CASE), HEADERS));
            }
            assertEquals(2, calls.get());
        }
    }
    @Test void caseFilterCannotSelectAForeignSubmissionEvenWhenTheCaseMatches() {
        for (var api : ApiVersion.values()) try (var access = new EventLogAccess(api, CASE, SUB,
                (u,h) -> { fail("Foreign filter must not dispatch"); return "{}"; })) {
            assertEquals("endpoint_blocked", assertThrows(SessionException.class,
                    () -> access.get(events(api,"cases",CASE) + "&submissionId=" + CASE,HEADERS)).code());
        }
    }
    @Test void trustReadsStripCredentialsAndRejectWrongKidWhileMutationsNeverDispatch() {
        var calls = new AtomicInteger();
        try (var access = new EventLogAccess(ApiVersion.V3, CASE, SUB, (url, headers) -> {
            calls.incrementAndGet(); assertEquals(Map.of("Accept", "application/json"), headers); return "{\"kid\":\"wrong\"}";
        })) {
            assertThrows(SessionException.class, () -> access.get(ROOT + "/v3/destinations/" + CASE + "/keys/synthetic", HEADERS));
            assertEquals(1, calls.get());
        }
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { fail("No mutation"); return "{}"; })) {
            assertThrows(SessionException.class, () -> access.request("POST", events(ApiVersion.V2, "cases", CASE), HEADERS, "{}"));
            assertThrows(SessionException.class, () -> access.get(events(ApiVersion.V2, "cases", CASE), HEADERS));
        }
    }
    @Test void foreignTargetsDuplicateHeadersAndTimeoutFailBeforeNetworking() {
        for (String url : List.of(events(ApiVersion.V2, "cases", SUB), events(ApiVersion.V3, "cases", CASE),
                events(ApiVersion.V2, "cases", CASE).replace("https:", "http:"),
                events(ApiVersion.V2, "cases", CASE).replace("test.fit-connect.fitko.dev", "prod.fit-connect.fitko.net"))) {
            try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { fail("Wrong route"); return "{}"; })) {
                assertThrows(SessionException.class, () -> access.get(url, HEADERS));
            }
        }
        var clock = new AtomicLong();
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { fail("Expired"); return "{}"; }, clock::get)) {
            clock.set(150000); assertThrows(SessionException.class, () -> access.get(events(ApiVersion.V2, "cases", CASE), HEADERS));
        }
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { fail("Duplicate auth"); return "{}"; })) {
            assertThrows(SessionException.class, () -> access.get(events(ApiVersion.V2, "cases", CASE), Map.of("Authorization", "Bearer one", "authorization", "Bearer two")));
        }
    }
    @Test void responseByteRequestAndLateResponseLimitsCloseTheReadCapability() {
        String endpoint = ROOT + "/.well-known/jwks.json";
        var calls = new AtomicInteger();
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { calls.incrementAndGet(); return "{\"keys\":[]}"; })) {
            for (int i = 0; i < 256; i++) access.get(endpoint, HEADERS);
            assertEquals("content_limit", assertThrows(SessionException.class, () -> access.get(endpoint, HEADERS)).code());
            assertEquals(256, calls.get());
        }
        String large = "{\"padding\":\"" + "x".repeat(900000) + "\"}";
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> large)) {
            for (int i = 0; i < 18; i++) access.get(endpoint, HEADERS);
            assertEquals("content_limit", assertThrows(SessionException.class, () -> access.get(endpoint, HEADERS)).code());
            assertThrows(SessionException.class, () -> access.get(endpoint, HEADERS));
        }
        var clock = new AtomicLong();
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> { clock.set(150000); return "{}"; }, clock::get)) {
            assertEquals("resource_unavailable", assertThrows(SessionException.class, () -> access.get(endpoint, HEADERS)).code());
        }
    }
    @Test void concreteEventFactoryCannotReadContentOrBroadenTheDirectoryProfile() {
        try (var transport = new TestResourceTransport()) {
            for (var api : ApiVersion.values()) {
                assertThrows(SessionException.class, () -> transport.forVersion(api).get(events(api, "cases", CASE), HEADERS));
                try (var events = transport.forEvents(api, CASE, SUB)) {
                    assertThrows(SessionException.class, () -> events.get(ROOT + "/" + api.wireValue() + "/submissions/" + SUB, HEADERS));
                }
            }
        }
        try (var access = new EventLogAccess(ApiVersion.V3, CASE, SUB, (url, headers) -> {
            assertFalse(headers.keySet().stream().anyMatch(key -> key.equalsIgnoreCase("authorization"))); return "{\"keys\":[]}";
        })) { assertEquals("{\"keys\":[]}", access.get(ROOT + "/.well-known/jwks.json", HEADERS)); }
    }
    @Test void completeTokensRequireOneConsistentSequenceAndRejectDuplicateJsonClaims() {
        String first = "{\"offset\":0,\"count\":1,\"totalCount\":2,\"eventLog\":[\"e30.e30.AA\"]}";
        for (String second : List.of("{\"offset\":1,\"count\":1,\"totalCount\":3,\"eventLog\":[\"e30.e30.AA\"]}",
                "{\"offset\":0,\"count\":1,\"totalCount\":2,\"eventLog\":[\"e30.e30.AA\"]}")) {
            var calls = new AtomicInteger();
            try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> calls.getAndIncrement() == 0 ? first : second)) {
                access.get(events(ApiVersion.V2, "submissions", SUB).replace("limit=100", "limit=1"), HEADERS);
                assertThrows(SessionException.class, access::completeEventTokens);
                assertThrows(SessionException.class, () -> access.get(events(ApiVersion.V2, "submissions", SUB).replace("offset=0", "offset=1").replace("limit=100", "limit=1"), HEADERS));
            }
        }
        String duplicate = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"sub\":\"one\",\"sub\":\"two\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try (var access = new EventLogAccess(ApiVersion.V2, CASE, SUB, (u,h) -> first.replace("totalCount\":2", "totalCount\":1").replace("e30.e30.AA", "e30." + duplicate + ".AA"))) {
            assertThrows(SessionException.class, () -> access.get(events(ApiVersion.V2, "submissions", SUB), HEADERS));
        }
    }
}
