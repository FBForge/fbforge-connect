package org.fitconnect.integration.contract;

import java.util.*;

/** Public native bookkeeping only. The ephemeral private key remains inside its SDK adapter. */
public record ReplyChannelReference(
        UUID attemptId,
        UUID destinationId,
        UUID fromDestinationId,
        UUID caseId,
        UUID submissionId,
        String keyId,
        String status) {
    public ReplyChannelReference {
        if (attemptId == null
                || destinationId == null
                || !Objects.equals(keyId, "reply-key:" + attemptId)
                || status == null
                || !Set.of("pending", "bound", "unresolved", "recovered").contains(status)
                || (status.equals("bound")
                        ? caseId == null || submissionId == null
                        : status.equals("recovered")
                                ? caseId == null || submissionId != null
                                : caseId != null || submissionId != null))
            throw new SessionException("invalid_resource");
    }
}
