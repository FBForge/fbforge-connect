package org.fitconnect.integration.contract;

import java.util.*;

/** Native-only proof of the complete SDK reply receive. Never an IPC DTO. */
public record ReplyReceiptEvidence(UUID caseId, UUID replyId, UUID channelAttemptId, String metadata, String data,
        Map<UUID,String> attachments) {
    public ReplyReceiptEvidence {
        if (caseId == null || replyId == null || channelAttemptId == null) invalid();
        ReceiptEvidence.tag(metadata);
        if (data != null) ReceiptEvidence.tag(data);
        if (attachments == null) attachments = Map.of();
        if (attachments.size() > 512) invalid();
        for (var item : attachments.entrySet()) {
            if (item.getKey() == null) invalid();
            ReceiptEvidence.tag(item.getValue());
        }
        attachments = Map.copyOf(attachments);
    }
    @Override public String toString() { return "ReplyReceiptEvidence[authentication tags omitted]"; }
    private static void invalid() { throw new SessionException("verification_failed"); }
}
