package org.fitconnect.integration.host;

import org.fitconnect.integration.contract.*;
import java.util.*;
import org.fitconnect.integration.host.ReceiveStore.Part;
import org.fitconnect.integration.host.ReceiveStore.Page;
import org.fitconnect.integration.host.ReceiveStore.Chunk;

/** Native reply snapshot, separate from all submission receipt proofs. */
final class ReplyReceiveStore {
    // JSON escaping can require six bytes per description character. Two worst-case entries fit one frame.
    private static final int PAGE_SIZE = 2;
    private Stored current;

    record Summary(String proofId, String replyId, String caseId, String channelAttemptId, String senderDestinationId,
            int partCount, int warningCount, List<String> warnings) {}
    private record Stored(ApiVersion api, String session, ReceivedReplyContent content, Summary summary, List<Part> parts, SchemaPages schema) {}

    synchronized Summary publish(ApiVersion api, String session, UUID caseId, UUID replyId, ReceivedReplyContent content) {
        clear();
        if (api == null || !uuid(session) || content == null || !content.caseId().equals(caseId)
                || !content.replyId().equals(replyId)) throw invalid();
        var parts = new ArrayList<Part>();
        parts.add(part(content, 0, "metadata", null, "metadata.json", "application/json", null));
        String suffix = switch (content.mimeType()) {
            case "application/json" -> ".json";
            case "application/xml", "text/xml" -> ".xml";
            default -> ".bin";
        };
        parts.add(part(content, 1, "data", null, "fachdaten" + suffix, content.mimeType(), null));
        for (int i = 0; i < content.attachments().size(); i++) {
            var item = content.attachments().get(i);
            parts.add(part(content, i + 2, "attachment", item.id().toString(), item.fileName(), item.mimeType(), item.description()));
        }
        var summary = new Summary(UUID.randomUUID().toString(), replyId.toString(), caseId.toString(),
                content.channelAttemptId().toString(), content.senderDestinationId() == null ? null : content.senderDestinationId().toString(), content.partCount(), content.issues().size(),
                content.issues().stream().map(ReceivedContent.Issue::stage).distinct().limit(16).toList());
        current = new Stored(api, session, content, summary, List.copyOf(parts), new SchemaPages(content.schemaSnapshot()));
        return summary;
    }

    synchronized SchemaPages.Page schema(ApiVersion api, String session, String proofId, int offset) {
        return require(api, session, proofId).schema().read(proofId, offset);
    }

    synchronized Summary state(ApiVersion api, String session, String proofId) { return require(api, session, proofId).summary(); }

    synchronized Page parts(ApiVersion api, String session, String proofId, int offset) {
        var value = require(api, session, proofId);
        if (offset < 0 || offset > value.parts().size() || offset % PAGE_SIZE != 0) throw invalid();
        return new Page(proofId, offset, value.parts().size(),
                List.copyOf(value.parts().subList(offset, Math.min(offset + PAGE_SIZE, value.parts().size()))));
    }

    synchronized Chunk read(ApiVersion api, String session, String proofId, String contentId, int offset) {
        var value = require(api, session, proofId);
        for (int i = 0; i < value.parts().size(); i++) {
            var part = value.parts().get(i);
            if (!part.contentId().equals(contentId)) continue;
            byte[] bytes = value.content().readPart(i, offset, ContentStore.CHUNK_BYTES);
            return new Chunk(proofId, contentId, offset, part.totalBytes(), Base64.getEncoder().encodeToString(bytes),
                    offset + bytes.length == part.totalBytes());
        }
        throw invalid();
    }

    synchronized void discard(ApiVersion api, String session, String proofId) {
        require(api, session, proofId);
        clear();
    }
    synchronized void clearOwner(String session) {
        if (current != null && current.session().equals(session)) clear();
    }
    synchronized void clear() { if (current != null) current.schema().close(); current = null; }

    private Stored require(ApiVersion api, String session, String proofId) {
        if (current == null || current.api() != api || !current.session().equals(session)
                || !current.summary().proofId().equals(proofId)) throw invalid();
        return current;
    }
    private static Part part(ReceivedReplyContent content, int index, String kind, String id, String name, String mime, String description) {
        return new Part(UUID.randomUUID().toString(), kind, id, name, mime, description, content.partLength(index));
    }
    private static boolean uuid(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException e) { return false; }
    }
    private static SessionException invalid() { return new SessionException("invalid_resource"); }
}
