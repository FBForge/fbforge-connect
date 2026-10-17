package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptDraftTest {
    private static final String ID = "11111111-1111-4111-8111-111111111111";

    private static JsonObject draft() {
        var value = new JsonObject();
        for (String field : List.of("destinationId", "submissionId", "caseId"))
            value.addProperty(field, ID);
        value.addProperty("action", "reject");
        value.addProperty("reason", "technical-error");
        return value;
    }

    @Test
    void validPreparationParsesOnlyBoundedUserChoicesAndOptionalNativeProofReference() {
        var result = ReceiptDraft.resolve(draft().toString());
        assertEquals(UUID.fromString(ID), result.request().destinationId());
        assertNull(result.proofId());
        var accept = draft();
        accept.addProperty("action", "accept");
        accept.remove("reason");
        accept.addProperty("proofId", ID);
        assertEquals(ID, ReceiptDraft.resolve(accept.toString()).proofId());
    }

    @Test
    void tokensUrlsDuplicatesWrongTypesAndOversizedDocumentsAreRejected() {
        for (String field : List.of("jwt", "url", "clientSecret", "keyDocument", "environment")) {
            var value = draft();
            value.addProperty(field, "untrusted");
            assertThrows(SessionException.class, () -> ReceiptDraft.resolve(value.toString()));
        }
        for (String field : List.of("destinationId", "action", "description", "proofId")) {
            var value = draft();
            value.addProperty(field, 1);
            assertThrows(SessionException.class, () -> ReceiptDraft.resolve(value.toString()));
        }
        assertThrows(
                SessionException.class,
                () ->
                        ReceiptDraft.resolve(
                                draft().toString()
                                        .replace(
                                                "\"reject\"", "\"reject\",\"action\":\"accept\"")));
        assertThrows(SessionException.class, () -> ReceiptDraft.resolve(" ".repeat(16385)));
    }
}
