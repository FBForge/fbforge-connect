package org.fitconnect.integration.contract;

import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.*;
import java.util.*;
import java.util.UUID;

/** Native-only SDK input. Payloads and paths are never returned through IPC. */
public record SubmissionInput(
        UUID fromDestinationId,
        UUID destinationId,
        String serviceIdentifier,
        String serviceName,
        String region,
        URI schemaUri,
        String mimeType,
        byte[] data,
        List<Attachment> attachments,
        UUID caseId,
        ProcessMessage processMessage,
        ReplyOffer replyOffer) {
    private static final int FILE_LIMIT = 32 * 1024 * 1024;

    public SubmissionInput(
            UUID fromDestinationId,
            UUID destinationId,
            String serviceIdentifier,
            String serviceName,
            String region,
            URI schemaUri,
            String mimeType,
            byte[] data,
            List<Attachment> attachments,
            UUID caseId,
            ProcessMessage processMessage) {
        this(
                fromDestinationId,
                destinationId,
                serviceIdentifier,
                serviceName,
                region,
                schemaUri,
                mimeType,
                data,
                attachments,
                caseId,
                processMessage,
                null);
    }

    public SubmissionInput {
        if (destinationId == null
                || schemaUri == null
                || !schemaUri.isAbsolute()
                || schemaUri.toString().length() > 4096
                || !("application/json".equals(mimeType) || "application/xml".equals(mimeType))
                || data == null
                || data.length == 0
                || data.length > FILE_LIMIT
                || attachments == null
                || attachments.size() > 39) invalid();
        text(serviceIdentifier, 1024, false);
        text(serviceName, 256, false);
        text(region, 128, true);
        // Validate without allocating a char buffer proportional to the entire payload.
        try (var reader =
                new InputStreamReader(
                        new ByteArrayInputStream(data), StandardCharsets.UTF_8.newDecoder())) {
            char[] buffer = new char[4096];
            while (reader.read(buffer) != -1) {}
        } catch (java.io.IOException e) {
            invalid();
        }
        long total = data.length;
        for (Attachment attachment : attachments) {
            if (attachment == null) invalid();
            total += attachment.data.length;
        }
        if (total > 64L * 1024 * 1024) invalid();
        data = data.clone();
        attachments = List.copyOf(attachments);
    }

    @Override
    public byte[] data() {
        return data.clone();
    }

    public long totalBytes() {
        long bytes = data.length;
        for (var attachment : attachments) bytes += attachment.data.length;
        return bytes;
    }

    @Override
    public String toString() {
        return "SubmissionInput[content omitted]";
    }

    public record Attachment(String fileName, String mimeType, String description, byte[] data) {
        public Attachment {
            text(fileName, 255, false);
            text(mimeType, 256, false);
            text(description, 4096, true);
            if (data == null || data.length > FILE_LIMIT) invalid();
            data = data.clone();
        }

        @Override
        public byte[] data() {
            return data.clone();
        }

        public int byteLength() {
            return data.length;
        }

        @Override
        public String toString() {
            return "Attachment[content omitted]";
        }
    }

    public record ProcessMessage(String processModelId, String messageId) {
        public ProcessMessage {
            text(processModelId, 1024, false);
            text(messageId, 1024, false);
        }
    }

    public record ReplyOffer(URI schemaUri, String mimeType, List<ProcessMessage> processMessages) {
        public ReplyOffer(URI schemaUri, String mimeType) {
            this(schemaUri, mimeType, List.of());
        }

        public ReplyOffer {
            if (processMessages == null
                    || processMessages.size() > 16
                    || processMessages.stream().anyMatch(Objects::isNull)
                    || new HashSet<>(processMessages).size() != processMessages.size()
                    || processMessages.stream()
                                    .mapToInt(
                                            message ->
                                                    message.processModelId().length()
                                                            + message.messageId().length())
                                    .sum()
                            > 4096) invalid();
            processMessages = List.copyOf(processMessages);
            if (schemaUri == null
                    || !schemaUri.isAbsolute()
                    || schemaUri.toString().length() > 4096
                    || !("application/json".equals(mimeType) || "application/xml".equals(mimeType)))
                invalid();
        }
    }

    private static void text(String value, int maximum, boolean optional) {
        if (value == null) {
            if (!optional) invalid();
            return;
        }
        if (value.length() > maximum
                || (!optional && value.isBlank())
                || value.chars().anyMatch(c -> c < 32 || c == 127)) invalid();
    }

    private static void invalid() {
        throw new SessionException("invalid_submission");
    }
}
