package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReplyReceiptContractTest {
    private static final UUID CASE = UUID.randomUUID(), REPLY = UUID.randomUUID(), CHANNEL = UUID.randomUUID();
    private static final String TAG = "AAAAAAAAAAAAAAAAAAAAAA";
    private static ReplyReceiptEvidence evidence() { return new ReplyReceiptEvidence(CASE, REPLY, CHANNEL, TAG, TAG, Map.of()); }
    @Test void acceptRequiresExactNativeReplyEvidenceAndOmitsPayloadFromDiagnosticText() {
        var request = new ReplyReceiptRequest(CASE, REPLY, "accept", null, null, null);
        assertThrows(SessionException.class, () -> new PreparedReplyReceipt(request, "{}", null));
        var foreign = new ReplyReceiptEvidence(UUID.randomUUID(), REPLY, CHANNEL, TAG, TAG, Map.of());
        assertThrows(SessionException.class, () -> new PreparedReplyReceipt(request, "{}", foreign));
        var prepared = new PreparedReplyReceipt(request, "{\"authenticationTags\":{}}", evidence());
        assertEquals("PreparedReplyReceipt[request body omitted]", prepared.toString());
        assertEquals("ReplyReceiptEvidence[authentication tags omitted]", prepared.evidence().toString());
    }
    @Test void rejectExplainsFailuresWithoutADecryptionProofButRequiresSupportedReasonAndAttachmentBinding() {
        var reject = new ReplyReceiptRequest(CASE, REPLY, "reject", "data-encryption-issue", "  ", null);
        assertNull(reject.description()); assertNotNull(new PreparedReplyReceipt(reject, "{}", null));
        assertThrows(SessionException.class, () -> new PreparedReplyReceipt(reject, "{}", evidence()));
        assertThrows(SessionException.class, () -> new ReplyReceiptRequest(CASE, REPLY, "reject", "unknown", null, null));
        assertThrows(SessionException.class, () -> new ReplyReceiptRequest(CASE, REPLY, "reject", "attachment-encryption-issue", null, null));
        assertThrows(SessionException.class, () -> new ReplyReceiptRequest(CASE, REPLY, "reject", "technical-error", null, UUID.randomUUID()));
        assertThrows(SessionException.class, () -> new ReplyReceiptRequest(CASE, REPLY, "accept", "technical-error", null, null));
    }
    @Test void evidenceIsImmutableCanonicalAndCannotContainMalformedTags() {
        var attachments = new HashMap<UUID,String>(); UUID attachment = UUID.randomUUID(); attachments.put(attachment, TAG);
        var evidence = new ReplyReceiptEvidence(CASE, REPLY, CHANNEL, TAG, TAG, attachments); attachments.clear();
        assertEquals(Map.of(attachment, TAG), evidence.attachments());
        assertThrows(UnsupportedOperationException.class, () -> evidence.attachments().clear());
        for (String tag : List.of("", "x".repeat(22), TAG + "=", "A".repeat(21) + "B"))
            assertThrows(SessionException.class, () -> new ReplyReceiptEvidence(CASE, REPLY, CHANNEL, tag, TAG, Map.of()));
        assertThrows(SessionException.class, () -> new ReplyReceiptEvidence(CASE, REPLY, CHANNEL, TAG, TAG, Map.of(attachment, "bad")));
    }
}
