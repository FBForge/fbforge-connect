package org.fitconnect.integration.contract;

import java.util.*;

/** Envelope information is not evidence of decryption, authenticity or successful receipt. */
public record SubmissionInfo(
        UUID destinationId,
        UUID fromDestinationId,
        UUID submissionId,
        UUID caseId,
        List<UUID> attachments,
        String serviceIdentifier,
        String serviceName,
        String region,
        String processModelId,
        String messageId,
        boolean metadataAvailable,
        boolean dataAvailable) {
    public SubmissionInfo {
        if (destinationId == null
                || submissionId == null
                || caseId == null
                || attachments == null
                || attachments.size() > 512
                || attachments.stream().anyMatch(Objects::isNull)
                || new HashSet<>(attachments).size() != attachments.size()
                || (processModelId == null) != (messageId == null))
            throw new SessionException("invalid_resource");
        text(serviceIdentifier, 1024);
        text(serviceName, 512);
        text(region, 128);
        text(processModelId, 1024);
        text(messageId, 1024);
        attachments = List.copyOf(attachments);
    }

    private static void text(String value, int maximum) {
        if (value != null
                && (value.length() > maximum || value.chars().anyMatch(c -> c < 32 || c == 127)))
            throw new SessionException("invalid_resource");
    }
}
