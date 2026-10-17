package org.fitconnect.integration.contract;

import java.util.*;

/**
 * Public reply pickup identities. Listing is not decryption, verification or receipt acceptance.
 */
public record ReplyPage(int offset, int totalCount, List<Entry> replies) {
    public ReplyPage {
        if (offset < 0
                || offset > 10000
                || totalCount < 0
                || totalCount > 1000000
                || replies == null
                || replies.size() > 100
                || offset + replies.size() > totalCount
                || replies.isEmpty() && offset < totalCount)
            throw new SessionException("invalid_resource");
        var seen = new HashSet<UUID>();
        for (var item : replies)
            if (item == null || !seen.add(item.replyId()))
                throw new SessionException("invalid_resource");
        replies = List.copyOf(replies);
    }

    public record Entry(UUID replyId, UUID caseId) {
        public Entry {
            if (replyId == null || caseId == null) throw new SessionException("invalid_resource");
        }
    }
}
