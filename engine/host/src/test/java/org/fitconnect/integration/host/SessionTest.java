package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import java.nio.file.Path;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SessionTest {
    private AdapterRegistry adapters() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    @Test void bothRealSdkAdaptersEncodeCredentialsCacheTokensAndClose() throws Exception {
        try (var registry = adapters()) {
            for (ApiVersion version : ApiVersion.values()) {
                var calls = new AtomicInteger();
                TokenExchange exchange = (url, body) -> {
                    assertEquals(TestTokenTransport.ENDPOINT, url);
                    var params = new java.util.HashMap<String, String>();
                    for (String pair : body.split("&")) {
                        String[] parts = pair.split("=", 2);
                        assertEquals(2, parts.length, "OAuth form fields must have an encoded name/value pair");
                        String name = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
                        assertNull(params.put(name, URLDecoder.decode(parts[1], StandardCharsets.UTF_8)),
                                "OAuth form fields must not be duplicated");
                    }
                    assertEquals("client_credentials", params.get("grant_type"));
                    assertEquals("synthetic-client+&", params.get("client_id"));
                    assertEquals("synthetic-secret &=+ä", params.get("client_secret"));
                    assertEquals(3, params.size());
                    calls.incrementAndGet();
                    return "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}";
                };
                var session = registry.openSession(version, "synthetic-client+&", "synthetic-secret &=+ä", exchange);
                registry.checkSession(version, session);
                registry.checkSession(version, session);
                assertEquals(1, calls.get(), "SDK reuses its token inside the native session");
                session.close();
                assertThrows(SessionException.class, () -> registry.checkSession(version, session));
            }
        }
    }

    @Test void sessionsAreRoleAndApiBoundAndReplacingOneClosesItsPredecessor() throws Exception {
        try (var registry = adapters(); var sessions = new SessionManager(registry, (u, b) ->
                "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}")) {
            var first = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "client", "secret");
            var other = sessions.open(ApiVersion.V3, SessionRole.ADMINISTRATIVE_SYSTEM, "client", "secret");
            var replacement = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "client", "new-secret");
            assertNotEquals(first.sessionId(), replacement.sessionId());
            assertThrows(SessionException.class, () -> sessions.check(ApiVersion.V2, first.sessionId()));
            assertThrows(SessionException.class, () -> sessions.check(ApiVersion.V3, replacement.sessionId()));
            assertTrue(sessions.check(ApiVersion.V3, other.sessionId()).connected());
            assertFalse(sessions.close(ApiVersion.V2, replacement.sessionId()).connected());
            assertThrows(SessionException.class, () -> sessions.check(ApiVersion.V2, replacement.sessionId()));
        }
    }

    @Test void failedReplacementLeavesNoOldSessionAndErrorsNeverEchoSecrets() throws Exception {
        var calls = new AtomicInteger();
        try (var registry = adapters(); var sessions = new SessionManager(registry, (u, b) -> {
            if (calls.incrementAndGet() > 1) throw new IllegalStateException("synthetic-secret");
            return "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}";
        })) {
            var first = sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "client", "secret");
            assertThrows(SessionException.class, () -> sessions.open(ApiVersion.V2, SessionRole.ONLINE_SERVICE, "client", "synthetic-secret"));
            assertThrows(SessionException.class, () -> sessions.check(ApiVersion.V2, first.sessionId()));
        }
    }

    @Test void engineReturnsOnlyOpaqueSessionIdentityAndNeverCredentialsOrToken() {
        try (var registry = adapters(); var sessions = new SessionManager(registry, (u, b) ->
                "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}")) {
            var engine = new Engine(registry, sessions);
            String result = engine.handle("{\"protocolVersion\":1,\"id\":\"open-1\",\"command\":\"open_session\",\"apiVersion\":\"v3\",\"role\":\"online-service\",\"clientId\":\"synthetic-client\",\"clientSecret\":\"synthetic-secret\"}");
            var response = JsonParser.parseString(result).getAsJsonObject();
            assertTrue(response.get("ok").getAsBoolean());
            assertEquals("online-service", response.getAsJsonObject("result").get("role").getAsString());
            for (String marker : new String[]{"synthetic-client", "synthetic-secret", "synthetic-token"})
                assertFalse(result.contains(marker));
            assertTrue(engine.handle("{\"protocolVersion\":1,\"id\":\"bad-1\",\"command\":\"open_session\",\"apiVersion\":\"v3\",\"role\":\"online-service\",\"clientId\":\"client\",\"clientSecret\":\"secret\",\"environment\":\"PROD\"}").contains("invalid_request"));
        }
    }

    @Test void transportRejectsNonTestTargetsBeforeAnyConnection() {
        try (var transport = new TestTokenTransport()) {
        for (String endpoint : new String[]{"https://auth-prod.fit-connect.fitko.net/token",
                "http://auth-testing.fit-connect.fitko.dev/token", TestTokenTransport.ENDPOINT + "?redirect=1"}) {
            var error = assertThrows(SessionException.class, () -> transport.post(endpoint, "unused"));
            assertEquals("endpoint_blocked", error.code());
        }
        assertEquals("invalid_credentials", assertThrows(SessionException.class,
                () -> transport.post(TestTokenTransport.ENDPOINT, "a".repeat(65537))).code());
        }
    }
}
