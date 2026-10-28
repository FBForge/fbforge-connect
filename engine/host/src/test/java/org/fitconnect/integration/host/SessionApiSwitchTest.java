package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SessionApiSwitchTest {
    private static final String TOKEN =
            "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}";

    @Test
    void bothDirectionsReuseCredentialsWithoutReplacingTheSourceOrCrossingRoles() throws Exception {
        for (ApiVersion sourceApi : ApiVersion.values()) {
            var targetApi = sourceApi == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2;
            try (var registry = DestinationManagementTest.registry();
                    var state =
                            new SessionState(
                                    registry,
                                    (url, body) -> {
                                        assertTrue(body.contains("client_id=synthetic-client"));
                                        assertTrue(body.contains("client_secret=synthetic-secret"));
                                        return TOKEN;
                                    })) {
                var source =
                        state.open(
                                sourceApi,
                                SessionRole.ADMINISTRATIVE_SYSTEM,
                                "synthetic-client",
                                "synthetic-secret");
                var target = state.openForApi(sourceApi, source.sessionId(), targetApi);
                assertEquals(targetApi.wireValue(), target.apiVersion());
                assertEquals(source.role(), target.role());
                assertEquals(source.environment(), target.environment());
                assertNotEquals(source.sessionId(), target.sessionId());
                assertEquals(
                        source.sessionId(), state.check(sourceApi, source.sessionId()).sessionId());
                assertEquals(
                        "invalid_input",
                        assertThrows(
                                        SessionException.class,
                                        () ->
                                                state.openForApi(
                                                        sourceApi, source.sessionId(), targetApi))
                                .code());
                assertEquals(
                        target.sessionId(), state.check(targetApi, target.sessionId()).sessionId());
                state.close(sourceApi, source.sessionId());
                assertEquals(
                        "session_missing",
                        assertThrows(
                                        SessionException.class,
                                        () ->
                                                state.openForApi(
                                                        sourceApi, source.sessionId(), targetApi))
                                .code());
                assertTrue(state.check(targetApi, target.sessionId()).connected());
            }
        }
    }

    @Test
    void failedAuthenticationOrInvalidTargetPreservesTheSource() throws Exception {
        var reject = new AtomicBoolean();
        try (var registry = DestinationManagementTest.registry();
                var state =
                        new SessionState(
                                registry,
                                (url, body) -> {
                                    if (reject.get())
                                        throw new SessionException("authentication_failed");
                                    return TOKEN;
                                })) {
            var source = state.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "client", "secret");
            reject.set(true);
            assertEquals(
                    "authentication_failed",
                    assertThrows(
                                    SessionException.class,
                                    () ->
                                            state.openForApi(
                                                    ApiVersion.V2,
                                                    source.sessionId(),
                                                    ApiVersion.V3))
                            .code());
            assertEquals(
                    "invalid_input",
                    assertThrows(
                                    SessionException.class,
                                    () ->
                                            state.openForApi(
                                                    ApiVersion.V2,
                                                    source.sessionId(),
                                                    ApiVersion.V2))
                            .code());
            assertEquals(
                    source.sessionId(), state.check(ApiVersion.V2, source.sessionId()).sessionId());
        }
    }

    @Test
    void switchFrameRequiresAnActiveSourceAndReturnsNoCredentials() throws Exception {
        try (var registry = DestinationManagementTest.registry();
                var sessions = new SessionManager(registry, (url, body) -> TOKEN);
                var engine = new Engine(registry, sessions)) {
            var source =
                    sessions.open(
                            ApiVersion.V2,
                            SessionRole.ONLINE_SERVICE,
                            "synthetic-client",
                            "synthetic-secret");
            var frame = new JsonObject();
            frame.addProperty("protocolVersion", 1);
            frame.addProperty("id", "api-switch");
            frame.addProperty("command", "open_session_for_api");
            frame.addProperty("apiVersion", "v2");
            frame.addProperty("sessionId", source.sessionId());
            frame.addProperty("targetApiVersion", "v3");
            String response = engine.handle(frame.toString());
            var parsed = JsonParser.parseString(response).getAsJsonObject();
            assertTrue(parsed.get("ok").getAsBoolean());
            assertEquals("v3", parsed.getAsJsonObject("result").get("apiVersion").getAsString());
            for (String value : List.of("synthetic-client", "synthetic-secret", "synthetic-token"))
                assertFalse(response.contains(value));
            frame.addProperty("clientSecret", "synthetic-secret");
            assertTrue(engine.handle(frame.toString()).contains("invalid_request"));
            frame.remove("clientSecret");
            frame.addProperty("targetApiVersion", "v4");
            assertTrue(engine.handle(frame.toString()).contains("invalid_request"));
        }
    }
}
