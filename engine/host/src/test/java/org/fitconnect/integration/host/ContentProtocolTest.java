package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ContentProtocolTest {
    @TempDir Path temporary;
    private static final TokenExchange TOKEN = (url, body) ->
            "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}";
    private AdapterRegistry adapters() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    private SessionManager sessions(AdapterRegistry adapters) {
        return new SessionManager(adapters, TOKEN, version -> (url, headers) -> {
            throw new AssertionError("Local content must not call a FIT-Connect resource");
        }, new ContentStore(temporary));
    }
    private static JsonObject request(String command, ApiVersion version, String session) {
        var request = new JsonObject(); request.addProperty("protocolVersion", 1);
        request.addProperty("id", "content-test"); request.addProperty("command", command);
        request.addProperty("apiVersion", version.wireValue()); request.addProperty("sessionId", session);
        return request;
    }
    private static JsonObject response(Engine engine, JsonObject request) {
        String response = engine.handle(request.toString());
        for (String secret : List.of("synthetic-token", "synthetic-secret", "fit-client-content-", "java.nio"))
            assertFalse(response.contains(secret));
        return JsonParser.parseString(response).getAsJsonObject();
    }
    private static void error(Engine engine, JsonObject request, String code) {
        JsonObject result = response(engine, request);
        assertFalse(result.get("ok").getAsBoolean()); assertEquals(code, result.get("error").getAsString());
    }

    @Test void bothApisUploadLocalContentAndReturnOnlyBoundPublicProgress() throws Exception {
        try (var adapters = adapters(); var sessions = sessions(adapters); var engine = new Engine(adapters, sessions)) {
            for (ApiVersion version : ApiVersion.values()) {
                var session = sessions.open(version, SessionRole.ONLINE_SERVICE, "synthetic-client", "synthetic-secret");
                JsonObject begin = request("begin_content", version, session.sessionId()); begin.addProperty("totalBytes", 3);
                var result = response(engine, begin); assertTrue(result.get("ok").getAsBoolean());
                var envelope = result.getAsJsonObject("result");
                assertEquals("TEST", envelope.get("environment").getAsString());
                assertEquals(session.sessionId(), envelope.get("sessionId").getAsString());
                assertEquals(version.wireValue(), envelope.get("apiVersion").getAsString());
                var initial = envelope.getAsJsonObject("data");
                assertEquals(Set.of("contentId", "totalBytes", "receivedBytes", "complete"), initial.keySet());
                String content = initial.get("contentId").getAsString(); UUID.fromString(content);
                JsonObject append = request("append_content", version, session.sessionId());
                append.addProperty("contentId", content); append.addProperty("byteOffset", 0); append.addProperty("chunk", "AQID");
                result = response(engine, append); assertTrue(result.get("ok").getAsBoolean());
                assertTrue(result.getAsJsonObject("result").getAsJsonObject("data").get("complete").getAsBoolean());
                error(engine, append, "invalid_input");
                var discard = request("discard_content", version, session.sessionId()); discard.addProperty("contentId", content);
                result = response(engine, discard); assertTrue(result.get("ok").getAsBoolean());
                assertEquals(Set.of("contentId"), result.getAsJsonObject("result").getAsJsonObject("data").keySet());
                error(engine, discard, "resource_missing");
            }
        }
        try (var roots = Files.list(temporary)) { assertEquals(0, roots.count()); }
    }

    @Test void wrongApiOtherSessionAndReplacedSessionCannotReachStagedContent() throws Exception {
        try (var adapters = adapters(); var sessions = sessions(adapters); var engine = new Engine(adapters, sessions)) {
            var a = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "synthetic-client", "synthetic-secret");
            var b = sessions.open(ApiVersion.V2, SessionRole.ADMINISTRATIVE_SYSTEM, "synthetic-client", "synthetic-secret");
            var begin = request("begin_content", ApiVersion.V2, a.sessionId()); begin.addProperty("totalBytes", 1);
            String content = response(engine, begin).getAsJsonObject("result").getAsJsonObject("data").get("contentId").getAsString();
            var append = request("append_content", ApiVersion.V2, a.sessionId());
            append.addProperty("contentId", content); append.addProperty("byteOffset", 0); append.addProperty("chunk", "AA==");
            append.addProperty("apiVersion", "v3"); error(engine, append, "session_missing");
            append.addProperty("apiVersion", "v2"); append.addProperty("sessionId", b.sessionId()); error(engine, append, "resource_missing");
            sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "synthetic-client", "synthetic-secret");
            append.addProperty("sessionId", a.sessionId()); error(engine, append, "session_missing");
            try (var roots = Files.list(temporary); var files = Files.list(roots.findFirst().orElseThrow())) { assertEquals(0, files.count()); }
        }
    }

    @Test void malformedCommandShapesNeverBecomeLocalFileOperations() throws Exception {
        try (var adapters = adapters(); var sessions = sessions(adapters); var engine = new Engine(adapters, sessions)) {
            var session = sessions.open(ApiVersion.V3, SessionRole.ONLINE_SERVICE, "synthetic-client", "synthetic-secret");
            for (JsonElement size : List.of(new JsonPrimitive("1"), new JsonPrimitive(1.5), JsonNull.INSTANCE, new JsonPrimitive(-1))) {
                var begin = request("begin_content", ApiVersion.V3, session.sessionId()); begin.add("totalBytes", size);
                error(engine, begin, "invalid_request");
            }
            var begin = request("begin_content", ApiVersion.V3, session.sessionId()); begin.addProperty("totalBytes", 0);
            begin.addProperty("path", "../renderer-chosen-path"); error(engine, begin, "invalid_request");
            try (var roots = Files.list(temporary)) { assertEquals(0, roots.count()); }
        }
    }
}
