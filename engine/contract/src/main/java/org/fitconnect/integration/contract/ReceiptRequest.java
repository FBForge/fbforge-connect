package org.fitconnect.integration.contract;

import java.util.*;

/**
 * Native receipt preparation. The host supplies freshly bound identities and enforces the
 * confirmation/write gate.
 */
public record ReceiptRequest(
        UUID destinationId,
        UUID submissionId,
        UUID caseId,
        String action,
        String signingKid,
        String reason,
        String description,
        UUID attachmentId,
        List<UUID> blockedAttachments) {
    public ReceiptRequest(
            UUID destinationId,
            UUID submissionId,
            UUID caseId,
            String action,
            String signingKid,
            String reason,
            String description,
            UUID attachmentId) {
        this(
                destinationId,
                submissionId,
                caseId,
                action,
                signingKid,
                reason,
                description,
                attachmentId,
                List.of());
    }

    public ReceiptRequest withBlockedAttachments(List<UUID> ids) {
        return new ReceiptRequest(
                destinationId,
                submissionId,
                caseId,
                action,
                signingKid,
                reason,
                description,
                attachmentId,
                ids);
    }

    public ReceiptRequest {
        if (blockedAttachments == null
                || blockedAttachments.size() > 39
                || blockedAttachments.stream().anyMatch(Objects::isNull)
                || blockedAttachments.stream().distinct().count() != blockedAttachments.size()
                || !blockedAttachments.isEmpty() && !"accept".equals(action)) invalid();
        blockedAttachments = List.copyOf(blockedAttachments);

        if (destinationId == null
                || submissionId == null
                || caseId == null
                || action == null
                || !Set.of("accept", "reject").contains(action)) invalid();
        if (signingKid != null
                && (signingKid.isBlank()
                        || signingKid.length() > 512
                        || signingKid.chars().anyMatch(c -> c < 32 || c == 127))) invalid();
        if (description != null
                && (description.length() > 2048
                        || description
                                .chars()
                                .anyMatch(c -> c < 32 && c != 9 && c != 10 && c != 13 || c == 127)))
            invalid();
        if ("accept".equals(action)) {
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
