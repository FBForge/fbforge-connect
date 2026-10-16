package org.fitconnect.integration.host;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import java.util.*;

/** Renderer choices only. No token, key, endpoint or registration can be supplied here. */
record ReceiptDraft(ReceiptRequest request, String proofId) {
    static ReceiptDraft resolve(String document) {
        try {
            var value = StrictJson.object(document, 16384);
            if (!Set.of("destinationId", "submissionId", "caseId", "action", "signingKid", "reason", "description", "attachmentId", "proofId")
                    .containsAll(value.keySet())) throw new IllegalArgumentException();
            String action = text(value, "action"), attachment = text(value, "attachmentId"), proof = text(value, "proofId");
            if ("accept".equals(action) ? proof == null : proof != null) throw new IllegalArgumentException();
            var request = new ReceiptRequest(uuid(value, "destinationId"), uuid(value, "submissionId"), uuid(value, "caseId"), action,
                    text(value, "signingKid"), text(value, "reason"), text(value, "description"), attachment == null ? null : UUID.fromString(DestinationAccess.id(attachment)));
            return new ReceiptDraft(request, proof == null ? null : DestinationAccess.id(proof));
        } catch (Exception failure) { throw new SessionException("invalid_input"); }
    }
    private static UUID uuid(JsonObject value, String field) { return UUID.fromString(DestinationAccess.id(text(value, field))); }
    private static String text(JsonObject value, String field) {
        var item = value.get(field);
        if (item == null || item.isJsonNull()) return null;
        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString()) throw new IllegalArgumentException();
        return item.getAsString();
    }
}
