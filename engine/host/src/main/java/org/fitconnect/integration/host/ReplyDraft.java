package org.fitconnect.integration.host;

import com.google.gson.*;
import java.net.URI;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Reply identity and encryption context come from the native proof, not renderer-entered IDs/keys.
 */
final class ReplyDraft {
    record Summary(
            String proofId,
            String destinationId,
            String submissionId,
            String caseId,
            String schemaId,
            String schemaUri,
            String mimeType,
            SubmissionInput.ProcessMessage processMessage,
            int dataBytes,
            List<SubmissionDraft.FileSummary> attachments) {}

    record Resolved(ReplyInput input, Summary summary) {}

    static String proofId(String document) {
        return DestinationAccess.id(text(StrictJson.object(document, 24 * 1024), "proofId", false));
    }

    static Resolved resolve(
            String document,
            ReceiveStore.Summary proof,
            ContentStore content,
            String owner,
            long availableBytes) {
        try {
            var root = StrictJson.object(document, 24 * 1024);
            exact(
                    root,
                    "proofId",
                    "schemaId",
                    "schemaUri",
                    "mimeType",
                    "processMessage",
                    "contentId",
                    "attachments");
            if (!proof.proofId().equals(text(root, "proofId", false)))
                throw new SessionException("verification_failed");
            var process = root.get("processMessage");
            SubmissionInput.ProcessMessage message = null;
            if (!process.isJsonNull()) {
                var item = process.getAsJsonObject();
                exact(item, "processModelId", "messageId");
                message =
                        new SubmissionInput.ProcessMessage(
                                text(item, "processModelId", false),
                                text(item, "messageId", false));
            }
            String schemaId = DestinationAccess.id(text(root, "schemaId", false));
            String schema = text(root, "schemaUri", false), mime = text(root, "mimeType", false);
            URI schemaValue = URI.create(schema);
            if (!schemaValue.isAbsolute()
                    || schema.length() > 4096
                    || !Set.of("application/json", "application/xml").contains(mime))
                throw new SessionException("invalid_submission");
            var attached = root.getAsJsonArray("attachments");
            if (attached.size() > 39) throw new SessionException("invalid_submission");
            String dataId = DestinationAccess.id(text(root, "contentId", false));
            var seen = new HashSet<String>();
            seen.add(dataId);
            var handles = new ArrayList<String>();
            long total = content.length(owner, dataId);
            for (var entry : attached) {
                var item = entry.getAsJsonObject();
                exact(item, "contentId", "fileName", "mimeType", "description");
                String id = DestinationAccess.id(text(item, "contentId", false));
                if (!seen.add(id)) throw new SessionException("invalid_submission");
                handles.add(id);
                total += content.length(owner, id);
            }
            if (total > availableBytes) throw new SessionException("content_limit");
            byte[] data = content.read(owner, dataId);
            var inputs = new ArrayList<SubmissionInput.Attachment>();
            var files = new ArrayList<SubmissionDraft.FileSummary>();
            for (int index = 0; index < attached.size(); index++) {
                var item = attached.get(index).getAsJsonObject();
                byte[] bytes = content.read(owner, handles.get(index));
                String name = text(item, "fileName", false),
                        fileMime = text(item, "mimeType", false),
                        description = text(item, "description", true);
                inputs.add(new SubmissionInput.Attachment(name, fileMime, description, bytes));
                files.add(
                        new SubmissionDraft.FileSummary(name, fileMime, description, bytes.length));
            }
            var input =
                    new ReplyInput(
                            UUID.fromString(proof.destinationId()),
                            UUID.fromString(proof.submissionId()),
                            UUID.fromString(proof.caseId()),
                            schemaValue,
                            mime,
                            data,
                            inputs,
                            message);
            return new Resolved(
                    input,
                    new Summary(
                            proof.proofId(),
                            proof.destinationId(),
                            proof.submissionId(),
                            proof.caseId(),
                            schemaId,
                            schema,
                            mime,
                            message,
                            data.length,
                            List.copyOf(files)));
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_submission");
        }
    }

    private static void exact(JsonObject object, String... fields) {
        if (!object.keySet().equals(Set.of(fields)))
            throw new SessionException("invalid_submission");
    }

    private static String text(JsonObject object, String key, boolean nullable) {
        var value = object.get(key);
        if (nullable && value != null && value.isJsonNull()) return null;
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw new SessionException("invalid_submission");
        return value.getAsString();
    }
}
