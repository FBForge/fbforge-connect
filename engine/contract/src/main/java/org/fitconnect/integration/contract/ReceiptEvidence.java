package org.fitconnect.integration.contract;

import java.util.*;

/**
 * Native-only receipt evidence retained after the complete SDK receive succeeds. Never a renderer
 * response.
 */
public record ReceiptEvidence(
        UUID destinationId,
        UUID submissionId,
        UUID caseId,
        String metadata,
        String data,
        Map<UUID, String> attachments) {
    public ReceiptEvidence {
        if (destinationId == null || submissionId == null || caseId == null) invalid();
        tag(metadata);
        if (data != null) tag(data);
        if (attachments == null) attachments = Map.of();
        if (attachments.size() > 512) invalid();
        for (var item : attachments.entrySet()) {
            if (item.getKey() == null) invalid();
            tag(item.getValue());
        }
        attachments = Map.copyOf(attachments);
    }

    static void tag(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{22}")) invalid();
        byte[] decoded = Base64.getUrlDecoder().decode(value);
        if (decoded.length != 16
                || !Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(value))
            invalid();
    }

    @Override
    public String toString() {
        return "ReceiptEvidence[authentication tags omitted]";
    }

    private static void invalid() {
        throw new SessionException("verification_failed");
    }
}
