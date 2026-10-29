package org.fitconnect.integration.contract;

import java.util.UUID;

/** Bounded identification only. Infected bytes never belong to a released snapshot. */
public record BlockedAttachment(UUID attachmentId, String fileName) {
    public BlockedAttachment {
        if (attachmentId == null
                || fileName == null
                || fileName.length() > 128
                || fileName.chars().anyMatch(c -> c < 32 || c == 127))
            throw new SessionException("invalid_resource");
    }

    public static BlockedAttachment from(ReceivedContent.Attachment attachment) {
        String name = attachment.fileName() == null ? "Anlage" : attachment.fileName();
        int end = Math.min(128, name.length());
        if (end < name.length()
                && Character.isHighSurrogate(name.charAt(end - 1))
                && Character.isLowSurrogate(name.charAt(end))) end--;
        return new BlockedAttachment(attachment.id(), name.substring(0, end));
    }
}
