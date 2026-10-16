package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptRequestTest {
    private static final UUID DEST = UUID.randomUUID(), SUB = UUID.randomUUID(), CASE = UUID.randomUUID(), ATT = UUID.randomUUID();
    @Test void acceptHasNoInventedProblemAndRejectionRequiresOneSupportedReason() {
        assertEquals("accept", new ReceiptRequest(DEST, SUB, CASE, "accept", null, null, null, null).action());
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "accept", null, "technical-error", null, null));
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "accept", null, null, "extra", null));
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "reject", null, null, null, null));
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "reject", null, "arbitrary", null, null));
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "arbitrary", null, null, null, null));
    }
    @Test void attachmentsIdentityLengthsAndControlCharactersAreBoundedBeforeSigning() {
        assertEquals(ATT, new ReceiptRequest(DEST, SUB, CASE, "reject", "kid", "attachment-encryption-issue", "Test\nErläuterung", ATT).attachmentId());
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "reject", null, "attachment-encryption-issue", null, null));
        assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "reject", null, "technical-error", null, ATT));
        assertThrows(SessionException.class, () -> new ReceiptRequest(null, SUB, CASE, "accept", null, null, null, null));
        for (String kid : List.of("", "x".repeat(513), "kid\nextra"))
            assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "accept", kid, null, null, null));
        for (String description : List.of("x".repeat(2049), "x\u0000y"))
            assertThrows(SessionException.class, () -> new ReceiptRequest(DEST, SUB, CASE, "reject", null, "technical-error", description, null));
    }
}
