package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderConfirmationTest extends SenderTestSupport {
    @Test
    void sdkFailuresDoNotRetryAnUncertainWriteAndReadOnlyTransportCannotSend() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
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
                var exchange = new SenderCapture(api.wireValue());
                exchange.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                exchange.failUpload = true;
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                exchange)) {
                    assertThrows(
                            SessionException.class,
                            () ->
                                    adapters.withSession(
                                            api, session, s -> s.send(request, workspace)));
                    assertEquals(1, exchange.posts);
                    assertEquals(1, exchange.uploadAttempts);
                    assertNull(exchange.submitted);
                }
                var reads = new SenderCapture(api.wireValue());
                reads.metadata = exchange.metadata;
                ResourceExchange readOnly = reads::get;
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                readOnly)) {
                    var failure =
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            adapters.withSession(
                                                    api, session, s -> s.send(request, workspace)));
                    assertEquals("endpoint_blocked", failure.code());
                    assertEquals(0, reads.posts);
                    assertEquals(0, reads.uploadAttempts);
                }
            }
        }
    }

    @Test
    void nativeAttemptBindsTheApprovedInputAndRetainsUncertainServerIdsWithoutResending()
            throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values()) {
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
                var remote = new SenderCapture(api.wireValue());
                remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                var access = new SendAccess(api, remote);
                var approved = access.prepare(request);
                assertEquals("prepared", approved.status());
                assertThrows(
                        SessionException.class,
                        () -> access.request("POST", remote.BASE + "/submissions", Map.of(), "{}"));
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                access)) {
                    remote.failUpload = true;
                    var result =
                            adapters.withSession(
                                    api,
                                    session,
                                    s -> access.execute(approved.attemptId(), s, workspace));
                    assertEquals("uncertain", result.status());
                    assertEquals(SUBMISSION.toString(), result.submissionId());
                    assertEquals(CASE.toString(), result.caseId());
                    assertThrows(
                            SessionException.class,
                            () -> access.execute(approved.attemptId(), session, workspace));
                    assertThrows(SessionException.class, () -> access.prepare(request));
                    assertEquals(1, remote.posts);
                    assertEquals(1, remote.uploadAttempts);
                }
            }
        }
    }

    @Test
    void nativeSendDiagnosticsPreserveHttpFailureWithoutBodiesOrCredentialsAndDoNotPermitRetry()
            throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion api : ApiVersion.values())
                for (boolean announce : new boolean[] {false, true})
                    for (boolean thrown : new boolean[] {false, true}) {
                        var remote = new SenderCapture(api.wireValue());
                        remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                        var exchange =
                                new ResourceExchange() {
                                    public String get(String url, Map<String, String> headers) {
                                        return request("GET", url, headers, null).body();
                                    }

                                    public Response request(
                                            String method,
                                            String url,
                                            Map<String, String> headers,
                                            String body) {
                                        boolean matches =
                                                announce
                                                        ? method.equals("POST")
                                                                && url.endsWith("/submissions")
                                                        : method.equals("GET")
                                                                && url.equals(
                                                                        remote.BASE
                                                                                + "/destinations/"
                                                                                + TARGET);
                                        if (matches) {
                                            if (thrown)
                                                throw new SessionException(
                                                        "resource_unavailable",
                                                        503,
                                                        "https://schema.fitko.de/fit-connect/submission-api/problems/request-invalid");
                                            return new Response(
                                                    422, "synthetic-sensitive-response");
                                        }
                                        return remote.request(method, url, headers, body);
                                    }
                                };
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
                        var gate = new SendAccess(api, exchange);
                        var prepared = gate.prepare(request);
                        try (var session =
                                adapters.openSession(
                                        api,
                                        "id",
                                        "secret",
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        gate)) {
                            var result =
                                    adapters.withSession(
                                            api,
                                            session,
                                            s -> gate.execute(prepared.attemptId(), s, workspace));
                            assertEquals(announce ? "uncertain" : "failed", result.status());
                            var failure = result.diagnostics().getLast();
                            assertEquals(announce ? "announce" : "destination", failure.step());
                            assertEquals(thrown ? 503 : 422, failure.httpStatus());
                            assertEquals(thrown ? "request-invalid" : null, failure.problemType());
                            assertEquals("resource_unavailable", failure.code());
                            assertTrue(failure.durationMs() >= 0);
                            assertEquals(result, gate.state());
                            assertThrows(
                                    UnsupportedOperationException.class,
                                    () -> result.diagnostics().clear());
                            String serialized = new Gson().toJson(result);
                            for (String forbidden :
                                    List.of(
                                            "synthetic-token",
                                            "synthetic-sensitive-response",
                                            "Authorization",
                                            "https://",
                                            "givenName"))
                                assertFalse(serialized.contains(forbidden), serialized);
                            assertThrows(
                                    SessionException.class,
                                    () -> gate.execute(prepared.attemptId(), session, workspace));
                            if (announce)
                                assertThrows(SessionException.class, () -> gate.prepare(request));
                            else {
                                assertTrue(gate.prepare(request).diagnostics().isEmpty());
                                assertFalse(result.diagnostics().isEmpty());
                            }
                        }
                    }
        }
    }

    @Test
    void expiredOrCancelledConfirmationAndWrongSourcePermissionsCannotWrite() throws Exception {
        var time = new java.util.concurrent.atomic.AtomicLong();
        var remote = new SenderCapture();
        var access = new SendAccess(ApiVersion.V3, remote, time::get);
        var prepared = access.prepare(input(null, null));
        assertTrue(access.pendingBytes() > 0);
        time.set(60_000);
        assertEquals(
                0, access.pendingBytes(), "Expired confirmations release their native reservation");
        assertEquals(
                "confirmation_expired",
                access.execute(prepared.attemptId(), null, workspace).error());
        assertEquals(0, remote.posts);
        prepared = access.prepare(input(null, null));
        access.cancel(prepared.attemptId());
        String cancelled = prepared.attemptId();
        assertThrows(SessionException.class, () -> access.execute(cancelled, null, workspace));
        try (var adapters = registry()) {
            remote.denySource = true;
            var next = access.prepare(input(null, null));
            try (var session =
                    adapters.openSession(
                            ApiVersion.V3,
                            "id",
                            "secret",
                            (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                            access)) {
                assertEquals(
                        "failed",
                        adapters.withSession(
                                        ApiVersion.V3,
                                        session,
                                        s -> access.execute(next.attemptId(), s, workspace))
                                .status());
                assertEquals("resource_denied", access.state().error());
                assertEquals(0, remote.posts);
            }
        }
    }
}
