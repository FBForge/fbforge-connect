package org.fitconnect.integration.contract;

import java.net.URI;
import java.util.*;

/** Native-only verified reply-channel context. Never serialize this record through IPC. */
public record ReplyRecipient(UUID destinationId, UUID submissionId, UUID caseId, UUID replyDestinationId,
        String publicJwk, List<Schema> schemas) {
    public ReplyRecipient {
        if (destinationId == null || submissionId == null || caseId == null || publicJwk == null
                || publicJwk.length() > 32768 || schemas == null || schemas.isEmpty() || schemas.size() > 64
                || schemas.stream().anyMatch(Objects::isNull)) throw new SessionException("verification_failed");
        schemas = List.copyOf(schemas);
    }
    public void check(ReplyInput input) {
        if (input == null || !destinationId.equals(input.destinationId()) || !submissionId.equals(input.submissionId())
                || !caseId.equals(input.caseId()) || schemas.stream().noneMatch(schema -> schema.schemaUri().equals(input.schemaUri())
                && (schema.mimeType() == null || schema.mimeType().equals(input.mimeType()))))
            throw new SessionException("invalid_submission");
    }
    public record Schema(URI schemaUri, String mimeType) {
        public Schema {
            if (schemaUri == null || !schemaUri.isAbsolute() || schemaUri.toString().length() > 4096
                    || mimeType != null && !Set.of("application/json", "application/xml").contains(mimeType))
                throw new SessionException("verification_failed");
        }
    }
    @Override public String toString() { return "ReplyRecipient[verified native channel omitted]"; }
}
