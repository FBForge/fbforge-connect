package org.fitconnect.integration.host;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import java.net.URI;
import java.util.*;

/** Renderer data contains only session-bound content IDs, never native paths or inline files. */
final class SubmissionDraft {
    record FileSummary(String fileName, String mimeType, String description, int bytes) {}
    record ReplySummary(String schemaUri, String mimeType) {}
    record Summary(String destinationId, String fromDestinationId, String serviceIdentifier, String serviceName,
                   String region, String schemaUri, String mimeType, String caseId,
                   SubmissionInput.ProcessMessage processMessage, ReplySummary replyOffer, int dataBytes, List<FileSummary> attachments) {}
    record Resolved(SubmissionInput input, Summary summary) {}

    static Resolved resolve(String document, ContentStore content, String owner, long availableBytes) {
        try {
            JsonObject value = StrictJson.object(document, 24 * 1024);
            // Older drafts omit the optional offer. The confirmation always includes its explicit value.
            if (!value.has("replyOffer")) value.add("replyOffer", JsonNull.INSTANCE);
            exact(value, "destinationId", "fromDestinationId", "serviceIdentifier", "serviceName", "region", "schemaUri",
                    "mimeType", "caseId", "processMessage", "replyOffer", "contentId", "attachments");
            String target = DestinationAccess.id(text(value, "destinationId", false));
            String from = text(value, "fromDestinationId", true), caseId = text(value, "caseId", true);
            if (from != null) from = DestinationAccess.id(from);
            if (caseId != null) caseId = DestinationAccess.id(caseId);
            var process = value.get("processMessage");
            SubmissionInput.ProcessMessage message = null;
            if (!process.isJsonNull()) {
                var item = process.getAsJsonObject(); exact(item, "processModelId", "messageId");
                message = new SubmissionInput.ProcessMessage(text(item, "processModelId", false), text(item, "messageId", false));
            }
            SubmissionInput.ReplyOffer reply = null;
            if (!value.get("replyOffer").isJsonNull()) {
                var item = value.getAsJsonObject("replyOffer"); exact(item, "schemaUri", "mimeType");
                reply = new SubmissionInput.ReplyOffer(URI.create(text(item, "schemaUri", false)), text(item, "mimeType", false));
            }
            var attached = value.getAsJsonArray("attachments");
            if (attached.size() > 39) throw new IllegalArgumentException();
            var inputs = new ArrayList<SubmissionInput.Attachment>();
            var summaries = new ArrayList<FileSummary>();
            var seen = new HashSet<String>();
            String dataId = DestinationAccess.id(text(value, "contentId", false)); seen.add(dataId);
            var contentIds = new ArrayList<String>();
            long total = content.length(owner, dataId);
            for (var entry : attached) {
                var item = entry.getAsJsonObject(); exact(item, "contentId", "fileName", "mimeType", "description");
                String id = DestinationAccess.id(text(item, "contentId", false));
                if (!seen.add(id)) throw new IllegalArgumentException();
                contentIds.add(id);
                total += content.length(owner, id);
            }
            // Reserve against all native prepared snapshots before allocating any file-sized array.
            if (total > availableBytes) throw new SessionException("content_limit");
            byte[] data = content.read(owner, dataId);
            for (int index = 0; index < attached.size(); index++) {
                var item = attached.get(index).getAsJsonObject();
                byte[] bytes = content.read(owner, contentIds.get(index));
                String name = text(item, "fileName", false), mime = text(item, "mimeType", false), description = text(item, "description", true);
                inputs.add(new SubmissionInput.Attachment(name, mime, description, bytes));
                summaries.add(new FileSummary(name, mime, description, bytes.length));
            }
            String service = text(value, "serviceIdentifier", false), name = text(value, "serviceName", false), region = text(value, "region", true),
                    schema = text(value, "schemaUri", false), mime = text(value, "mimeType", false);
            var input = new SubmissionInput(from == null ? null : UUID.fromString(from), UUID.fromString(target), service,
                    name, region, URI.create(schema), mime, data, inputs, caseId == null ? null : UUID.fromString(caseId), message, reply);
            return new Resolved(input, new Summary(target, from, service, name, region, schema, mime, caseId, message,
                    reply == null ? null : new ReplySummary(reply.schemaUri().toString(), reply.mimeType()),
                    data.length, List.copyOf(summaries)));
        } catch (SessionException e) { throw e;
        } catch (Exception e) { throw new SessionException("invalid_submission"); }
    }
    private static void exact(JsonObject value, String... fields) {
        if (!value.keySet().equals(Set.of(fields))) throw new SessionException("invalid_submission");
    }
    private static String text(JsonObject value, String name, boolean nullable) {
        var entry = value.get(name);
        if (entry == null) throw new SessionException("invalid_submission");
        if (nullable && entry.isJsonNull()) return null;
        if (!entry.isJsonPrimitive() || !entry.getAsJsonPrimitive().isString()) throw new SessionException("invalid_submission");
        return entry.getAsString();
    }
}
