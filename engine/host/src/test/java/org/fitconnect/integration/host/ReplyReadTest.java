package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReplyReadTest {
    private static final String REPLY = "11111111-1111-4111-8111-111111111111", CASE = "22222222-2222-4222-8222-222222222222";
    private static final String BASE = "https://test.fit-connect.fitko.dev/submission-api/";
    private static final TokenExchange TOKEN = (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}";
    private static AdapterRegistry adapters() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    private static String page(int offset) {
        return "{\"offset\":" + offset + ",\"count\":1,\"totalCount\":" + (offset + 1) + ",\"replies\":[{\"replyId\":\"" + REPLY
                + "\",\"caseId\":\"" + CASE + "\",\"encryptedMetadata\":\"synthetic-private-payload\"}]}";
    }
    @Test void bothRealSdkReadersUseExactVersionPagingAndReuseTheSessionToken() throws Exception {
        try (var registry = adapters()) {
            for (var api : ApiVersion.values()) {
                var reads = new AtomicInteger(); var tokens = new AtomicInteger();
                ResourceExchange remote = (url, headers) -> {
                    reads.incrementAndGet();
                    assertEquals(BASE + api.wireValue() + "/replies?" + (api == ApiVersion.V2 ? "limit=20&offset=20" : "offset=20&limit=20"), url);
                    assertTrue(headers.entrySet().stream().anyMatch(e -> e.getKey().equalsIgnoreCase("authorization") && e.getValue().equals("Bearer synthetic-token")));
                    return page(20);
                };
                try (var session = registry.openSession(api, "id", "secret", (u,b) -> { tokens.incrementAndGet(); return TOKEN.post(u,b); }, remote)) {
                    for (int i = 0; i < 2; i++) {
                        var result = registry.withSession(api, session, s -> s.replies(20, 20));
                        assertEquals(20, result.offset()); assertEquals(21, result.totalCount());
                        assertEquals(UUID.fromString(REPLY), result.replies().getFirst().replyId());
                        assertEquals(UUID.fromString(CASE), result.replies().getFirst().caseId());
                        assertFalse(new Gson().toJson(result).contains("synthetic-private"));
                    }
                    assertEquals(1, tokens.get()); assertEquals(2, reads.get());
                    session.close();
                    assertThrows(SessionException.class, () -> registry.withSession(api, session, s -> s.replies(20, 20)));
                    assertEquals(2, reads.get());
                }
            }
        }
    }
    @Test void malformedPagesAndDuplicateOrIncompleteIdentitiesCannotLookLikeSuccessfulPickup() throws Exception {
        try (var registry = adapters()) {
            for (var api : ApiVersion.values()) for (String body : List.of(
                    page(0).replace("\"count\":1", "\"count\":2"), page(0).replace("\"offset\":0", "\"offset\":20"),
                    page(0).replace("\"totalCount\":1", "\"totalCount\":0"), page(0).replace("\"caseId\":\"" + CASE + "\"", "\"caseId\":null"),
                    page(0).replace("\"totalCount\":1", "\"totalCount\":21"),
                    "{\"offset\":0,\"count\":1,\"totalCount\":1,\"replies\":[null]}",
                    "{\"offset\":0,\"count\":0,\"totalCount\":1,\"replies\":[]}")) {
                try (var session = registry.openSession(api, "id", "secret", TOKEN, (u,h) -> body)) {
                    assertThrows(SessionException.class, () -> registry.withSession(api, session, s -> s.replies(0, 20)), body);
                }
            }
        }
        var item = new ReplyPage.Entry(UUID.fromString(REPLY), UUID.fromString(CASE));
        assertThrows(SessionException.class, () -> new ReplyPage(0, 2, List.of(item, item)));
        assertThrows(SessionException.class, () -> new ReplyPage(0, 1000001, List.of(item)));
        assertEquals(0, new ReplyPage(0, 0, List.of()).replies().size());
    }
    @Test void replyPickupTransportCannotExpandToReplyContentsMutationsOtherVersionsOrArbitraryTargets() {
        for (var api : ApiVersion.values()) {
            String base = BASE + api.wireValue() + "/replies";
            assertEquals(base + "?offset=0&limit=20", TestResourceTransport.allowed(api, base + "?offset=0&limit=20").toString());
            assertEquals(1024 * 1024, TestResourceTransport.maximumBytes(java.net.URI.create(base)));
            try (var transport = new TestResourceTransport()) {
                for (String url : List.of(base, base + "/" + REPLY, base + "/" + REPLY + "/accept", base + "/" + REPLY + "/attachments/" + CASE,
                        base + "?offset=0&limit=20&destinationId=" + CASE, base + "?offset=0&limit=20&offset=1",
                        base + "?offset=0&limit=0", base + "?offset=0&limit=101", base + "?offset=10001&limit=20",
                        base + "?offset=%30&limit=20", base + "?offset=0&limit=20#fragment",
                        base.replace(api.wireValue(), api == ApiVersion.V2 ? "v3" : "v2") + "?offset=0&limit=20",
                        base.replace("test.fit-connect.fitko.dev", "example.invalid") + "?offset=0&limit=20")) {
                    assertThrows(SessionException.class, () -> transport.forVersion(api).get(url, Map.of()));
                }
            }
        }
    }
    @Test void nativeProtocolBindsReplyPagesToActiveSessionAndRejectsUnexpectedFieldsBeforeReading() throws Exception {
        try (var registry = adapters()) {
            for (var api : ApiVersion.values()) {
                var reads = new AtomicInteger();
                try (var sessions = new SessionManager(registry, TOKEN, ignored -> (u,h) -> { reads.incrementAndGet(); return page(0); });
                     var engine = new Engine(registry, sessions)) {
                    var owner = sessions.open(api, SessionRole.ONLINE_SERVICE, "id", "secret").sessionId();
                    var request = new JsonObject(); request.addProperty("protocolVersion", 1); request.addProperty("id", "reply-test");
                    request.addProperty("apiVersion", api.wireValue()); request.addProperty("command", "list_replies");
                    request.addProperty("sessionId", owner); request.addProperty("offset", 0);
                    var response = JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject(); assertTrue(response.get("ok").getAsBoolean(), response.toString());
                    var result = response.getAsJsonObject("result"); assertEquals(owner, result.get("sessionId").getAsString());
                    assertEquals("TEST", result.get("environment").getAsString()); assertEquals(api.wireValue(), result.get("apiVersion").getAsString());
                    assertFalse(result.toString().contains("synthetic-token")); assertFalse(result.toString().contains("synthetic-private"));
                    request.addProperty("destinationId", CASE); assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean());
                    request.remove("destinationId"); request.addProperty("offset", 1); assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean());
                    request.addProperty("offset", 0); sessions.close(api, owner);
                    assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean()); assertEquals(1, reads.get());
                }
            }
        }
    }
}
