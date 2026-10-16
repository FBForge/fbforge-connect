package org.fitconnect.integration.contract;

import java.time.Instant;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** SDK-verified transmission events. This does not verify downloaded content or compare its GCM tags. */
public record VerifiedEventLog(UUID destinationId, UUID caseId, UUID submissionId, List<Entry> entries, List<String> warnings, UUID replyId) {
    public record Entry(UUID eventId, String eventType, String issuer, Instant issuedAt, String headerJson, String claimsJson) {
        public Entry {
            if (eventId == null || issuedAt == null || eventType == null || !eventType.startsWith("https://schema.fitko.de/fit-connect/events/")
                    || eventType.length() > 256 || issuer == null || issuer.isBlank() || issuer.length() > 1024
                    || issuer.chars().anyMatch(c -> c < 32 || c == 127) || headerJson == null || claimsJson == null
                    || headerJson.getBytes(StandardCharsets.UTF_8).length > 16384 || claimsJson.getBytes(StandardCharsets.UTF_8).length > 65536)
                throw new SessionException("verification_failed");
        }
    }
    public VerifiedEventLog(UUID destination, UUID caseId, UUID submission, List<Entry> entries, List<String> warnings) {
        this(destination, caseId, submission, entries, warnings, null);
    }
    public static VerifiedEventLog reply(UUID caseId, UUID replyId, List<Entry> entries) {
        return new VerifiedEventLog(null, caseId, null, entries, List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"), replyId);
    }
    public VerifiedEventLog(UUID destination, UUID caseId, UUID submission, List<Entry> entries) {
        this(destination, caseId, submission, entries, List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"));
    }
    public VerifiedEventLog {
        if (caseId == null || (submissionId == null) == (replyId == null) || (replyId == null ? destinationId == null : destinationId != null) || entries == null || entries.isEmpty() || entries.size() > 1000
                || !List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED").equals(warnings)) throw new SessionException("verification_failed");
        var ids = new HashSet<UUID>(); long bytes = 0;
        for (var entry : entries) {
            if (entry == null || !entry.eventType().endsWith(replyId == null ? "-submission" : "-reply") || !ids.add(entry.eventId())) throw new SessionException("verification_failed");
            bytes += entry.headerJson().getBytes(StandardCharsets.UTF_8).length + entry.claimsJson().getBytes(StandardCharsets.UTF_8).length;
        }
        if (bytes > 16L * 1024 * 1024) throw new SessionException("content_limit");
        entries = List.copyOf(entries); warnings = List.copyOf(warnings);
    }
}
