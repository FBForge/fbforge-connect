package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SenderSessionTokenTest extends SenderTestSupport {
    @Test
    void reconnectedSessionsFetchAndUseTheirOwnBearerForBothSdkSenders() throws Exception {
        for (var api : ApiVersion.values()) {
            var sessions = new ArrayList<AuthenticatedSession>();
            var gates = new ArrayList<SendAccess>();
            int[] tokens = {0, 0};
            try (var adapters = registry()) {
                try {
                    for (int index = 0; index < 2; index++) {
                        final int owner = index;
                        String bearer = "synthetic-session-token-" + index;
                        var remote = new SenderCapture(api.wireValue());
                        remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                        var gate =
                                new SendAccess(
                                        api,
                                        new ResourceExchange() {
                                            public String get(
                                                    String url, Map<String, String> headers) {
                                                return request("GET", url, headers, null).body();
                                            }

                                            public Response request(
                                                    String method,
                                                    String url,
                                                    Map<String, String> headers,
                                                    String body) {
                                                var normalized = new HashMap<>(headers);
                                                for (var entry : headers.entrySet())
                                                    if (entry.getKey()
                                                            .equalsIgnoreCase("Authorization")) {
                                                        assertEquals(
                                                                "Bearer " + bearer,
                                                                entry.getValue(),
                                                                "A session must not reuse another login's bearer");
                                                        normalized.put(
                                                                entry.getKey(),
                                                                "Bearer synthetic-token");
                                                    }
                                                if (!method.equals("GET"))
                                                    assertTrue(
                                                            headers.entrySet().stream()
                                                                    .anyMatch(
                                                                            e ->
                                                                                    e.getKey()
                                                                                            .equalsIgnoreCase(
                                                                                                    "Authorization")));
                                                return remote.request(
                                                        method, url, normalized, body);
                                            }
                                        });
                        sessions.add(
                                adapters.openSession(
                                        api,
                                        "same-client",
                                        "same-secret",
                                        (url, body) -> {
                                            tokens[owner]++;
                                            return "{\"access_token\":\""
                                                    + bearer
                                                    + "\",\"expires_in\":3600}";
                                        },
                                        gate));
                        gates.add(gate);
                    }
                    // Both SDK sessions coexist: neither may inherit the other's token cache.
                    for (int index = 1; index >= 0; index--) {
                        var gate = gates.get(index);
                        var original = input(null, null);
                        var request =
                                new SubmissionInput(
                                        api == ApiVersion.V3 ? SOURCE : null,
                                        TARGET,
                                        SERVICE,
                                        original.serviceName(),
                                        original.region(),
                                        SCHEMA,
                                        "application/json",
                                        DATA,
                                        original.attachments(),
                                        null,
                                        null);
                        var prepared = gate.prepare(request);
                        var directory =
                                Files.createDirectories(workspace.resolve(api + "-" + index));
                        var result =
                                adapters.withSession(
                                        api,
                                        sessions.get(index),
                                        value ->
                                                gate.execute(
                                                        prepared.attemptId(), value, directory));
                        assertEquals("sent", result.status());
                        assertTrue(
                                tokens[index] > 0,
                                "Each reconnect must fetch its own access token");
                    }
                } finally {
                    for (var session : sessions) session.close();
                }
            }
        }
    }
}
