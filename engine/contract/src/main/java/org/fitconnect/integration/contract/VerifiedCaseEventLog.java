package org.fitconnect.integration.contract;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** Complete SDK-verified events visible to the current client for one case, possibly multiple subjects. */
public record VerifiedCaseEventLog(UUID caseId, List<Entry> entries) {
    public record Entry(String subjectType, UUID subjectId, VerifiedEventLog.Entry event) {
        public Entry {
            if (!Set.of("submission", "reply", "case").contains(subjectType) || subjectId == null || event == null
                    || !event.eventType().endsWith("-" + subjectType)) throw invalid();
        }
    }
    public VerifiedCaseEventLog {
        if (caseId == null || entries == null || entries.size() > 1000) throw invalid();
        var ids = new HashSet<UUID>(); long bytes = 0;
        for (var entry : entries) {
            if (entry == null || !ids.add(entry.event().eventId())
                    || entry.subjectType().equals("case") && !entry.subjectId().equals(caseId)) throw invalid();
            bytes += entry.event().headerJson().getBytes(StandardCharsets.UTF_8).length
                    + entry.event().claimsJson().getBytes(StandardCharsets.UTF_8).length;
        }
        if (bytes > 16L * 1024 * 1024) throw new SessionException("content_limit");
        entries = List.copyOf(entries);
    }
    private static SessionException invalid() { return new SessionException("verification_failed"); }
}
