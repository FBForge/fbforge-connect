package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverReceiptSigningTest extends ReceiverTestSupport {
    @Test
    void bothSdkSignersProduceBoundPs512AcceptAndRejectTokensWithoutSendingAnything()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    String signRegistration = signingRegistration("synthetic-sign");
                    TestCertificatePolicy.validate(
                            JsonParser.parseString(signRegistration).getAsJsonObject(),
                            TestCertificatePolicy.Purpose.SIGNING,
                            java.time.Instant.now());
                    var accept =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "sign", pem, List.of(signRegistration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(accept, workspace)));
                    for (String reason :
                            List.of(
                                    "technical-error",
                                    "metadata-encryption-issue",
                                    "data-encryption-issue",
                                    "attachment-encryption-issue",
                                    "data-schema-violation")) {
                        var reject =
                                new ReceiptRequest(
                                        UUID.fromString(DEST),
                                        UUID.fromString(SUB),
                                        UUID.fromString(CASE),
                                        "reject",
                                        null,
                                        reason,
                                        "Synthetischer Test\nKeine echten Daten",
                                        reason.startsWith("attachment-")
                                                ? UUID.fromString(ReceiverFixture.ATT)
                                                : null);
                        var signed =
                                registry.withSession(
                                        api, session, s -> s.signReceipt(reject, workspace));
                        var claims = checkedReceipt(signed, "reject");
                        var event =
                                claims.getAsJsonObject("events")
                                        .getAsJsonObject(
                                                "https://schema.fitko.de/fit-connect/events/reject-submission");
                        assertFalse(event.has("authenticationTags"));
                        assertEquals(1, event.getAsJsonArray("problems").size());
                        var problem = event.getAsJsonArray("problems").get(0).getAsJsonObject();
                        assertEquals(reject.description(), problem.get("detail").getAsString());
                        assertEquals(
                                Set.of("type", "title", "detail", "instance"), problem.keySet());
                        assertEquals(
                                "https://schema.fitko.de/fit-connect/events/problems/"
                                        + (reason.equals("technical-error")
                                                ? "technical-error"
                                                : reason.equals("data-schema-violation")
                                                        ? "schema-violation"
                                                        : "encryption-issue"),
                                problem.get("type").getAsString());
                        assertFalse(problem.get("title").getAsString().isBlank());
                        assertEquals(
                                reason.equals("technical-error")
                                        ? "other"
                                        : reason.startsWith("metadata-")
                                                ? "metadata"
                                                : reason.startsWith("attachment-")
                                                        ? "attachment:" + ReceiverFixture.ATT
                                                        : "data",
                                problem.get("instance").getAsString());
                    }
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new ReceiverFixture(api, false, false);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.receive(DEST, SUB, scope, workspace, fixture.schemas()));
                    }
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(signRegistration, registration));
                                return null;
                            });
                    var signed =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(accept, workspace));
                    var claims = checkedReceipt(signed, "accept");
                    var event =
                            claims.getAsJsonObject("events")
                                    .getAsJsonObject(
                                            "https://schema.fitko.de/fit-connect/events/accept-submission");
                    var tags = event.getAsJsonObject("authenticationTags");
                    assertEquals(
                            fixture.encryptedData.split("\\.")[4], tags.get("data").getAsString());
                    assertEquals(
                            fixture.encryptedMetadata.split("\\.")[4],
                            tags.get("metadata").getAsString());
                    assertEquals(
                            fixture.encryptedAttachment.split("\\.")[4],
                            tags.getAsJsonObject("attachments")
                                    .get(ReceiverFixture.ATT)
                                    .getAsString());
                    assertFalse(event.has("problems"));
                    assertFalse(signed.toString().contains(signed.jwt()));
                    var withProblem =
                            accept.withBlockedAttachments(
                                    List.of(UUID.fromString(ReceiverFixture.ATT)));
                    var problemToken =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(withProblem, workspace));
                    var problemEvent =
                            checkedReceipt(problemToken, "accept")
                                    .getAsJsonObject("events")
                                    .getAsJsonObject(
                                            "https://schema.fitko.de/fit-connect/events/accept-submission");
                    assertEquals(1, problemEvent.getAsJsonArray("problems").size());
                    assertEquals(
                            "attachment:" + ReceiverFixture.ATT,
                            problemEvent
                                    .getAsJsonArray("problems")
                                    .get(0)
                                    .getAsJsonObject()
                                    .get("instance")
                                    .getAsString());
                    assertEquals(
                            "https://schema.fitko.de/fit-connect/events/problems/invalid-content",
                            problemEvent
                                    .getAsJsonArray("problems")
                                    .get(0)
                                    .getAsJsonObject()
                                    .get("type")
                                    .getAsString());
                    assertEquals(
                            event.get("authenticationTags"),
                            problemEvent.get("authenticationTags"));
                    var wrongCase =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(ReceiverFixture.ATT),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> s.signReceipt(wrongCase, workspace)));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardReceived();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(accept, workspace)));
                }
        }
    }

    @Test
    void bothSdkCaseClientsDispatchTheExactSignedTokenOnlyThroughTheConfirmedGate()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "reject",
                                    null,
                                    "technical-error",
                                    null,
                                    null);
                    var token =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(request, workspace));
                    var writes = new AtomicInteger();
                    ResourceExchange transport =
                            new ResourceExchange() {
                                public String get(String u, Map<String, String> h) {
                                    throw new AssertionError("No receipt read");
                                }

                                public Response request(
                                        String method,
                                        String url,
                                        Map<String, String> headers,
                                        String body) {
                                    assertEquals("POST", method);
                                    assertEquals(
                                            "https://test.fit-connect.fitko.dev/submission-api/"
                                                    + api.wireValue()
                                                    + "/cases/"
                                                    + CASE
                                                    + "/events",
                                            url);
                                    assertEquals(token.jwt(), body);
                                    assertTrue(
                                            headers.entrySet().stream()
                                                    .anyMatch(
                                                            h ->
                                                                    h.getKey()
                                                                                    .equalsIgnoreCase(
                                                                                            "Authorization")
                                                                            && h.getValue()
                                                                                    .startsWith(
                                                                                            "Bearer ")));
                                    assertTrue(
                                            headers.entrySet().stream()
                                                    .anyMatch(
                                                            h ->
                                                                    h.getKey()
                                                                                    .equalsIgnoreCase(
                                                                                            "Content-Type")
                                                                            && h.getValue()
                                                                                    .equals(
                                                                                            "application/jose")));
                                    writes.incrementAndGet();
                                    return new Response(204, "");
                                }
                            };
                    var gate = new ReceiptAccess(api, transport);
                    var prepared = gate.prepare(token);
                    var result =
                            gate.execute(
                                    prepared.attemptId(),
                                    (value, io) ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s -> {
                                                        s.sendReceipt(value, io);
                                                        return null;
                                                    }));
                    assertEquals("confirmed", result.status());
                    assertEquals(1, writes.get());
                    var wrongCase =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    UUID.randomUUID(),
                                    token.action(),
                                    token.signingKid(),
                                    token.jwt());
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(wrongCase, transport);
                                                return null;
                                            }));
                    var wrongAction =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    token.caseId(),
                                    "accept",
                                    token.signingKid(),
                                    token.jwt());
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(wrongAction, transport);
                                                return null;
                                            }));
                    String jwt = token.jwt();
                    int at = jwt.lastIndexOf('.') + 1;
                    var tampered =
                            new SignedReceipt(
                                    token.destinationId(),
                                    token.submissionId(),
                                    token.caseId(),
                                    token.action(),
                                    token.signingKid(),
                                    jwt.substring(0, at)
                                            + (jwt.charAt(at) == 'A' ? 'B' : 'A')
                                            + jwt.substring(at + 1));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(tampered, transport);
                                                return null;
                                            }));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardKeys();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.sendReceipt(token, transport);
                                                return null;
                                            }));
                    assertEquals(1, writes.get());
                }
        }
    }
}
