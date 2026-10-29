package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderReplyReceiveTest extends SenderTestSupport {
    @Test
    void bothSdkReplyReceiversAutomaticallySelectTheBoundCaseAndKidWithoutPrivateKeyExports()
            throws Exception {
        for (var api : ApiVersion.values())
            for (String replyMime : List.of("application/json", "application/xml"))
                for (boolean metadata3 :
                        api == ApiVersion.V3 ? List.of(false, true) : List.of(false)) {
                    var remote = new SenderCapture(api.wireValue());
                    remote.allowReplies = true;
                    remote.metadata = "2.0.0";
                    var gate = new SendAccess(api, remote);
                    try (var adapters = registry();
                            var session =
                                    adapters.openSession(
                                            api,
                                            "id",
                                            "secret",
                                            (u, b) ->
                                                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                            gate)) {
                        var input = replyInput(api);
                        // Wire v2 offers only a schema URI, the native expectation retains its
                        // MIME.
                        input =
                                new SubmissionInput(
                                        input.fromDestinationId(),
                                        input.destinationId(),
                                        input.serviceIdentifier(),
                                        input.serviceName(),
                                        input.region(),
                                        input.schemaUri(),
                                        input.mimeType(),
                                        input.data(),
                                        input.attachments(),
                                        input.caseId(),
                                        input.processMessage(),
                                        new SubmissionInput.ReplyOffer(REPLY_SCHEMA, replyMime));
                        var first = gate.prepare(input);
                        var frozenInput = input;
                        adapters.withSession(
                                api,
                                session,
                                value -> {
                                    value.prepareReplyChannel(
                                            UUID.fromString(first.attemptId()),
                                            frozenInput,
                                            workspace);
                                    return null;
                                });
                        var pendingArchive = session.archiveKeys().getFirst();
                        assertEquals("pending", pendingArchive.replyChannel().status());
                        assertEquals(
                                "SessionKeyArchive[private material omitted]",
                                pendingArchive.toString());
                        assertEquals(
                                "sent",
                                adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        gate.execute(
                                                                first.attemptId(),
                                                                value,
                                                                workspace))
                                        .status());
                        var firstReference = session.replyChannels().getFirst();
                        var metadata =
                                JsonParser.parseString(
                                        new String(
                                                decrypt(
                                                        remote.submitted
                                                                .get("encryptedMetadata")
                                                                .getAsString()),
                                                StandardCharsets.UTF_8));
                        var replyPublicKey =
                                findJsonObject(metadata, "kid", firstReference.keyId()).deepCopy();
                        var second = gate.prepare(input);
                        assertEquals(
                                "sent",
                                adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        gate.execute(
                                                                second.attemptId(),
                                                                value,
                                                                workspace))
                                        .status());
                        assertEquals(2, session.replyChannels().size());
                        session.discardKeys();
                        var fixture =
                                new SenderIncomingReplyFixture(
                                        api, replyPublicKey, replyMime, metadata3);
                        try (var read =
                                ReceiveAccess.forReply(
                                        api,
                                        CASE.toString(),
                                        fixture.replyId.toString(),
                                        fixture)) {
                            var result =
                                    adapters.withSession(
                                            api,
                                            session,
                                            value ->
                                                    value.receiveReply(
                                                            CASE,
                                                            fixture.replyId,
                                                            read,
                                                            workspace,
                                                            fixture.schemas()));
                            assertEquals(fixture.replyId, result.replyId());
                            assertEquals(CASE, result.caseId());
                            assertEquals(
                                    firstReference.attemptId(),
                                    result.channelAttemptId(),
                                    "An older key in the same case must still resolve by kid");
                            assertArrayEquals(fixture.data, result.data());
                            assertArrayEquals(fixture.metadata, result.metadata());
                            assertEquals(1, result.attachments().size());
                            assertEquals(
                                    "Synthetische Antwortanlage",
                                    result.attachments().getFirst().description());
                            assertArrayEquals(fixture.attachment, result.readPart(2, 0, 24 * 1024));
                            assertEquals(replyMime, result.mimeType());
                            try (var logSource =
                                    new EventLogAccess(
                                            api,
                                            CASE.toString(),
                                            fixture.replyId.toString(),
                                            fixture,
                                            true)) {
                                var log =
                                        adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.replyEventLog(
                                                                CASE,
                                                                fixture.replyId,
                                                                logSource,
                                                                workspace));
                                assertEquals(fixture.replyId, log.replyId());
                                assertNull(log.submissionId());
                                assertEquals(2, log.entries().size());
                            }
                            for (String attack :
                                    List.of(
                                            "event-signature",
                                            "event-subject",
                                            "event-case",
                                            "duplicate-submit")) {
                                fixture.attack = attack;
                                try (var logSource =
                                        new EventLogAccess(
                                                api,
                                                CASE.toString(),
                                                fixture.replyId.toString(),
                                                fixture,
                                                true)) {
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            session,
                                                            value ->
                                                                    value.replyEventLog(
                                                                            CASE,
                                                                            fixture.replyId,
                                                                            logSource,
                                                                            workspace)),
                                            api + " reply log " + attack);
                                }
                            }
                            fixture.attack = "";
                            assertFalse(
                                    result.issues().stream()
                                            .anyMatch(
                                                    item ->
                                                            item.stage()
                                                                    .equals(
                                                                            "XML_SCHEMA_NOT_CHECKED")));
                            assertFalse(result.toString().contains("Erika"));
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            session.receiptEvidence(
                                                    TARGET.toString(), SUBMISSION.toString()));
                            assertTrue(
                                    session.loadedKeys().isEmpty(),
                                    "Ephemeral reply receive needs no imported destination key");
                            if (replyMime.equals("application/json") && !metadata3) {
                                var archived = session.archiveKeys();
                                assertEquals(2, archived.size());
                                Path restartedWorkspace =
                                        Files.createDirectories(
                                                workspace.resolve("restarted-" + api));
                                try (var restarted =
                                        adapters.openSession(
                                                api,
                                                "id",
                                                "secret",
                                                (u, b) ->
                                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                                fixture)) {
                                    for (var item : archived)
                                        adapters.withSession(
                                                api,
                                                restarted,
                                                value -> {
                                                    value.restoreReplyKey(item, restartedWorkspace);
                                                    return null;
                                                });
                                    try (var restoredRead =
                                            ReceiveAccess.forReply(
                                                    api,
                                                    CASE.toString(),
                                                    fixture.replyId.toString(),
                                                    fixture)) {
                                        var restored =
                                                adapters.withSession(
                                                        api,
                                                        restarted,
                                                        value ->
                                                                value.receiveReply(
                                                                        CASE,
                                                                        fixture.replyId,
                                                                        restoredRead,
                                                                        restartedWorkspace,
                                                                        fixture.schemas()));
                                        assertArrayEquals(result.data(), restored.data());
                                        assertEquals(
                                                result.channelAttemptId(),
                                                restored.channelAttemptId());
                                    }
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    restarted.receiptEvidence(
                                                            TARGET.toString(),
                                                            SUBMISSION.toString()));
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            restarted,
                                                            value -> {
                                                                value.restoreReplyKey(
                                                                        archived.getFirst(),
                                                                        restartedWorkspace);
                                                                return null;
                                                            }));
                                }
                            }
                            if (replyMime.equals("application/json") && !metadata3) {
                                Path recoveryWorkspace =
                                        Files.createDirectories(
                                                workspace.resolve("recovery-" + api));
                                try (var restarted =
                                        adapters.openSession(
                                                api,
                                                "id",
                                                "secret",
                                                (u, b) ->
                                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                                fixture)) {
                                    adapters.withSession(
                                            api,
                                            restarted,
                                            value -> {
                                                value.restoreReplyKey(
                                                        pendingArchive, recoveryWorkspace);
                                                return null;
                                            });
                                    assertEquals(
                                            "unresolved",
                                            restarted.replyChannels().getFirst().status());
                                    for (String attack :
                                            List.of(
                                                    "event-signature",
                                                    "attachment-tag",
                                                    "event-case",
                                                    "kid")) {
                                        fixture.attack = attack;
                                        try (var recoveryRead =
                                                ReceiveAccess.forReply(
                                                        api,
                                                        CASE.toString(),
                                                        fixture.replyId.toString(),
                                                        fixture)) {
                                            assertThrows(
                                                    SessionException.class,
                                                    () ->
                                                            adapters.withSession(
                                                                    api,
                                                                    restarted,
                                                                    value ->
                                                                            value.receiveReply(
                                                                                    CASE,
                                                                                    fixture.replyId,
                                                                                    recoveryRead,
                                                                                    recoveryWorkspace,
                                                                                    fixture
                                                                                            .schemas())));
                                        }
                                        assertEquals(
                                                "unresolved",
                                                restarted.replyChannels().getFirst().status(),
                                                "Failed proof must never bind an unresolved key");
                                    }
                                    fixture.attack = "";
                                    try (var recoveryRead =
                                            ReceiveAccess.forReply(
                                                    api,
                                                    CASE.toString(),
                                                    fixture.replyId.toString(),
                                                    fixture)) {
                                        var recovered =
                                                adapters.withSession(
                                                        api,
                                                        restarted,
                                                        value ->
                                                                value.receiveReply(
                                                                        CASE,
                                                                        fixture.replyId,
                                                                        recoveryRead,
                                                                        recoveryWorkspace,
                                                                        fixture.schemas()));
                                        assertArrayEquals(result.data(), recovered.data());
                                        assertEquals(
                                                "recovered",
                                                restarted.replyChannels().getFirst().status());
                                        assertEquals(
                                                CASE,
                                                restarted.replyChannels().getFirst().caseId());
                                        assertNull(
                                                restarted
                                                        .replyChannels()
                                                        .getFirst()
                                                        .submissionId());
                                        assertNotNull(
                                                adapters.withSession(
                                                        api,
                                                        restarted,
                                                        value ->
                                                                value.prepareReplyReceipt(
                                                                        new ReplyReceiptRequest(
                                                                                CASE,
                                                                                fixture.replyId,
                                                                                "accept",
                                                                                null,
                                                                                null,
                                                                                null),
                                                                        recovered.evidence())));
                                    }
                                    var recoveredArchive = restarted.archiveKeys().getFirst();
                                    try (var again =
                                            adapters.openSession(
                                                    api,
                                                    "id",
                                                    "secret",
                                                    (u, b) ->
                                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                                    fixture)) {
                                        adapters.withSession(
                                                api,
                                                again,
                                                value -> {
                                                    value.restoreReplyKey(
                                                            recoveredArchive, recoveryWorkspace);
                                                    return null;
                                                });
                                        try (var againRead =
                                                ReceiveAccess.forReply(
                                                        api,
                                                        CASE.toString(),
                                                        fixture.replyId.toString(),
                                                        fixture)) {
                                            assertArrayEquals(
                                                    result.data(),
                                                    adapters.withSession(
                                                                    api,
                                                                    again,
                                                                    value ->
                                                                            value.receiveReply(
                                                                                    CASE,
                                                                                    fixture.replyId,
                                                                                    againRead,
                                                                                    recoveryWorkspace,
                                                                                    fixture
                                                                                            .schemas()))
                                                            .data());
                                        }
                                    }
                                }
                            }
                            for (String action : List.of("accept", "reject")) {
                                var request =
                                        new ReplyReceiptRequest(
                                                CASE,
                                                fixture.replyId,
                                                action,
                                                action.equals("reject") ? "technical-error" : null,
                                                action.equals("reject")
                                                        ? "Synthetische technische Rückmeldung"
                                                        : null,
                                                null);
                                var evidence = action.equals("accept") ? result.evidence() : null;
                                var prepared =
                                        adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.prepareReplyReceipt(
                                                                request, evidence));
                                assertEquals(request, prepared.request());
                                if (action.equals("accept")) {
                                    var tags =
                                            JsonParser.parseString(prepared.body())
                                                    .getAsJsonObject()
                                                    .getAsJsonObject("authenticationTags");
                                    // Independent evidence from the original encrypted parts, not
                                    // an
                                    // acknowledgement copied from the request under test. SDK4
                                    // changed
                                    // constructor order to metadata, data; SDK3 still takes data
                                    // first.
                                    assertEquals(
                                            fixture.encryptedMetadata.split("\\.")[4],
                                            tags.get("metadata").getAsString(),
                                            api + " metadata tag");
                                    assertEquals(
                                            fixture.encryptedData.split("\\.")[4],
                                            tags.get("data").getAsString(),
                                            api + " data tag");
                                    assertEquals(
                                            fixture.encryptedAttachment.split("\\.")[4],
                                            tags.getAsJsonObject("attachments")
                                                    .get(fixture.attachmentId.toString())
                                                    .getAsString());
                                    var withProblems =
                                            request.withBlockedAttachments(
                                                    List.of(fixture.attachmentId));
                                    var flagged =
                                            adapters.withSession(
                                                    api,
                                                    session,
                                                    value ->
                                                            value.prepareReplyReceipt(
                                                                    withProblems, evidence));
                                    var flaggedBody =
                                            JsonParser.parseString(flagged.body())
                                                    .getAsJsonObject();
                                    assertEquals(
                                            tags,
                                            flaggedBody.getAsJsonObject("authenticationTags"));
                                    var problem =
                                            flaggedBody
                                                    .getAsJsonArray("problems")
                                                    .get(0)
                                                    .getAsJsonObject();
                                    assertEquals(
                                            "attachment:" + fixture.attachmentId,
                                            problem.get("instance").getAsString());
                                    assertEquals(
                                            "https://schema.fitko.de/fit-connect/events/problems/invalid-content",
                                            problem.get("type").getAsString());
                                    var flaggedTransport =
                                            new SenderReplyReceiptCapture(fixture, flagged);
                                    assertNotNull(
                                            adapters.withSession(
                                                    api,
                                                    session,
                                                    value ->
                                                            value.sendReplyReceipt(
                                                                    flagged,
                                                                    flaggedTransport,
                                                                    workspace)));
                                    assertEquals(1, flaggedTransport.puts);
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            session,
                                                            value ->
                                                                    value.prepareReplyReceipt(
                                                                            request
                                                                                    .withBlockedAttachments(
                                                                                            List.of(
                                                                                                    UUID
                                                                                                            .randomUUID())),
                                                                            evidence)));
                                }
                                assertFalse(prepared.toString().contains("authenticationTags"));
                                var transport = new SenderReplyReceiptCapture(fixture, prepared);
                                assertNotNull(
                                        adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.sendReplyReceipt(
                                                                prepared, transport, workspace)));
                                assertEquals(1, transport.puts);
                                var confirmedTransport =
                                        new SenderReplyReceiptCapture(fixture, prepared);
                                try (var confirmation =
                                        new ReplyReceiptAccess(api, confirmedTransport)) {
                                    var attempt = confirmation.prepare(prepared);
                                    var completed =
                                            adapters.withSession(
                                                    api,
                                                    session,
                                                    value ->
                                                            confirmation.execute(
                                                                    attempt.attemptId(),
                                                                    value,
                                                                    workspace,
                                                                    () -> {}));
                                    assertEquals(
                                            "confirmed",
                                            completed.status(),
                                            api + ": " + completed);
                                    assertEquals(1, confirmedTransport.puts);
                                    assertNotNull(completed.eventId());
                                    assertThrows(
                                            SessionException.class,
                                            () -> confirmation.prepare(prepared));
                                }
                                for (String malformed :
                                        List.of(
                                                "signature",
                                                "event-case",
                                                "event-subject",
                                                "event-action",
                                                "tags",
                                                "empty")) {
                                    var invalid = new SenderReplyReceiptCapture(fixture, prepared);
                                    invalid.ackAttack = malformed;
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            session,
                                                            value ->
                                                                    value.sendReplyReceipt(
                                                                            prepared, invalid,
                                                                            workspace)),
                                            api + " " + action + " " + malformed);
                                    assertEquals(1, invalid.puts);
                                }
                                var wrongCase = new SenderReplyReceiptCapture(fixture, prepared);
                                wrongCase.wrongCase = true;
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                adapters.withSession(
                                                        api,
                                                        session,
                                                        value ->
                                                                value.sendReplyReceipt(
                                                                        prepared, wrongCase,
                                                                        workspace)));
                                assertEquals(0, wrongCase.puts);
                                var alteredBody = new PreparedReplyReceipt(request, "{}", evidence);
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                adapters.withSession(
                                                        api,
                                                        session,
                                                        value ->
                                                                value.sendReplyReceipt(
                                                                        alteredBody,
                                                                        transport,
                                                                        workspace)));
                                assertEquals(1, transport.puts);
                                if (action.equals("accept")) {
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            session,
                                                            value ->
                                                                    value.prepareReplyReceipt(
                                                                            request, null)));
                                    var foreign =
                                            new ReplyReceiptEvidence(
                                                    CASE,
                                                    fixture.replyId,
                                                    UUID.randomUUID(),
                                                    evidence.metadata(),
                                                    evidence.data(),
                                                    evidence.attachments());
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    adapters.withSession(
                                                            api,
                                                            session,
                                                            value ->
                                                                    value.prepareReplyReceipt(
                                                                            request, foreign)));
                                }
                            }
                            fixture.attack = "";
                        }
                        var reads = new java.util.concurrent.atomic.AtomicInteger();
                        var absent =
                                new ReplySource() {
                                    public String get(String u, Map<String, String> h) {
                                        reads.incrementAndGet();
                                        fail("Unknown case must not reach HTTP");
                                        return null;
                                    }

                                    public void verifyAuthenticationTags(
                                            UUID c,
                                            UUID r,
                                            String m,
                                            String d,
                                            Map<UUID, String> a) {
                                        fail();
                                    }
                                };
                        assertThrows(
                                SessionException.class,
                                () ->
                                        adapters.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.receiveReply(
                                                                UUID.randomUUID(),
                                                                fixture.replyId,
                                                                absent,
                                                                workspace,
                                                                fixture.schemas())));
                        assertEquals(0, reads.get());
                        for (String attack :
                                List.of(
                                        "ciphertext",
                                        "event-signature",
                                        "attachment-tag",
                                        "schema",
                                        "mime",
                                        "kid",
                                        "event-case",
                                        "event-subject",
                                        "duplicate-submit")) {
                            fixture.attack = attack;
                            try (var read =
                                    ReceiveAccess.forReply(
                                            api,
                                            CASE.toString(),
                                            fixture.replyId.toString(),
                                            fixture)) {
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                adapters.withSession(
                                                        api,
                                                        session,
                                                        value ->
                                                                value.receiveReply(
                                                                        CASE,
                                                                        fixture.replyId,
                                                                        read,
                                                                        workspace,
                                                                        fixture.schemas())),
                                        api + " " + attack);
                            }
                        }
                        session.close();
                        assertThrows(
                                SessionException.class,
                                () ->
                                        session.receiveReply(
                                                CASE,
                                                fixture.replyId,
                                                absent,
                                                workspace,
                                                fixture.schemas()));
                    }
                }
    }
}
