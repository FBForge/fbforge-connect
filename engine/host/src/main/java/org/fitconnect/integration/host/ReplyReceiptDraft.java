package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Reply receipt choices only; native authentication tags are never accepted from the renderer. */
record ReplyReceiptDraft(ReplyReceiptRequest request, String proofId) {
    static ReplyReceiptDraft resolve(String document) {
        try {
            var value = StrictJson.object(document, 16384);
            if (!Set.of(
                            "caseId",
                            "replyId",
                            "action",
                            "reason",
                            "description",
                            "attachmentId",
                            "proofId")
                    .equals(value.keySet())) throw new IllegalArgumentException();
            String proof = text(value, "proofId"), attachment = text(value, "attachmentId");
            var request =
                    new ReplyReceiptRequest(
                            UUID.fromString(DestinationAccess.id(text(value, "caseId"))),
                            UUID.fromString(DestinationAccess.id(text(value, "replyId"))),
                            text(value, "action"),
                            text(value, "reason"),
                            text(value, "description"),
                            attachment == null
                                    ? null
                                    : UUID.fromString(DestinationAccess.id(attachment)));
            if (request.action().equals("accept") ? proof == null : proof != null)
                throw new IllegalArgumentException();
            return new ReplyReceiptDraft(
                    request, proof == null ? null : DestinationAccess.id(proof));
        } catch (Exception failure) {
            throw new SessionException("invalid_input");
        }
    }

    private static String text(JsonObject value, String field) {
        var item = value.get(field);
        if (item.isJsonNull()) return null;
        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString())
            throw new IllegalArgumentException();
        return item.getAsString();
    }
}
