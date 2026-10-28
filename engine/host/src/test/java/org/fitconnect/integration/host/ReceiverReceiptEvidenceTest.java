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

class ReceiverReceiptEvidenceTest extends ReceiverTestSupport {
    @Test
    void receiptEvidenceIsUnavailableBeforeVerificationAfterFailureOrAfterKeyChanges()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.receiptEvidence(DEST, SUB)));
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var valid = new ReceiverFixture(api, false, false);
                    for (String invalidation :
                            List.of(
                                    "discard-proof",
                                    "discard-keys",
                                    "replace-key",
                                    "withdraw-key",
                                    "failed-receive")) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                        try (var read = new ReceiveAccess(api, DEST, SUB, valid)) {
                            registry.withSession(
                                    api,
                                    session,
                                    s -> s.receive(DEST, SUB, read, workspace, valid.schemas()));
                        }
                        assertNotNull(
                                registry.withSession(
                                        api, session, s -> s.receiptEvidence(DEST, SUB)));
                        switch (invalidation) {
                            case "discard-proof" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.discardReceived();
                                                return null;
                                            });
                            case "discard-keys" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.discardKeys();
                                                return null;
                                            });
                            case "replace-key" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.importKey(
                                                            DEST,
                                                            "decrypt",
                                                            pem,
                                                            List.of(registration)));
                            case "withdraw-key" ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.retainKeys(DEST, List.of());
                                                return null;
                                            });
                            case "failed-receive" -> {
                                var bad = new ReceiverFixture(api, false, true);
                                try (var read = new ReceiveAccess(api, DEST, SUB, bad)) {
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    registry.withSession(
                                                            api,
                                                            session,
                                                            s ->
                                                                    s.receive(
                                                                            DEST,
                                                                            SUB,
                                                                            read,
                                                                            workspace,
                                                                            bad.schemas())));
                                }
                            }
                        }
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api, session, s -> s.receiptEvidence(DEST, SUB)),
                                invalidation);
                    }
                }
        }
    }

    @Test
    void receiptSigningNeverUsesADecryptionKeyAndRequiresAnExplicitKidWhenAmbiguous()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
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
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(request, workspace)));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("second-sign"))));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api, session, s -> s.signReceipt(request, workspace)));
                    var selected =
                            new ReceiptRequest(
                                    request.destinationId(),
                                    request.submissionId(),
                                    request.caseId(),
                                    request.action(),
                                    "synthetic-sign",
                                    request.reason(),
                                    null,
                                    null);
                    checkedReceipt(
                            registry.withSession(
                                    api, session, s -> s.signReceipt(selected, workspace)),
                            "reject");
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
                                            api, session, s -> s.signReceipt(selected, workspace)));
                }
        }
    }

    @Test
    void acceptDispatchRequiresTheStillValidNativeReceiveProof() throws Exception {
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
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new ReceiverFixture(api, false, false);
                    try (var read = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        registry.withSession(
                                api,
                                session,
                                s -> s.receive(DEST, SUB, read, workspace, fixture.schemas()));
                    }
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    var token =
                            registry.withSession(
                                    api, session, s -> s.signReceipt(request, workspace));
                    var writes = new AtomicInteger();
                    ResourceExchange transport =
                            new ResourceExchange() {
                                public String get(String u, Map<String, String> h) {
                                    throw new AssertionError();
                                }

                                public Response request(
                                        String m, String u, Map<String, String> h, String b) {
                                    assertEquals("POST", m);
                                    assertEquals(token.jwt(), b);
                                    writes.incrementAndGet();
                                    return new Response(204, "");
                                }
                            };
                    var gate = new ReceiptAccess(api, transport);
                    var prepared = gate.prepare(token);
                    assertEquals(
                            "confirmed",
                            gate.execute(
                                            prepared.attemptId(),
                                            (value, io) ->
                                                    registry.withSession(
                                                            api,
                                                            session,
                                                            s -> {
                                                                s.sendReceipt(value, io);
                                                                return null;
                                                            }))
                                    .status());
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
