package org.fitconnect.integration.contract;

import java.util.*;

/** Native SDK output, never a renderer response. Content is released only after successful SDK checks. */
public record ReceivedContent(UUID destinationId, UUID submissionId, UUID caseId, byte[] metadata, byte[] data,
        String mimeType, List<Attachment> attachments, List<Issue> issues) {
    public ReceivedContent {
        if (destinationId == null || submissionId == null || caseId == null || metadata == null || metadata.length > 2 * 1024 * 1024
                || data == null || data.length > 32 * 1024 * 1024 || mimeType == null || mimeType.isBlank() || mimeType.length() > 256
                || attachments == null || attachments.size() > 39 || issues == null || issues.size() > 512) invalid();
        text(mimeType, 256);
        if (issues.stream().anyMatch(issue -> issue == null || issue.error())) invalid();
        long total = metadata.length + data.length;
        var ids = new HashSet<UUID>();
        for (var item : attachments) {
            if (item == null || !ids.add(item.id())) invalid();
            total += item.bytes.length;
        }
        if (total > 64L * 1024 * 1024) invalid();
        metadata = metadata.clone(); data = data.clone(); attachments = List.copyOf(attachments); issues = List.copyOf(issues);
    }
    @Override public byte[] metadata() { return metadata.clone(); }
    @Override public byte[] data() { return data.clone(); }
    public int partCount() { return 2 + attachments.size(); }
    public int partLength(int index) { return partBytes(index).length; }
    /** Copies only the requested range, without duplicating a whole attachment for each IPC chunk. */
    public byte[] readPart(int index, int offset, int maximum) {
        var bytes = partBytes(index);
        if (offset < 0 || offset > bytes.length || maximum < 1 || maximum > 24 * 1024) invalid();
        return Arrays.copyOfRange(bytes, offset, offset + Math.min(maximum, bytes.length - offset));
    }
    private byte[] partBytes(int index) {
        if (index < 0 || index >= partCount()) invalid();
        if (index == 0) return metadata;
        if (index == 1) return data;
        return attachments.get(index - 2).bytes;
    }
    @Override public String toString() { return "ReceivedContent[content omitted]"; }
    public record Attachment(UUID id, String fileName, String mimeType, String description, byte[] bytes) {
        public Attachment {
            if (id == null || bytes == null || bytes.length > 32 * 1024 * 1024) invalid();
            text(fileName, 1024); text(mimeType, 256); text(description, 4096);
            if (fileName != null) ReceiveFileNames.check(fileName);
            bytes = bytes.clone();
        }
        @Override public byte[] bytes() { return bytes.clone(); }
        public int byteLength() { return bytes.length; }
        public byte[] read(int offset, int maximum) {
            if (offset < 0 || offset > bytes.length || maximum < 1 || maximum > 24 * 1024) invalid();
            return Arrays.copyOfRange(bytes, offset, offset + Math.min(maximum, bytes.length - offset));
        }
        @Override public String toString() { return "ReceivedAttachment[content omitted]"; }
    }
    /** Stable stage/severity only. SDK messages may embed payloads or arbitrary server text. */
    public record Issue(String stage, boolean error) {
        public Issue { if (stage == null || !stage.matches("[A-Z_]{1,64}")) invalid(); }
    }
    private static void text(String value, int maximum) {
        if (value != null && (value.length() > maximum || value.chars().anyMatch(c -> c < 32 || c == 127))) invalid();
    }
    private static void invalid() { throw new SessionException("invalid_resource"); }
}
