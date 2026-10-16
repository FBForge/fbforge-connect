package org.fitconnect.integration.contract;

import java.nio.charset.StandardCharsets;

/** SDK-serialized native operation held behind a one-shot host confirmation. Never returned to the renderer. */
public record PreparedReplyReceipt(ReplyReceiptRequest request, String body, ReplyReceiptEvidence evidence) {
    public PreparedReplyReceipt {
        if (request == null || body == null || body.length() > 65536 || body.getBytes(StandardCharsets.UTF_8).length > 65536 || !body.startsWith("{"))
            throw new SessionException("invalid_input");
        if (request.action().equals("accept") ? evidence == null || !request.replyId().equals(evidence.replyId()) || !request.caseId().equals(evidence.caseId()) : evidence != null)
            throw new SessionException("verification_failed");
    }
    @Override public String toString() { return "PreparedReplyReceipt[request body omitted]"; }
}
