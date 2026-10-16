package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SenderInputTest {
    private static SubmissionInput input(byte[] data, List<SubmissionInput.Attachment> attachments) {
        return new SubmissionInput(UUID.randomUUID(), UUID.randomUUID(),
                "urn:de:fim:leika:leistung:99008001014002", "Synthetischer Antrag", "DE000000000000",
                URI.create("https://example.invalid/schema.json"), "application/json", data, attachments,
                null, null);
    }

    @Test void nativeInputKeepsBytesImmutableAndNeverPrintsPayload() {
        byte[] bytes = "{\"givenName\":\"Synthetic-only\"}".getBytes(StandardCharsets.UTF_8);
        byte[] attachment = {1, 2, 3};
        var item = new SubmissionInput.Attachment("Anlage.txt", "text/plain", "Synthetische Anlage", attachment);
        var request = input(bytes, List.of(item));
        bytes[0] = 0;
        attachment[0] = 0;
        assertEquals('{', request.data()[0]);
        assertEquals(1, request.attachments().getFirst().data()[0]);
        request.data()[0] = 0;
        item.data()[0] = 0;
        assertEquals('{', request.data()[0]);
        assertEquals(1, item.data()[0]);
        assertFalse(request.toString().contains("Synthetic-only"));
        assertThrows(UnsupportedOperationException.class, () -> request.attachments().clear());
    }

    @Test void contentLimitsAndMissingOrMalformedDataFailBeforeAnSdkCall() {
        for (byte[] bad : List.of(new byte[0], new byte[]{(byte) 0xff}, new byte[32 * 1024 * 1024 + 1]))
            assertThrows(SessionException.class, () -> input(bad, List.of()));
        assertThrows(SessionException.class, () -> input("{}".getBytes(StandardCharsets.UTF_8),
                Collections.nCopies(40, new SubmissionInput.Attachment("a", "text/plain", "", new byte[0]))));
    }

    @Test void streamedUtf8ValidationHandlesSplitCodePointsAndRejectsAnIncompleteTail() {
        String text = "a".repeat(8191) + "€😀";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        assertEquals(bytes.length, input(bytes, List.of()).totalBytes());
        assertThrows(SessionException.class, () -> input(Arrays.copyOf(bytes, bytes.length - 1), List.of()));
    }
    @Test void replyOffersRequireAnAbsoluteSchemaAndSupportedFormatAndReferencesNeverClaimAnUnknownCase() {
        assertEquals("application/xml", new SubmissionInput.ReplyOffer(URI.create("urn:test:reply"), "application/xml").mimeType());
        assertThrows(SessionException.class, () -> new SubmissionInput.ReplyOffer(URI.create("relative.json"), "application/json"));
        assertThrows(SessionException.class, () -> new SubmissionInput.ReplyOffer(URI.create("urn:test:reply"), "text/html"));
        UUID attempt = UUID.randomUUID(), destination = UUID.randomUUID(), caseId = UUID.randomUUID();
        assertThrows(SessionException.class, () -> new ReplyChannelReference(attempt, destination, null, null, null, "reply-key:" + attempt, "bound"));
        assertThrows(SessionException.class, () -> new ReplyChannelReference(attempt, destination, null, caseId, null, "reply-key:" + attempt, "unresolved"));
        assertThrows(SessionException.class, () -> new ReplyChannelReference(attempt, destination, null, null, null, "reply-key:" + attempt, null));
        assertThrows(SessionException.class, () -> new ReplyChannelReference(attempt, destination, null, null, null, "reply-key:" + UUID.randomUUID(), "pending"));
    }
}
