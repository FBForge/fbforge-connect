package org.fitconnect.integration.contract;

import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Immutable native reply payload. The encryption key is resolved from verified receive state. */
public record ReplyInput(
        UUID destinationId,
        UUID submissionId,
        UUID caseId,
        URI schemaUri,
        String mimeType,
        byte[] data,
        List<SubmissionInput.Attachment> attachments,
        SubmissionInput.ProcessMessage processMessage) {
    public ReplyInput {
        if (destinationId == null
                || submissionId == null
                || caseId == null
                || schemaUri == null
                || !schemaUri.isAbsolute()
                || schemaUri.toString().length() > 4096
                || !Set.of("application/json", "application/xml")
                        .contains(mimeType == null ? "" : mimeType)
                || data == null
                || data.length == 0
                || data.length > 32 * 1024 * 1024
                || attachments == null
                || attachments.size() > 39
                || attachments.stream().anyMatch(Objects::isNull)) invalid();
        try (var reader =
                new InputStreamReader(
                        new ByteArrayInputStream(data), StandardCharsets.UTF_8.newDecoder())) {
            char[] buffer = new char[4096];
            while (reader.read(buffer) != -1) {}
        } catch (IOException failure) {
            invalid();
        }
        long total = data.length;
        for (var attachment : attachments) total += attachment.byteLength();
        if (total > 64L * 1024 * 1024) invalid();
        data = data.clone();
        attachments = List.copyOf(attachments);
    }

    @Override
    public byte[] data() {
        return data.clone();
    }

    public int dataLength() {
        return data.length;
    }

    @Override
    public String toString() {
        return "ReplyInput[content omitted]";
    }

    private static void invalid() {
        throw new SessionException("invalid_submission");
    }
}
