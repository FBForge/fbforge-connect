package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceivedReplyContentTest {
    @Test
    void nativeReplyContentIsImmutableAndChunkReadsDoNotExposeBackingArrays() {
        byte[] meta = "{}".getBytes(StandardCharsets.UTF_8),
                data = "{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
        byte[] attachment = new byte[30000];
        Arrays.fill(attachment, (byte) 7);
        var file =
                new ReceivedContent.Attachment(
                        UUID.randomUUID(), "Antwort.txt", "text/plain", "Testanlage", attachment);
        var files = new ArrayList<>(List.of(file));
        var issues =
                new ArrayList<>(
                        List.of(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false)));
        UUID replyId = UUID.randomUUID(), caseId = UUID.randomUUID(), channel = UUID.randomUUID();
        var value =
                new ReceivedReplyContent(
                        replyId,
                        caseId,
                        null,
                        channel,
                        meta,
                        data,
                        "application/json",
                        files,
                        issues,
                        evidence(replyId, caseId, channel));
        meta[0] = 0;
        data[0] = 0;
        attachment[0] = 0;
        files.clear();
        issues.clear();
        assertEquals(3, value.partCount());
        assertEquals(30000, value.partLength(2));
        assertEquals('{', value.metadata()[0]);
        assertEquals('{', value.data()[0]);
        byte[] first = value.readPart(2, 0, 24 * 1024);
        assertEquals(24 * 1024, first.length);
        first[0] = 0;
        assertEquals(7, value.readPart(2, 0, 1)[0]);
        assertEquals(5424, value.readPart(2, 24576, 24576).length);
        assertEquals(0, value.readPart(2, 30000, 1).length);
        assertThrows(SessionException.class, () -> value.readPart(2, -1, 1));
        assertThrows(SessionException.class, () -> value.readPart(2, 30001, 1));
        assertThrows(SessionException.class, () -> value.readPart(2, 0, 24577));
        assertThrows(SessionException.class, () -> value.partLength(3));
        assertEquals("ReceivedReplyContent[content omitted]", value.toString());
    }

    @Test
    void invalidIdentityDuplicateAttachmentAndErrorReportsCannotBecomeVerifiedReplyContent() {
        UUID reply = UUID.randomUUID(), caseId = UUID.randomUUID(), channel = UUID.randomUUID();
        byte[] bytes = "{}".getBytes(StandardCharsets.UTF_8);
        var attachment =
                new ReceivedContent.Attachment(
                        UUID.randomUUID(), "a.txt", "text/plain", null, bytes);
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                null,
                                caseId,
                                null,
                                channel,
                                bytes,
                                bytes,
                                "application/json",
                                List.of(),
                                List.of(),
                                evidence(reply, caseId, channel)));
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                reply,
                                null,
                                null,
                                channel,
                                bytes,
                                bytes,
                                "application/json",
                                List.of(),
                                List.of(),
                                evidence(reply, caseId, channel)));
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                reply,
                                caseId,
                                null,
                                null,
                                bytes,
                                bytes,
                                "application/json",
                                List.of(),
                                List.of(),
                                evidence(reply, caseId, channel)));
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                reply,
                                caseId,
                                null,
                                channel,
                                bytes,
                                bytes,
                                "text/html",
                                List.of(),
                                List.of(),
                                evidence(reply, caseId, channel)));
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                reply,
                                caseId,
                                null,
                                channel,
                                bytes,
                                bytes,
                                "application/json",
                                List.of(attachment, attachment),
                                List.of(),
                                evidence(reply, caseId, channel)));
        assertThrows(
                SessionException.class,
                () ->
                        new ReceivedReplyContent(
                                reply,
                                caseId,
                                null,
                                channel,
                                bytes,
                                bytes,
                                "application/json",
                                List.of(),
                                List.of(new ReceivedContent.Issue("DATA", true)),
                                evidence(reply, caseId, channel)));
    }

    private static ReplyReceiptEvidence evidence(UUID reply, UUID caseId, UUID channel) {
        return new ReplyReceiptEvidence(
                caseId,
                reply,
                channel,
                "AAAAAAAAAAAAAAAAAAAAAA",
                "AAAAAAAAAAAAAAAAAAAAAA",
                Map.of());
    }
}
