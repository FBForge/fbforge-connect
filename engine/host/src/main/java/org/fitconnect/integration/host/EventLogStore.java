package org.fitconnect.integration.host;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** One immutable native log. Overview pages never embed complete header or claims documents. */
final class EventLogStore {
    // Five maximally escaped 1024-character issuers still fit the 64-KiB protocol frame.
    private static final int PAGE_SIZE = 5;
    private Stored current;

    record Summary(
            String logId,
            String destinationId,
            String caseId,
            String submissionId,
            int total,
            List<String> warnings) {}

    record ReplySummary(
            String logId, String caseId, String replyId, int total, List<String> warnings) {}

    record CaseSummary(
            String logId, String caseId, String scope, int total, List<String> warnings) {}

    record CaseRow(
            String eventId,
            String eventType,
            String issuer,
            String issuedAt,
            int headerBytes,
            int claimsBytes,
            String subjectType,
            String subjectId) {}

    record CasePage(String logId, int offset, int total, List<CaseRow> events) {}

    record Row(
            String eventId,
            String eventType,
            String issuer,
            String issuedAt,
            int headerBytes,
            int claimsBytes) {}

    record Page(String logId, int offset, int total, List<Row> events) {}

    record Chunk(
            String logId,
            String eventId,
            String part,
            int byteOffset,
            int totalBytes,
            String chunk,
            boolean complete) {}

    private record Stored(
            ApiVersion api,
            String owner,
            List<VerifiedEventLog.Entry> entries,
            List<VerifiedCaseEventLog.Entry> caseEntries,
            String logId) {}

    synchronized Summary publish(
            ApiVersion api,
            String owner,
            UUID destination,
            UUID caseId,
            UUID submission,
            VerifiedEventLog log) {
        current = null;
        if (api == null
                || !uuid(owner)
                || log == null
                || log.replyId() != null
                || !log.destinationId().equals(destination)
                || !log.caseId().equals(caseId)
                || !log.submissionId().equals(submission)) throw invalid();
        var summary =
                new Summary(
                        UUID.randomUUID().toString(),
                        destination.toString(),
                        caseId.toString(),
                        submission.toString(),
                        log.entries().size(),
                        log.warnings());
        current = new Stored(api, owner, log.entries(), null, summary.logId());
        return summary;
    }

    synchronized ReplySummary publishReply(
            ApiVersion api, String owner, UUID caseId, UUID replyId, VerifiedEventLog log) {
        current = null;
        if (api == null
                || !uuid(owner)
                || log == null
                || !log.caseId().equals(caseId)
                || !Objects.equals(log.replyId(), replyId)
                || log.submissionId() != null
                || log.destinationId() != null) throw invalid();
        var summary =
                new ReplySummary(
                        UUID.randomUUID().toString(),
                        caseId.toString(),
                        replyId.toString(),
                        log.entries().size(),
                        log.warnings());
        current = new Stored(api, owner, log.entries(), null, summary.logId());
        return summary;
    }

    synchronized CaseSummary publishCase(
            ApiVersion api, String owner, UUID caseId, VerifiedCaseEventLog log) {
        current = null;
        if (api == null || !uuid(owner) || log == null || !log.caseId().equals(caseId))
            throw invalid();
        var summary =
                new CaseSummary(
                        UUID.randomUUID().toString(),
                        caseId.toString(),
                        "case",
                        log.entries().size(),
                        List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"));
        current =
                new Stored(
                        api,
                        owner,
                        log.entries().stream().map(VerifiedCaseEventLog.Entry::event).toList(),
                        log.entries(),
                        summary.logId());
        return summary;
    }

    synchronized CasePage casePage(ApiVersion api, String owner, String logId, int offset) {
        var stored = require(api, owner, logId);
        if (stored.caseEntries() == null
                || offset < 0
                || offset > stored.entries().size()
                || offset % PAGE_SIZE != 0) throw invalid();
        var entries = stored.caseEntries();
        var rows =
                entries.subList(offset, Math.min(offset + PAGE_SIZE, entries.size())).stream()
                        .map(
                                item -> {
                                    var entry = item.event();
                                    return new CaseRow(
                                            entry.eventId().toString(),
                                            entry.eventType(),
                                            entry.issuer(),
                                            entry.issuedAt().toString(),
                                            utf8(entry.headerJson()).length,
                                            utf8(entry.claimsJson()).length,
                                            item.subjectType(),
                                            item.subjectId().toString());
                                })
                        .toList();
        return new CasePage(logId, offset, entries.size(), rows);
    }

    synchronized Page page(ApiVersion api, String owner, String logId, int offset) {
        var stored = require(api, owner, logId);
        if (stored.caseEntries() != null) throw invalid();
        var entries = stored.entries();
        if (offset < 0 || offset > entries.size() || offset % PAGE_SIZE != 0) throw invalid();
        var rows =
                entries.subList(offset, Math.min(offset + PAGE_SIZE, entries.size())).stream()
                        .map(
                                entry ->
                                        new Row(
                                                entry.eventId().toString(),
                                                entry.eventType(),
                                                entry.issuer(),
                                                entry.issuedAt().toString(),
                                                utf8(entry.headerJson()).length,
                                                utf8(entry.claimsJson()).length))
                        .toList();
        return new Page(logId, offset, entries.size(), rows);
    }

    synchronized Chunk read(
            ApiVersion api, String owner, String logId, String eventId, String part, int offset) {
        var stored = require(api, owner, logId);
        if (!"header".equals(part) && !"claims".equals(part)) throw invalid();
        for (var entry : stored.entries()) {
            if (!entry.eventId().toString().equals(eventId)) continue;
            byte[] original = utf8(part.equals("header") ? entry.headerJson() : entry.claimsJson());
            if (offset < 0 || offset > original.length) throw invalid();
            int end = Math.min(offset + ContentStore.CHUNK_BYTES, original.length);
            return new Chunk(
                    logId,
                    eventId,
                    part,
                    offset,
                    original.length,
                    Base64.getEncoder().encodeToString(Arrays.copyOfRange(original, offset, end)),
                    end == original.length);
        }
        throw invalid();
    }

    synchronized void discard(ApiVersion api, String owner, String logId) {
        require(api, owner, logId);
        current = null;
    }

    synchronized void clearOwner(String owner) {
        if (current != null && current.owner().equals(owner)) current = null;
    }

    synchronized void clear() {
        current = null;
    }

    private Stored require(ApiVersion api, String owner, String logId) {
        if (current == null
                || current.api() != api
                || !current.owner().equals(owner)
                || !current.logId().equals(logId)) throw invalid();
        return current;
    }

    private static byte[] utf8(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static boolean uuid(String value) {
        try {
            return value != null && UUID.fromString(value).toString().equals(value);
        } catch (IllegalArgumentException failure) {
            return false;
        }
    }

    private static SessionException invalid() {
        return new SessionException("invalid_resource");
    }
}
