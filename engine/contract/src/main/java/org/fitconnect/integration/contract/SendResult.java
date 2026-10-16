package org.fitconnect.integration.contract;

import java.util.UUID;

/** Public identity only. SDK authentication tags remain in the native adapter. */
public record SendResult(UUID destinationId, UUID fromDestinationId, UUID submissionId, UUID caseId) {}
