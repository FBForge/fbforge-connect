package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class DestinationPermissionTest {
    record Grant(String response, Boolean allowed) {}

    static String token(String scope, String accessToken) {
        var response = new JsonObject();
        response.addProperty("access_token", accessToken);
        response.addProperty("expires_in", 3600);
        if (scope != null) response.addProperty("scope", scope);
        return response.toString();
    }

    static String jwt(String scope) {
        var claims = new JsonObject();
        claims.addProperty("scope", scope);
        return "synthetic."
                + Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8))
                + ".signature";
    }

    @Test
    void scopeHintDistinguishesManagementReadOnlyAndUnknownWithoutExposingTokens()
            throws Exception {
        for (var grant :
                List.of(
                        new Grant(
                                token("read-destinations manage-destinations", "synthetic"), true),
                        new Grant(token("read-destinations", "synthetic"), false),
                        new Grant(token("", "synthetic"), false),
                        new Grant(token("manage-destinations-other", "synthetic"), false),
                        new Grant(token(null, jwt("manage-destinations")), true),
                        new Grant(token(null, jwt("read-destinations")), false),
                        new Grant(token(null, "synthetic-opaque"), null),
                        new Grant(token(null, "invalid.%%%.payload"), null),
                        new Grant(token("x".repeat(8193), "synthetic"), null))) {
            try (var registry = DestinationManagementTest.registry();
                    var session =
                            registry.openSession(
                                    ApiVersion.V3,
                                    "id",
                                    "secret",
                                    (u, b) -> grant.response(),
                                    (u, h) -> {
                                        throw new AssertionError(
                                                "No resource or mutation needed for a scope hint");
                                    })) {
                session.check();
                assertEquals(grant.allowed(), session.canManageDestinations());
            }
        }
    }

    @Test
    void v2ManagementStaysReadOnly() throws Exception {
        try (var registry = DestinationManagementTest.registry();
                var session =
                        registry.openSession(
                                ApiVersion.V2,
                                "id",
                                "secret",
                                (u, b) -> token("manage-destinations", "synthetic"),
                                (u, h) -> {
                                    throw new AssertionError("Unexpected resource request");
                                })) {
            session.check();
            assertEquals(false, session.canManageDestinations());
        }
    }
}
