package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ResourceBoundaryTest {
    private static final String DESTINATION = "05960a88-1b5e-4e2d-8a60-6df57699140d";
    private static final String BASE = "https://test.fit-connect.fitko.dev";
    private static final TokenExchange TOKEN =
            (url, body) ->
                    "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}";
    private static final Gson JSON = new Gson();

    private AdapterRegistry adapters() {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    private static SessionSnapshot open(SessionManager sessions, ApiVersion version) {
        return sessions.open(
                version, SessionRole.ONLINE_SERVICE, "synthetic-client", "synthetic-secret");
    }

    private static String detail() {
        return "{\"destinationId\":\"" + DESTINATION + "\",\"status\":\"active\"}";
    }

    private static String key(String kid, String modulus) {
        return "{\"kty\":\"RSA\",\"kid\":\""
                + kid
                + "\",\"alg\":\"RSA-OAEP-256\",\"key_ops\":[\"wrapKey\"],\"n\":\""
                + modulus
                + "\",\"e\":\"AQAB\"}";
    }

    private static String keyPage(int offset, int count, int total, String... keys) {
        return "{\"offset\":"
                + offset
                + ",\"count\":"
                + count
                + ",\"totalCount\":"
                + total
                + ",\"keys\":["
                + String.join(",", keys)
                + "]}";
    }

    private static String listPage(int offset, int count, int total) {
        return "{\"offset\":"
                + offset
                + ",\"count\":"
                + count
                + ",\"totalCount\":"
                + total
                + ",\"destinations\":[{\"destinationId\":\""
                + DESTINATION
                + "\",\"name\":\"Synthetic\",\"status\":\"active\","
                + "\"callback\":{\"url\":\"https://example.invalid/\",\"secret\":\"synthetic-callback-secret\"},\"destinationSignature\":\"synthetic-signature\"}]}";
    }

    private static SessionException error(
            String expected, org.junit.jupiter.api.function.Executable operation) {
        SessionException error = assertThrows(SessionException.class, operation);
        assertEquals(expected, error.code());
        return error;
    }

    @Test
    void transportAllowsOnlyExactTestVersionResourcesAndRejectsAmbiguousTargetsBeforeNetworking() {
        try (var transport = new TestResourceTransport()) {
            for (ApiVersion version : ApiVersion.values()) {
                String path = "/destination-api/" + version.wireValue() + "/destinations";
                assertEquals(
                        BASE + path + "?offset=20&limit=20",
                        TestResourceTransport.allowed(version, BASE + path + "?offset=20&limit=20")
                                .toString());
                assertNotNull(
                        TestResourceTransport.allowed(
                                version,
                                BASE + path + "/" + DESTINATION + "/keys?limit=50&offset=0"));
                assertNotNull(
                        TestResourceTransport.allowed(
                                version,
                                BASE
                                        + "/submission-api/"
                                        + version.wireValue()
                                        + "/destinations/"
                                        + DESTINATION));
                String other = version == ApiVersion.V2 ? "v3" : "v2";
                List<String> rejected =
                        List.of(
                                "https://prod.fit-connect.fitko.net" + path,
                                "http://test.fit-connect.fitko.dev" + path,
                                "https://test.fit-connect.fitko.dev:443" + path,
                                "https://user@test.fit-connect.fitko.dev" + path,
                                "https://test.fit-connect.fitko.dev.example.invalid" + path,
                                BASE + path + "#fragment",
                                BASE + path + "/",
                                BASE + path + "/../destinations",
                                BASE + path.replace("destinations", "%64estinations"),
                                BASE + "/destination-api/" + other + "/destinations",
                                BASE + path + "?offset=0&limit=20&offset=1",
                                BASE + path + "?offset=0&limit=20&url=https://example.invalid",
                                BASE + path + "?offset=0",
                                BASE + path + "?offset=-1&limit=20",
                                BASE + path + "?offset=0&limit=101",
                                BASE + path + "?offset=10001&limit=20",
                                BASE + path + "?offset=0&limit=0",
                                BASE + path + "?offset=%30&limit=20",
                                BASE + path + "?offset=0&limit=20&",
                                BASE + path + "?",
                                BASE + path + "/" + DESTINATION + "?offset=0&limit=20",
                                BASE
                                        + "/submission-api/"
                                        + version.wireValue()
                                        + "/destinations/"
                                        + DESTINATION
                                        + "?offset=0&limit=20");
                for (String endpoint : rejected) {
                    error(
                            "endpoint_blocked",
                            () -> TestResourceTransport.allowed(version, endpoint));
                    error(
                            "endpoint_blocked",
                            () -> transport.forVersion(version).get(endpoint, Map.of()));
                }
            }
        }
    }

    @Test
    void strictJsonRejectsNestedDuplicatesTrailingDocumentsDepthNodeAndUtf8SizeExcess() {
        assertEquals(
                "ok",
                StrictJson.object("{\"nested\":{\"value\":\"ok\"}}", 100)
                        .getAsJsonObject("nested")
                        .get("value")
                        .getAsString());
        for (String malformed :
                List.of(
                        "{\"key\":1,\"key\":2}",
                        "{\"keys\":[{\"d\":\"one\",\"d\":\"two\"}]}",
                        "{} {}",
                        "[]",
                        "{\"a\":NaN}",
                        "{\"a\":1,}",
                        "{\"a\":" + "[".repeat(40) + "0" + "]".repeat(40) + "}",
                        "{\"a\":[" + "0,".repeat(10001) + "0]}"))
            error("invalid_resource", () -> StrictJson.object(malformed, 100000));
        error("invalid_resource", () -> StrictJson.object("{\"a\":\"ä\"}", 9));
    }

    @Test
    void bothApisExposeSelectedDirectoryFieldsAndRequireLoadedEligibleRegistrationsForImport() {
        try (var registry = adapters();
                var sessions =
                        new SessionManager(
                                registry,
                                TOKEN,
                                version ->
                                        (url, headers) -> {
                                            if (url.contains("/keys?"))
                                                return keyPage(0, 1, 1, key("uncertified", "AQAB"));
                                            if (url.contains("/submission-api/")) return detail();
                                            return listPage(0, 1, 1);
                                        })) {
            for (ApiVersion version : ApiVersion.values()) {
                var session = open(sessions, version);
                var page =
                        sessions.resource(
                                version,
                                session.sessionId(),
                                "list_destinations",
                                null,
                                0,
                                null,
                                null);
                assertEquals(version.wireValue(), page.apiVersion());
                assertEquals("TEST", page.environment());
                String encoded = JSON.toJson(page);
                assertFalse(encoded.contains("callback"));
                assertFalse(encoded.contains("synthetic-signature"));
                assertFalse(encoded.contains("synthetic-token"));
                assertFalse(encoded.contains("synthetic-secret"));
                assertEquals(
                        DESTINATION,
                        ((DestinationAccess.Page) page.data())
                                .destinations()
                                .getFirst()
                                .destinationId());
                error(
                        "key_missing",
                        () ->
                                sessions.resource(
                                        version,
                                        session.sessionId(),
                                        "import_key",
                                        DESTINATION,
                                        0,
                                        "decrypt",
                                        "{}"));
                var context =
                        (DestinationAccess.Context)
                                sessions.resource(
                                                version,
                                                session.sessionId(),
                                                "load_destination",
                                                DESTINATION,
                                                0,
                                                null,
                                                null)
                                        .data();
                assertEquals(1, context.keys().size());
                assertFalse(context.keys().getFirst().eligible());
                assertEquals("test_certificate_required", context.keys().getFirst().reason());
                error(
                        "test_certificate_required",
                        () ->
                                sessions.resource(
                                        version,
                                        session.sessionId(),
                                        "import_key",
                                        DESTINATION,
                                        0,
                                        "decrypt",
                                        "{}"));
            }
        }
    }

    @Test
    void incompleteDuplicateOrFailedRefreshNeverLeavesUsableRegistrationSnapshot() {
        for (ApiVersion version : ApiVersion.values()) {
            var mode = new AtomicInteger();
            var keyReads = new AtomicInteger();
            try (var registry = adapters();
                    var sessions =
                            new SessionManager(
                                    registry,
                                    TOKEN,
                                    ignored ->
                                            (url, headers) -> {
                                                if (!url.contains("/keys?")) return detail();
                                                keyReads.incrementAndGet();
                                                return switch (mode.get()) {
                                                    case 0 ->
                                                            keyPage(
                                                                    0,
                                                                    1,
                                                                    1,
                                                                    key("uncertified", "AQAB"));
                                                    case 1 ->
                                                            throw new SessionException(
                                                                    "resource_unavailable");
                                                    case 2 ->
                                                            keyPage(
                                                                    0,
                                                                    2,
                                                                    2,
                                                                    key("duplicate", "AQAB"),
                                                                    key("duplicate", "AQAC"));
                                                    case 3 ->
                                                            keyPage(
                                                                    0,
                                                                    2,
                                                                    2,
                                                                    key("wrong-count", "AQAB"));
                                                    case 4 ->
                                                            keyPage(
                                                                    1,
                                                                    1,
                                                                    2,
                                                                    key("wrong-offset", "AQAB"));
                                                    case 5 ->
                                                            keyPage(
                                                                    0,
                                                                    1,
                                                                    0,
                                                                    key("wrong-total", "AQAB"));
                                                    case 6 ->
                                                            url.contains("offset=0")
                                                                    ? keyPage(
                                                                            0,
                                                                            1,
                                                                            2,
                                                                            key("first", "AQAB"))
                                                                    : keyPage(1, 0, 2);
                                                    default ->
                                                            url.contains("offset=0")
                                                                    ? keyPage(
                                                                            0,
                                                                            1,
                                                                            3,
                                                                            key("first", "AQAB"))
                                                                    : keyPage(
                                                                            1,
                                                                            1,
                                                                            2,
                                                                            key("second", "AQAC"));
                                                };
                                            })) {
                var session = open(sessions, version);
                sessions.resource(
                        version,
                        session.sessionId(),
                        "load_destination",
                        DESTINATION,
                        0,
                        null,
                        null);
                for (int failure = 1; failure <= 7; failure++) {
                    mode.set(failure);
                    error(
                            failure == 1 ? "resource_unavailable" : "invalid_resource",
                            () ->
                                    sessions.resource(
                                            version,
                                            session.sessionId(),
                                            "load_destination",
                                            DESTINATION,
                                            0,
                                            null,
                                            null));
                    error(
                            "key_missing",
                            () ->
                                    sessions.resource(
                                            version,
                                            session.sessionId(),
                                            "import_key",
                                            DESTINATION,
                                            0,
                                            "decrypt",
                                            "{}"));
                }
                assertTrue(
                        keyReads.get() >= 8,
                        "The incomplete page requires a follow-up read before rejection");
            }
        }
    }

    @Test
    void invalidDirectoryPageMetadataIsRejectedForBothSdkReaders() {
        for (ApiVersion version : ApiVersion.values()) {
            for (String malformed :
                    List.of(listPage(0, 2, 2), listPage(1, 1, 2), listPage(0, 1, 0))) {
                try (var registry = adapters();
                        var sessions =
                                new SessionManager(
                                        registry, TOKEN, ignored -> (url, headers) -> malformed)) {
                    var session = open(sessions, version);
                    error(
                            "invalid_resource",
                            () ->
                                    sessions.resource(
                                            version,
                                            session.sessionId(),
                                            "list_destinations",
                                            null,
                                            0,
                                            null,
                                            null));
                }
            }
        }
    }

    @Test
    void engineBindsResourcesToApiAndCurrentSessionAndNeverSerializesTransportSecrets() {
        var requests = new AtomicInteger();
        try (var registry = adapters();
                var sessions =
                        new SessionManager(
                                registry,
                                TOKEN,
                                version ->
                                        (url, headers) -> {
                                            requests.incrementAndGet();
                                            if (url.contains("/keys?"))
                                                throw new IllegalStateException(
                                                        "synthetic-secret synthetic-token private-document");
                                            if (url.contains("/submission-api/")) return detail();
                                            return listPage(0, 1, 1);
                                        })) {
            var engine = new Engine(registry, sessions);
            for (ApiVersion version : ApiVersion.values()) {
                var session = open(sessions, version);
                JsonObject request = request(version, session.sessionId(), "list_destinations");
                request.addProperty("offset", 0);
                JsonObject response =
                        JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject();
                assertTrue(response.get("ok").getAsBoolean());
                int before = requests.get();
                ApiVersion other = version == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2;
                request.addProperty("apiVersion", other.wireValue());
                assertEngineError(engine, request, "session_missing");
                assertEquals(before, requests.get());
                request.addProperty("apiVersion", version.wireValue());
                request.addProperty("environment", "PROD");
                assertEngineError(engine, request, "invalid_request");
                assertEquals(before, requests.get());
                request.remove("environment");
                open(sessions, version);
                assertEngineError(engine, request, "session_missing");
                assertEquals(before, requests.get());
                var current = open(sessions, version);
                request = request(version, current.sessionId(), "load_destination");
                request.addProperty("destinationId", DESTINATION);
                assertEngineError(engine, request, "resource_unavailable");
            }
        }
    }

    private static JsonObject request(ApiVersion version, String session, String command) {
        var request = new JsonObject();
        request.addProperty("protocolVersion", 1);
        request.addProperty("id", "resource-test");
        request.addProperty("apiVersion", version.wireValue());
        request.addProperty("command", command);
        request.addProperty("sessionId", session);
        return request;
    }

    private static void assertEngineError(Engine engine, JsonObject request, String expected) {
        String result = engine.handle(request.toString());
        JsonObject response = JsonParser.parseString(result).getAsJsonObject();
        assertFalse(response.get("ok").getAsBoolean());
        assertEquals(expected, response.get("error").getAsString());
        for (String forbidden :
                List.of("synthetic-secret", "synthetic-token", "private-document", "callback"))
            assertFalse(result.contains(forbidden));
    }
}
