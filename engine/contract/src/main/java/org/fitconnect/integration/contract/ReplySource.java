package org.fitconnect.integration.contract;

import java.util.Map;
import java.util.UUID;

/**
 * Native read-only reply lease. Compare the SDK-verified event tags before releasing any plaintext.
 */
public interface ReplySource extends ResourceExchange {
    void verifyAuthenticationTags(
            UUID caseId, UUID replyId, String metadata, String data, Map<UUID, String> attachments);
}
