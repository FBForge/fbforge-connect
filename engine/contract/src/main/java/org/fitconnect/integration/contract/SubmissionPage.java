package org.fitconnect.integration.contract;

import java.util.*;

/** Public pickup identities only. Ciphertext and SDK objects never cross this boundary. */
public record SubmissionPage(int offset, int totalCount, List<Entry> submissions) {
    public SubmissionPage {
        if (offset < 0
                || offset > 10000
                || totalCount < 0
                || totalCount > 1000000
                || submissions == null
                || submissions.size() > 100
                || offset + submissions.size() > totalCount
                || (submissions.isEmpty() && offset < totalCount))
            throw new SessionException("invalid_resource");
        var seen = new HashSet<UUID>();
        for (var item : submissions)
            if (item == null || !seen.add(item.submissionId()))
                throw new SessionException("invalid_resource");
        submissions = List.copyOf(submissions);
    }

    public record Entry(UUID destinationId, UUID submissionId, UUID caseId) {
        public Entry {
            if (destinationId == null || submissionId == null)
                throw new SessionException("invalid_resource");
        }
    }
}
