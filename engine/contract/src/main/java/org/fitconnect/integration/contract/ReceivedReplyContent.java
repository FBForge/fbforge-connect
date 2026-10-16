package org.fitconnect.integration.contract;

import java.util.*;

/** Native verified reply payload. Deliberately distinct from submission receipt evidence. */
public record ReceivedReplyContent(UUID replyId, UUID caseId, UUID senderDestinationId, UUID channelAttemptId,
        byte[] metadata, byte[] data, String mimeType, List<ReceivedContent.Attachment> attachments, List<ReceivedContent.Issue> issues, ReplyReceiptEvidence evidence, SchemaSnapshot schemaSnapshot) {
    public ReceivedReplyContent(UUID replyId, UUID caseId, UUID senderDestinationId, UUID channelAttemptId,
            byte[] metadata, byte[] data, String mimeType, List<ReceivedContent.Attachment> attachments, List<ReceivedContent.Issue> issues, ReplyReceiptEvidence evidence) {
        this(replyId, caseId, senderDestinationId, channelAttemptId, metadata, data, mimeType, attachments, issues, evidence, null);
    }
    public ReceivedReplyContent {
        if (replyId == null || caseId == null || channelAttemptId == null || metadata == null || metadata.length > 2 * 1024 * 1024
                || evidence == null || !replyId.equals(evidence.replyId()) || !caseId.equals(evidence.caseId()) || !channelAttemptId.equals(evidence.channelAttemptId())
                || data == null || data.length > 32 * 1024 * 1024 || mimeType == null
                || !Set.of("application/json", "application/xml").contains(mimeType)
                || attachments == null || attachments.size() > 39 || issues == null || issues.size() > 512
                || issues.stream().anyMatch(issue -> issue == null || issue.error())) invalid();
        long total = metadata.length + data.length;
        var ids = new HashSet<UUID>();
        for (var item : attachments) {
            if (item == null || !ids.add(item.id())) invalid();
            total += item.byteLength();
        }
        if (total > 64L * 1024 * 1024) invalid();
        metadata = metadata.clone(); data = data.clone(); attachments = List.copyOf(attachments); issues = List.copyOf(issues);
    }
    @Override public byte[] metadata() { return metadata.clone(); }
    @Override public byte[] data() { return data.clone(); }
    public int partCount() { return 2 + attachments.size(); }
    public int partLength(int index) {
        if (index < 0 || index >= partCount()) invalid();
        return index == 0 ? metadata.length : index == 1 ? data.length : attachments.get(index - 2).byteLength();
    }
    public byte[] readPart(int index, int offset, int maximum) {
        int length = partLength(index);
        if (offset < 0 || offset > length || maximum < 1 || maximum > 24 * 1024) invalid();
        if (index > 1) return attachments.get(index - 2).read(offset, maximum);
        byte[] value = index == 0 ? metadata : data;
        return Arrays.copyOfRange(value, offset, offset + Math.min(maximum, length - offset));
    }
    @Override public String toString() { return "ReceivedReplyContent[content omitted]"; }
    private static void invalid() { throw new SessionException("invalid_resource"); }
}
