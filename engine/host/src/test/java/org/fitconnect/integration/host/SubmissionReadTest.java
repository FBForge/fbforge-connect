package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SubmissionReadTest {
    private static final String DESTINATION = "11111111-1111-4111-8111-111111111111";
    private static final String SUBMISSION = "22222222-2222-4222-8222-222222222222";
    private static final String CASE = "33333333-3333-4333-8333-333333333333";
    private static final String ATTACHMENT = "44444444-4444-4444-8444-444444444444";
    private static AdapterRegistry registry() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    @Test void bothSdkReadersUseSelectedApiAndOnlyReturnPublicEnvelopeFields() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                var oauth = new AtomicInteger(); var reads = new AtomicInteger();
                var resources = (ResourceExchange) (url, headers) -> {
                    reads.incrementAndGet();
                    assertEquals("Bearer synthetic-token", headers.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase("Authorization")).map(Map.Entry::getValue).findFirst().orElse(null));
                    String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue() + "/submissions";
                    if (url.contains("?")) {
                        assertEquals(base + (api == ApiVersion.V2 ? "?destinationId=" + DESTINATION + "&limit=20&offset=20"
                                : "?offset=20&limit=20&destinationId=" + DESTINATION), url);
                        return "{\"offset\":20,\"count\":1,\"totalCount\":21,\"submissions\":[{\"destinationId\":\"" + DESTINATION + "\",\"submissionId\":\"" + SUBMISSION + "\",\"caseId\":\"" + CASE + "\"}]}";
                    }
                    assertEquals(base + "/" + SUBMISSION, url);
                    return "{\"destinationId\":\"" + DESTINATION + "\",\"submissionId\":\"" + SUBMISSION + "\",\"caseId\":\"" + CASE
                            + "\",\"attachments\":[\"" + ATTACHMENT + "\"],\"encryptedMetadata\":\"synthetic-encrypted-metadata\",\"encryptedData\":\"synthetic-encrypted-data\","
                            + "\"publicService\":{\"identifier\":\"urn:test:service\",\"name\":\"Testleistung\"},\"region\":\"DE000000000000\"}";
                };
                try (var session = adapters.openSession(api, "id", "secret", (u, b) -> {
                    oauth.incrementAndGet(); return "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}";
                }, resources)) {
                    var page = adapters.withSession(api, session, s -> s.submissions(DESTINATION, 20, 20));
                    assertEquals(20, page.offset()); assertEquals(21, page.totalCount());
                    assertEquals(UUID.fromString(SUBMISSION), page.submissions().getFirst().submissionId());
                    var detail = adapters.withSession(api, session, s -> s.submission(SUBMISSION));
                    assertEquals(UUID.fromString(DESTINATION), detail.destinationId());
                    assertEquals(UUID.fromString(CASE), detail.caseId());
                    assertEquals(List.of(UUID.fromString(ATTACHMENT)), detail.attachments());
                    assertEquals("Testleistung", detail.serviceName());
                    assertTrue(detail.metadataAvailable()); assertTrue(detail.dataAvailable());
                    assertFalse(detail.toString().contains("synthetic-encrypted"));
                    assertEquals(1, oauth.get()); assertEquals(2, reads.get());
                }
            }
        }
    }

    @Test void protocolRejectsWrongSessionApiAndDestinationWithoutLeakingCiphertext() throws Exception {
        for (ApiVersion api : ApiVersion.values()) {
            try (var adapters = registry(); var sessions = new SessionManager(adapters, (u, b) ->
                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", ignored -> (u, h) ->
                    "{\"destinationId\":\"" + DESTINATION + "\",\"submissionId\":\"" + SUBMISSION + "\",\"caseId\":\"" + CASE
                    + "\",\"attachments\":[],\"encryptedMetadata\":\"synthetic-ciphertext\",\"encryptedData\":\"synthetic-ciphertext\"}");
                 var engine = new Engine(adapters, sessions)) {
                var active = sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret");
                var request = new JsonObject(); request.addProperty("protocolVersion", 1); request.addProperty("id", "lookup-test");
                request.addProperty("command", "load_submission"); request.addProperty("apiVersion", api.wireValue());
                request.addProperty("sessionId", active.sessionId()); request.addProperty("destinationId", DESTINATION); request.addProperty("submissionId", SUBMISSION);
                String response = engine.handle(request.toString());
                assertTrue(JsonParser.parseString(response).getAsJsonObject().get("ok").getAsBoolean());
                assertFalse(response.contains("synthetic-ciphertext")); assertFalse(response.contains("synthetic-token"));
                request.addProperty("destinationId", ATTACHMENT);
                assertEquals("invalid_resource", JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("error").getAsString());
                request.addProperty("apiVersion", api == ApiVersion.V2 ? "v3" : "v2");
                assertEquals("session_missing", JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("error").getAsString());
                request.addProperty("apiVersion", api.wireValue()); request.addProperty("url", "https://example.invalid/");
                assertEquals("invalid_request", JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("error").getAsString());
            }
        }
    }

    @Test void malformedPagesAndDuplicateTransportIdsFailClosedInBothAdapters() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
                for (boolean duplicate : List.of(false, true)) {
                    ResourceExchange resource = (u, h) -> duplicate
                            ? "{\"destinationId\":\"" + DESTINATION + "\",\"submissionId\":\"" + SUBMISSION + "\",\"caseId\":\"" + CASE
                            + "\",\"attachments\":[\"" + ATTACHMENT + "\",\"" + ATTACHMENT + "\"]}"
                            : "{\"offset\":0,\"count\":1,\"totalCount\":1,\"submissions\":[]}";
                    try (var session = adapters.openSession(api, "id", "secret", (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", resource)) {
                        assertThrows(SessionException.class, () -> adapters.withSession(api, session,
                                s -> duplicate ? s.submission(SUBMISSION) : s.submissions(DESTINATION, 0, 20)));
                    }
                }
            }
        }
    }

    @Test void lookupRoutesAreVersionBoundAndRequireExactBoundedPagination() {
        for (ApiVersion api : ApiVersion.values()) {
            String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue() + "/submissions";
            assertEquals(base + "/" + SUBMISSION, TestResourceTransport.allowed(api, base + "/" + SUBMISSION).toString());
            assertEquals(46 * 1024 * 1024, TestResourceTransport.maximumBytes(TestResourceTransport.allowed(api, base + "/" + SUBMISSION)));
            String list = base + "?destinationId=" + DESTINATION + "&offset=0&limit=20";
            assertEquals(list, TestResourceTransport.allowed(api, list).toString());
            for (String bad : List.of(base, list + "&offset=0", list + "&scope=all", list.replace("limit=20", "limit=101"),
                    list.replace("offset=0", "offset=10001"), list.replace("test.fit-connect.fitko.dev", "prod.fit-connect.fitko.net"), base + "/" + SUBMISSION + "?include=secret"))
                assertThrows(SessionException.class, () -> TestResourceTransport.allowed(api, bad));
        }
    }
}
