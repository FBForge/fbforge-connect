package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ProfileCredentialTest {
    @Test
    void checkingAReplacementSecretDoesNotReplaceTheActiveSessionEvenWhenAuthenticationFails()
            throws Exception {
        try (var adapters = DestinationManagementTest.registry()) {
            var token = "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}";
            try (var sessions =
                    new SessionManager(
                            adapters,
                            (url, body) -> {
                                if (body.contains("wrong"))
                                    throw new SessionException("authentication_failed");
                                return token;
                            },
                            version -> new DestinationManagementTest.Remote())) {
                var active =
                        sessions.open(ApiVersion.V3, SessionRole.ONLINE_SERVICE, "id", "original");
                assertEquals(
                        true,
                        sessions.validateCredentials(ApiVersion.V3, "id", "replacement")
                                .get("valid"));
                assertEquals(
                        active.sessionId(),
                        sessions.check(ApiVersion.V3, active.sessionId()).sessionId());
                assertThrows(
                        SessionException.class,
                        () -> sessions.validateCredentials(ApiVersion.V3, "id", "wrong"));
                assertEquals(
                        active.sessionId(),
                        sessions.check(ApiVersion.V3, active.sessionId()).sessionId());
            }
        }
    }
}
