package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptEvidenceTest {
    private static final UUID DEST = UUID.randomUUID(), SUB = UUID.randomUUID(), CASE = UUID.randomUUID(), ATT = UUID.randomUUID();
    private static final String TAG = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);
    @Test void immutableEvidenceBindsIdentityAndPreservesExactAuthenticationTagsWithoutPayloads() {
        var source = new HashMap<UUID,String>(); source.put(ATT, TAG);
        var evidence = new ReceiptEvidence(DEST, SUB, CASE, TAG, null, source); source.clear();
        assertEquals(DEST, evidence.destinationId()); assertEquals(SUB, evidence.submissionId()); assertEquals(CASE, evidence.caseId());
        assertEquals(Map.of(ATT, TAG), evidence.attachments()); assertNull(evidence.data());
        assertThrows(UnsupportedOperationException.class, () -> evidence.attachments().clear());
        assertFalse(evidence.toString().contains(TAG));
    }
    @Test void malformedNoncanonicalMissingOrOversizedTagsCannotBecomeReceiptEvidence() {
        for (String tag : List.of("", "x", TAG + "=", "!".repeat(22), "A".repeat(21) + "B"))
            assertThrows(SessionException.class, () -> new ReceiptEvidence(DEST, SUB, CASE, tag, TAG, Map.of()));
        assertThrows(SessionException.class, () -> new ReceiptEvidence(DEST, SUB, CASE, null, TAG, Map.of()));
        assertThrows(SessionException.class, () -> new ReceiptEvidence(null, SUB, CASE, TAG, TAG, Map.of()));
        assertThrows(SessionException.class, () -> new ReceiptEvidence(DEST, SUB, CASE, TAG, "invalid", Map.of()));
        assertThrows(SessionException.class, () -> new ReceiptEvidence(DEST, SUB, CASE, TAG, TAG, Map.of(ATT, "invalid")));
        var many = new HashMap<UUID,String>(); for (int i = 0; i < 513; i++) many.put(UUID.randomUUID(), TAG);
        assertThrows(SessionException.class, () -> new ReceiptEvidence(DEST, SUB, CASE, TAG, TAG, many));
    }
}
