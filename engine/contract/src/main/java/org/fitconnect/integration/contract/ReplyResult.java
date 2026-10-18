package org.fitconnect.integration.contract;

import java.util.UUID;

/** Confirmed public SDK reply identity, subject to the native host's one-shot write gate. */
public record ReplyResult(UUID replyId, UUID caseId, UUID fromDestinationId) {
    public ReplyResult {
        if (replyId == null || caseId == null) throw new SessionException("invalid_resource");
    }
}
