package org.fitconnect.integration.contract;

import java.util.*;

/**
 * Native reply action. Accept requires verified evidence, reject may explain a failed decryption.
 */
public record ReplyReceiptRequest(
        UUID caseId,
        UUID replyId,
        String action,
        String reason,
        String description,
        UUID attachmentId,
        List<UUID> blockedAttachments) {
    public ReplyReceiptRequest(
            UUID caseId,
            UUID replyId,
            String action,
            String reason,
            String description,
            UUID attachmentId) {
        this(caseId, replyId, action, reason, description, attachmentId, List.of());
    }

    public ReplyReceiptRequest withBlockedAttachments(List<UUID> ids) {
        return new ReplyReceiptRequest(
                caseId, replyId, action, reason, description, attachmentId, ids);
    }

    public ReplyReceiptRequest {
        if (blockedAttachments == null
                || blockedAttachments.size() > 39
                || blockedAttachments.stream().anyMatch(Objects::isNull)
                || blockedAttachments.stream().distinct().count() != blockedAttachments.size()
                || !blockedAttachments.isEmpty() && !"accept".equals(action)) invalid();
        blockedAttachments = List.copyOf(blockedAttachments);

        if (caseId == null
                || replyId == null
                || action == null
                || !Set.of("accept", "reject").contains(action)) invalid();
        if (description != null
                && (description.length() > 2048
                        || description
                                .chars()
                                .anyMatch(c -> c < 32 && c != 9 && c != 10 && c != 13 || c == 127)))
            invalid();
        if (action.equals("accept")) {
            if (reason != null || description != null || attachmentId != null) invalid();
        } else {
            if (reason == null
                    || !Set.of(
                                    "technical-error",
                                    "metadata-encryption-issue",
                                    "data-encryption-issue",
                                    "attachment-encryption-issue",
                                    "data-schema-violation")
                            .contains(reason)) invalid();
            if (reason.equals("attachment-encryption-issue") != (attachmentId != null)) invalid();
            if (description != null && description.isBlank()) description = null;
        }
    }

    private static void invalid() {
        throw new SessionException("invalid_input");
    }
}
