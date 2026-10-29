package org.fitconnect.integration.host;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Released report contains file identities, never the blocked file or raw scanner output. */
final class ScanFindings {
    static List<BlockedAttachment> blocked(List<ReceivedContent.Issue> issues) {
        return issues.stream().flatMap(issue -> issue.blockedAttachments().stream()).toList();
    }

    static byte[] document(List<ReceivedContent.Issue> issues) {
        var blocked = blocked(issues);
        return blocked.isEmpty()
                ? null
                : new com.google.gson.Gson()
                        .toJson(Map.of("version", 1, "blockedAttachments", blocked))
                        .getBytes(StandardCharsets.UTF_8);
    }

    private ScanFindings() {}
}
