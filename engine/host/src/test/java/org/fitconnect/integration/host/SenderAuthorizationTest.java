package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderAuthorizationTest extends SenderTestSupport {
    @Test
    void v3SendDoesNotRequirePermissionToListUnrelatedCases() throws Exception {
        var remote = new SenderCapture("v3");
        var gate =
                new SendAccess(
                        ApiVersion.V3,
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                return remote.get(url, headers);
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                if (url.contains("/cases?")) return new Response(403, "{}");
                                return remote.request(method, url, headers, body);
                            }
                        });
        try (var adapters = registry();
                var session =
                        adapters.openSession(
                                ApiVersion.V3,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                gate)) {
            var attempt = gate.prepare(input(null, null));
            var result = gate.execute(attempt.attemptId(), session, workspace);
            assertEquals("sent", result.status(), result.toString());
            assertEquals(1, remote.posts);
        }
    }

    @Test
    void metadataOneAndUnadvertisedServicesCannotAnnounceASubmission() throws Exception {
        try (var adapters = registry()) {
            for (boolean oldMetadata : List.of(true, false)) {
                var exchange = new SenderCapture();
                exchange.metadata = oldMetadata ? "1.0.0" : "3.0.0";
                exchange.offerService = oldMetadata;
                try (var session =
                        adapters.openSession(
                                ApiVersion.V3,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                exchange)) {
                    assertThrows(
                            SessionException.class,
                            () ->
                                    adapters.withSession(
                                            ApiVersion.V3,
                                            session,
                                            s -> s.send(input(null, null), workspace)));
                    assertEquals(0, exchange.posts);
                    assertTrue(exchange.uploads.isEmpty());
                }
            }
        }
    }

    @Test
    void nativeAttemptValidatesRecipientTestCertificateBeforeWritingAndDoesNotErasePriorSuccess()
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
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                access)) {
                    remote.omitCertificate = true;
                    var first = access.prepare(request);
                    var failed =
                            adapters.withSession(
                                    api,
                                    session,
                                    s -> access.execute(first.attemptId(), s, workspace));
                    assertEquals("failed", failed.status());
                    assertEquals("test_certificate_required", failed.error());
                    assertEquals(0, remote.posts);
                    remote.omitCertificate = false;
                    var second = access.prepare(request);
                    var sent =
                            adapters.withSession(
                                    api,
                                    session,
                                    s -> access.execute(second.attemptId(), s, workspace));
                    assertEquals("sent", sent.status());
                    assertEquals(SUBMISSION.toString(), sent.submissionId());
                    assertEquals(sent, access.state());
                    assertThrows(
                            SessionException.class,
                            () -> access.execute(second.attemptId(), session, workspace));
                    assertEquals(1, remote.posts);
                }
            }
        }
    }

    @Test
    void senderHttpRoutesRejectProductionWrongApiExtraQueriesAndArbitraryMethods() {
        String base = "https://test.fit-connect.fitko.dev/submission-api/v3/submissions";
        assertEquals(base, SendHttpTransport.allowed(ApiVersion.V3, "POST", base).toString());
        for (String url :
                List.of(
                        base.replace("test.fit-connect.fitko.dev", "prod.fit-connect.fitko.net"),
                        base.replace("/v3/", "/v2/"),
                        base + "?foo=1",
                        base + "#fragment",
                        base.replace("https:", "http:"),
                        base.replace(
                                "test.fit-connect.fitko.dev",
                                "test.fit-connect.fitko.dev@evil.invalid")))
            assertThrows(
                    SessionException.class,
                    () -> SendHttpTransport.allowed(ApiVersion.V3, "POST", url));
        assertThrows(
                SessionException.class,
                () -> SendHttpTransport.allowed(ApiVersion.V3, "DELETE", base));
    }

    @Test
    void v2RejectsMetadataOneFallbackAndExplicitSourceOrProcessAddressing() throws Exception {
        try (var adapters = registry()) {
            for (int invalid = 0; invalid < 3; invalid++) {
                var exchange = new SenderCapture("v2");
                exchange.metadata = invalid == 0 ? "1.0.0" : "2.0.0";
                var original = input(null, null);
                var request =
                        new SubmissionInput(
                                invalid == 1 ? SOURCE : null,
                                TARGET,
                                SERVICE,
                                original.serviceName(),
                                original.region(),
                                SCHEMA,
                                "application/json",
                                DATA,
                                original.attachments(),
                                null,
                                invalid == 2
                                        ? new SubmissionInput.ProcessMessage(
                                                "urn:test:process", "request")
                                        : null);
                try (var session =
                        adapters.openSession(
                                ApiVersion.V2,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                exchange)) {
                    assertThrows(
                            SessionException.class,
                            () ->
                                    adapters.withSession(
                                            ApiVersion.V2,
                                            session,
                                            s -> s.send(request, workspace)));
                    assertEquals(0, exchange.posts);
                }
            }
        }
    }
}
