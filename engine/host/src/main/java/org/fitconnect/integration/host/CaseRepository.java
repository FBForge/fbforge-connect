package org.fitconnect.integration.host;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Read-only local copies. No proofs, key material, SDK state or write permissions are retained. */
final class CaseRepository implements AutoCloseable {
    static final long MAX_BYTES = 128L * 1024 * 1024;
    static final int MAX_RECORDS = 100;

    record Summary(
            String recordId,
            String revision,
            String kind,
            String direction,
            String title,
            String createdAt,
            String status,
            String caseId,
            String submissionId,
            String replyId,
            String destinationId,
            int attachmentCount,
            long totalBytes,
            List<String> warnings) {}

    record Part(
            String contentId,
            String kind,
            String fileName,
            String mimeType,
            String description,
            int totalBytes) {}

    record Page(String recordId, int offset, int total, List<Part> parts) {}

    record Chunk(
            String recordId,
            String contentId,
            int byteOffset,
            int totalBytes,
            String chunk,
            boolean complete) {}

    private record File(Part part, byte[] bytes) {}

    private record Item(String scope, Summary summary, List<File> files) {}

    private final LinkedHashMap<String, Item> records = new LinkedHashMap<>();
    private long bytes;

    void capacity(long length) {
        capacity(length, null);
    }

    private void capacity(long length, String replacement) {
        var old = replacement == null ? null : records.get(replacement);
        if (length < 0
                || bytes - (old == null ? 0 : old.summary().totalBytes()) + length > MAX_BYTES
                || records.size() - (old == null ? 0 : 1) >= MAX_RECORDS)
            throw new SessionException("content_limit");
    }

    private static String id(Object value) {
        return value == null ? null : value.toString();
    }

    private static File file(
            String kind, String name, String mime, String description, byte[] data) {
        return new File(
                new Part(UUID.randomUUID().toString(), kind, name, mime, description, data.length),
                data);
    }

    private static String dataName(String mime) {
        return "fachdaten" + ("application/json".equals(mime) ? ".json" : ".xml");
    }

    private static void schema(List<File> files, SchemaSnapshot schema) {
        if (schema != null && schema.document() != null)
            files.add(
                    file(
                            "schema",
                            schema.schemaUri(),
                            "text/plain",
                            null,
                            schema.document().getBytes(StandardCharsets.UTF_8)));
    }

    void notice(String scope, SubmissionInfo info) {
        if (find(scope, "submission", "received", info.submissionId().toString()) != null) return;
        byte[] transport = new com.google.gson.Gson().toJson(info).getBytes(StandardCharsets.UTF_8);
        capacity(transport.length);
        add(
                scope,
                "submission",
                "received",
                info.serviceName() == null
                        ? "Abgerufene Einreichung"
                        : info.serviceName()
                                .substring(0, Math.min(256, info.serviceName().length())),
                "unverified",
                info.caseId().toString(),
                info.submissionId().toString(),
                null,
                info.destinationId().toString(),
                List.of(),
                List.of(file("metadata", "transport.json", "application/json", null, transport)));
    }

    void noticeReply(String scope, UUID caseId, UUID replyId) {
        if (find(scope, "reply", "received", replyId.toString()) != null) return;
        byte[] transport =
                ("{\"caseId\":\"" + caseId + "\",\"replyId\":\"" + replyId + "\"}")
                        .getBytes(StandardCharsets.UTF_8);
        capacity(transport.length);
        add(
                scope,
                "reply",
                "received",
                "Abgerufene Antwort",
                "unverified",
                caseId.toString(),
                null,
                replyId.toString(),
                null,
                List.of(),
                List.of(file("metadata", "transport.json", "application/json", null, transport)));
    }

    String receive(String scope, ReceivedContent data) {
        String existing = find(scope, "submission", "received", id(data.submissionId()));
        if (existing != null && !records.get(existing).summary().status().equals("unverified"))
            return existing;
        capacity(
                data.partLength(0)
                        + (long) data.partLength(1)
                        + data.attachments().stream()
                                .mapToLong(ReceivedContent.Attachment::byteLength)
                                .sum()
                        + (data.schemaSnapshot() != null && data.schemaSnapshot().document() != null
                                ? data.schemaSnapshot()
                                        .document()
                                        .getBytes(StandardCharsets.UTF_8)
                                        .length
                                : 0),
                existing);
        var files = new ArrayList<File>();
        files.add(file("metadata", "metadata.json", "application/json", null, data.metadata()));
        files.add(file("data", dataName(data.mimeType()), data.mimeType(), null, data.data()));
        for (var a : data.attachments())
            files.add(file("attachment", a.fileName(), a.mimeType(), a.description(), a.bytes()));
        schema(files, data.schemaSnapshot());
        return add(
                scope,
                "submission",
                "received",
                title(data.metadata(), "Empfangene Einreichung"),
                "verified",
                id(data.caseId()),
                id(data.submissionId()),
                null,
                id(data.destinationId()),
                data.issues().stream()
                        .map(ReceivedContent.Issue::stage)
                        .distinct()
                        .limit(16)
                        .toList(),
                files);
    }

    String receive(String scope, ReceivedReplyContent data) {
        String existing = find(scope, "reply", "received", id(data.replyId()));
        if (existing != null && !records.get(existing).summary().status().equals("unverified"))
            return existing;
        capacity(
                data.partLength(0)
                        + (long) data.partLength(1)
                        + data.attachments().stream()
                                .mapToLong(ReceivedContent.Attachment::byteLength)
                                .sum()
                        + (data.schemaSnapshot() != null && data.schemaSnapshot().document() != null
                                ? data.schemaSnapshot()
                                        .document()
                                        .getBytes(StandardCharsets.UTF_8)
                                        .length
                                : 0),
                existing);
        var files = new ArrayList<File>();
        files.add(file("metadata", "metadata.json", "application/json", null, data.metadata()));
        files.add(file("data", dataName(data.mimeType()), data.mimeType(), null, data.data()));
        for (var a : data.attachments())
            files.add(file("attachment", a.fileName(), a.mimeType(), a.description(), a.bytes()));
        schema(files, data.schemaSnapshot());
        return add(
                scope,
                "reply",
                "received",
                title(data.metadata(), "Empfangene Antwort"),
                "verified",
                id(data.caseId()),
                null,
                id(data.replyId()),
                id(data.senderDestinationId()),
                data.issues().stream()
                        .map(ReceivedContent.Issue::stage)
                        .distinct()
                        .limit(16)
                        .toList(),
                files);
    }

    String outgoing(String scope, SubmissionInput input) {
        capacity(input.totalBytes());
        return add(
                scope,
                "submission",
                "sent",
                input.serviceName(),
                "prepared",
                id(input.caseId()),
                null,
                null,
                id(input.destinationId()),
                List.of(),
                files(input.data(), input.mimeType(), input.attachments()));
    }

    String outgoing(String scope, ReplyInput input) {
        capacity(
                input.dataLength()
                        + input.attachments().stream()
                                .mapToLong(SubmissionInput.Attachment::byteLength)
                                .sum());
        return add(
                scope,
                "reply",
                "sent",
                "Antwort auf Einreichung",
                "prepared",
                id(input.caseId()),
                id(input.submissionId()),
                null,
                id(input.destinationId()),
                List.of(),
                files(input.data(), input.mimeType(), input.attachments()));
    }

    private static List<File> files(
            byte[] data, String mime, List<SubmissionInput.Attachment> attachments) {
        var files = new ArrayList<File>();
        files.add(file("data", dataName(mime), mime, null, data));
        for (var a : attachments)
            files.add(file("attachment", a.fileName(), a.mimeType(), a.description(), a.data()));
        return files;
    }

    private String add(
            String scope,
            String kind,
            String direction,
            String title,
            String status,
            String caseId,
            String submissionId,
            String replyId,
            String destinationId,
            List<String> warnings,
            List<File> files) {
        long length = files.stream().mapToLong(f -> f.bytes().length).sum();
        String previous =
                direction.equals("received")
                        ? find(
                                scope,
                                kind,
                                direction,
                                kind.equals("reply") ? replyId : submissionId)
                        : null;
        String createdAt =
                previous == null
                        ? Instant.now().toString()
                        : records.get(previous).summary().createdAt();
        String recordId = previous == null ? UUID.randomUUID().toString() : previous;
        if (previous != null) delete(scope, previous);
        var summary =
                new Summary(
                        recordId,
                        UUID.randomUUID().toString(),
                        kind,
                        direction,
                        title,
                        createdAt,
                        status,
                        caseId,
                        submissionId,
                        replyId,
                        destinationId,
                        (int)
                                files.stream()
                                        .filter(f -> f.part().kind().equals("attachment"))
                                        .count(),
                        length,
                        warnings);
        records.put(recordId, new Item(scope, summary, List.copyOf(files)));
        bytes += length;
        return recordId;
    }

    void outcome(
            String recordId, String status, String caseId, String submissionId, String replyId) {
        var item = records.get(recordId);
        if (item == null) return;
        var s = item.summary();
        records.put(
                recordId,
                new Item(
                        item.scope(),
                        new Summary(
                                s.recordId(),
                                UUID.randomUUID().toString(),
                                s.kind(),
                                s.direction(),
                                s.title(),
                                s.createdAt(),
                                status,
                                caseId == null ? s.caseId() : caseId,
                                submissionId == null ? s.submissionId() : submissionId,
                                replyId == null ? s.replyId() : replyId,
                                s.destinationId(),
                                s.attachmentCount(),
                                s.totalBytes(),
                                s.warnings()),
                        item.files()));
    }

    void receipt(String scope, String subjectId, String status, String action, boolean reply) {
        String record = find(scope, reply ? "reply" : "submission", "received", subjectId);
        if (record != null)
            outcome(
                    record,
                    "confirmed".equals(status)
                            ? ("accept".equals(action) ? "accepted" : "rejected")
                            : status,
                    null,
                    null,
                    null);
    }

    private String find(String scope, String kind, String direction, String subject) {
        return records.values().stream()
                .filter(
                        i ->
                                i.scope().equals(scope)
                                        && i.summary().kind().equals(kind)
                                        && i.summary().direction().equals(direction)
                                        && Objects.equals(
                                                subject,
                                                kind.equals("reply")
                                                        ? i.summary().replyId()
                                                        : i.summary().submissionId()))
                .map(i -> i.summary().recordId())
                .findFirst()
                .orElse(null);
    }

    List<Summary> list(String scope) {
        return records.values().stream()
                .filter(i -> i.scope().equals(scope))
                .map(Item::summary)
                .toList();
    }

    Object resource(String scope, String document) {
        var v = StrictJson.object(document, 4096);
        if (!v.keySet().equals(Set.of("operation", "recordId", "contentId", "offset")))
            throw new SessionException("invalid_input");
        String operation = v.get("operation").getAsString();
        if (operation.equals("list")) {
            var all = list(scope);
            int offset = v.get("offset").getAsInt();
            if (offset < 0 || offset > all.size() || offset % 10 != 0)
                throw new SessionException("invalid_input");
            return Map.of(
                    "records",
                    all.subList(offset, Math.min(offset + 10, all.size())),
                    "total",
                    all.size());
        }
        if (operation.equals("clear")) {
            for (var s : list(scope)) delete(scope, s.recordId());
            return Map.of("cleared", true);
        }
        String recordId = DestinationAccess.id(v.get("recordId").getAsString());
        if (operation.equals("delete")) {
            delete(scope, recordId);
            return Map.of("deleted", true);
        }
        var item = records.get(recordId);
        if (item == null || !item.scope().equals(scope))
            throw new SessionException("invalid_resource");
        int offset = v.get("offset").getAsInt();
        if (operation.equals("parts")) {
            if (offset < 0 || offset > item.files().size() || offset % 2 != 0)
                throw new SessionException("invalid_input");
            return new Page(
                    recordId,
                    offset,
                    item.files().size(),
                    item.files().subList(offset, Math.min(offset + 2, item.files().size())).stream()
                            .map(File::part)
                            .toList());
        }
        if (!operation.equals("read")) throw new SessionException("invalid_input");
        String partId = DestinationAccess.id(v.get("contentId").getAsString());
        var file =
                item.files().stream()
                        .filter(f -> f.part().contentId().equals(partId))
                        .findFirst()
                        .orElseThrow(() -> new SessionException("invalid_resource"));
        if (offset < 0 || offset > file.bytes().length) throw new SessionException("invalid_input");
        int end = Math.min(offset + ContentStore.CHUNK_BYTES, file.bytes().length);
        return new Chunk(
                recordId,
                partId,
                offset,
                file.bytes().length,
                Base64.getEncoder().encodeToString(Arrays.copyOfRange(file.bytes(), offset, end)),
                end == file.bytes().length);
    }

    void delete(String scope, String id) {
        var item = records.get(id);
        if (item == null) return;
        if (!item.scope().equals(scope)) throw new SessionException("invalid_resource");
        records.remove(id);
        bytes -= item.summary().totalBytes();
        item.files().forEach(f -> Arrays.fill(f.bytes(), (byte) 0));
    }

    private static String title(byte[] metadata, String fallback) {
        try {
            var json =
                    StrictJson.object(
                            new String(metadata, StandardCharsets.UTF_8), 2 * 1024 * 1024);
            if (json.has("subject")
                    && json.get("subject").isJsonPrimitive()
                    && json.get("subject").getAsJsonPrimitive().isString()) {
                String value = json.get("subject").getAsString();
                if (!value.isBlank()
                        && value.length() <= 256
                        && value.chars().noneMatch(Character::isISOControl)) return value;
            }
        } catch (RuntimeException ignored) {
            /* Optional display label only. */
        }
        return fallback;
    }

    public void close() {
        for (var item : records.values())
            item.files().forEach(f -> Arrays.fill(f.bytes(), (byte) 0));
        records.clear();
        bytes = 0;
    }
}
