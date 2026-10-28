package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SenderOutcomeRecoveryTest extends SenderTestSupport {
    private SubmissionInput request(ApiVersion api) {
        var original = input(null, null);
        return new SubmissionInput(
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
    }

    @Test
    void authorizationRejectionOfTheAnnouncementIsDefiniteAndDoesNotLockTheNextAttempt()
            throws Exception {
        for (var api : ApiVersion.values())
            for (int status : List.of(401, 403))
                for (boolean thrown : List.of(false, true)) {
                    var remote = new SenderCapture(api.wireValue());
                    remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                    int[] attempts = {0};
                    ResourceExchange rejecting =
                            new ResourceExchange() {
                                public String get(String url, Map<String, String> headers) {
                                    return remote.get(url, headers);
                                }

                                public Response request(
                                        String method,
                                        String url,
                                        Map<String, String> headers,
                                        String body) {
                                    if (method.equals("POST") && url.endsWith("/submissions")) {
                                        attempts[0]++;
                                        if (thrown)
                                            throw new SessionException(
                                                    "resource_denied", status, "access-forbidden");
                                        return new Response(status, "{}");
                                    }
                                    return remote.request(method, url, headers, body);
                                }
                            };
                    var gate = new SendAccess(api, rejecting);
                    var prepared = gate.prepare(request(api));
                    try (var adapters = registry();
                            var session =
                                    adapters.openSession(
                                            api,
                                            "id",
                                            "secret",
                                            (u, b) ->
                                                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                            gate)) {
                        var outcome = gate.execute(prepared.attemptId(), session, workspace);
                        assertEquals("failed", outcome.status());
                        assertEquals("resource_denied", outcome.error());
                        assertNull(outcome.submissionId());
                        assertEquals(status, outcome.diagnostics().getLast().httpStatus());
                        assertEquals(1, attempts[0], "A rejected write must never be retried");
                        assertNotEquals(
                                prepared.attemptId(), gate.prepare(request(api)).attemptId());
                    }
                }
    }

    @Test
    void acknowledgingUncertaintyOnlyUnlocksANewAttemptAndRetainsTheUnresolvedOutcome()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var remote = new SenderCapture(api.wireValue());
            remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
            remote.failUpload = true;
            var gate = new SendAccess(api, remote);
            var prepared = gate.prepare(request(api));
            assertThrows(
                    SessionException.class,
                    () -> gate.acknowledgeUncertainty(prepared.attemptId()));
            try (var adapters = registry();
                    var session =
                            adapters.openSession(
                                    api,
                                    "id",
                                    "secret",
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    gate)) {
                var outcome = gate.execute(prepared.attemptId(), session, workspace);
                assertEquals("uncertain", outcome.status());
                assertNotNull(outcome.submissionId());
                assertThrows(SessionException.class, () -> gate.prepare(request(api)));
                assertThrows(
                        SessionException.class,
                        () -> gate.acknowledgeUncertainty(UUID.randomUUID().toString()));
                gate.acknowledgeUncertainty(prepared.attemptId());
                assertEquals(
                        outcome,
                        gate.state(),
                        "Acknowledgement must not pretend to cancel or confirm delivery");
                assertEquals(1, remote.posts);
                assertThrows(
                        SessionException.class,
                        () -> gate.execute(prepared.attemptId(), session, workspace));
                var next = gate.prepare(request(api));
                assertNotEquals(prepared.attemptId(), next.attemptId());
                assertEquals(1, remote.posts, "Preparing a new draft must send nothing");
                gate.execute(next.attemptId(), session, workspace);
                assertThrows(
                        SessionException.class,
                        () -> gate.prepare(request(api)),
                        "Each uncertainty requires its own acknowledgement");
                gate.cleanupFailed();
                assertThrows(
                        SessionException.class,
                        () -> gate.acknowledgeUncertainty(next.attemptId()));
            }
        }
    }
}
