package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import java.util.*;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import com.google.gson.Gson;
import org.junit.jupiter.api.Test;

class EventLogStoreTest {
    private static final UUID DEST = UUID.randomUUID(), CASE = UUID.randomUUID(), SUB = UUID.randomUUID();
    private static final String OWNER = UUID.randomUUID().toString();
    private static VerifiedEventLog log(int count, String claims, String issuer) {
        var entries = new ArrayList<VerifiedEventLog.Entry>();
        for (int i = 0; i < count; i++) entries.add(new VerifiedEventLog.Entry(UUID.randomUUID(),
                "https://schema.fitko.de/fit-connect/events/submit-submission", issuer, Instant.parse("2026-10-16T00:00:00Z"), "{\"alg\":\"PS512\"}", claims));
        return new VerifiedEventLog(DEST, CASE, SUB, entries);
    }
    @Test void replySummariesDoNotMasqueradeAsSubmissionsAndUseTheSameOwnerAndApiBoundary() {
        var store = new EventLogStore(); var original = log(1, "{}", "synthetic");
        var entries = original.entries().stream().map(entry -> new VerifiedEventLog.Entry(entry.eventId(), entry.eventType().replace("-submission", "-reply"), entry.issuer(), entry.issuedAt(), entry.headerJson(), entry.claimsJson())).toList();
        var log = VerifiedEventLog.reply(CASE, SUB, entries);
        var summary = store.publishReply(ApiVersion.V3, OWNER, CASE, SUB, log);
        assertEquals(SUB.toString(), summary.replyId());
        assertFalse(new Gson().toJson(summary).contains("submissionId"));
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V2, OWNER, summary.logId(), 0));
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V3, UUID.randomUUID().toString(), summary.logId(), 0));
        assertThrows(SessionException.class, () -> store.publish(ApiVersion.V3, OWNER, DEST, CASE, SUB, log));
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V3, OWNER, summary.logId(), 0));
    }
    @Test void metadataIsPagedWithoutEmbeddingJsonAndUsesPortableTimeStrings() {
        var store = new EventLogStore(); var summary = store.publish(ApiVersion.V2, OWNER, DEST, CASE, SUB, log(6, "{}", "synthetic"));
        assertEquals(6, summary.total()); assertEquals(List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"), summary.warnings());
        var first = store.page(ApiVersion.V2, OWNER, summary.logId(), 0);
        assertEquals(5, first.events().size()); assertEquals("2026-10-16T00:00:00Z", first.events().getFirst().issuedAt());
        assertEquals(1, store.page(ApiVersion.V2, OWNER, summary.logId(), 5).events().size());
        String json = new Gson().toJson(first); assertFalse(json.contains("headerJson")); assertFalse(json.contains("claimsJson"));
        assertThrows(UnsupportedOperationException.class, () -> first.events().clear());
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V2, OWNER, summary.logId(), 1));
    }
    @Test void jsonReadsPreserveExactUtf8AcrossChunksAndDoNotConsumeTheSnapshot() throws Exception {
        String claims = "{\n \"integer\":9007199254740993,\"text\":\"" + "Grüße".repeat(8000) + "\"\n}";
        var store = new EventLogStore(); var summary = store.publish(ApiVersion.V3, OWNER, DEST, CASE, SUB, log(1, claims, "synthetic"));
        var event = store.page(ApiVersion.V3, OWNER, summary.logId(), 0).events().getFirst();
        var output = new ByteArrayOutputStream(); int offset = 0;
        do {
            var chunk = store.read(ApiVersion.V3, OWNER, summary.logId(), event.eventId(), "claims", offset);
            assertTrue(chunk.chunk().length() <= 32768); assertEquals(offset, chunk.byteOffset());
            byte[] bytes = Base64.getDecoder().decode(chunk.chunk()); output.write(bytes); offset += bytes.length;
            if (chunk.complete()) break;
        } while (offset <= 65536);
        assertArrayEquals(claims.getBytes(StandardCharsets.UTF_8), output.toByteArray());
        assertEquals(summary.total(), store.page(ApiVersion.V3, OWNER, summary.logId(), 0).total());
        assertEquals("{\"alg\":\"PS512\"}", new String(Base64.getDecoder().decode(store.read(ApiVersion.V3, OWNER, summary.logId(), event.eventId(), "header", 0).chunk()), StandardCharsets.UTF_8));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, OWNER, summary.logId(), event.eventId(), "private", 0));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, OWNER, summary.logId(), event.eventId(), "claims", -1));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, OWNER, summary.logId(), event.eventId(), "claims", 65537));
    }
    @Test void apiOwnerLogAndEventMustMatchAndReplacementRetiresOldHandles() {
        var store = new EventLogStore(); var first = store.publish(ApiVersion.V2, OWNER, DEST, CASE, SUB, log(1, "{}", "synthetic"));
        var row = store.page(ApiVersion.V2, OWNER, first.logId(), 0).events().getFirst();
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V3, OWNER, first.logId(), 0));
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V2, UUID.randomUUID().toString(), first.logId(), 0));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V2, OWNER, first.logId(), UUID.randomUUID().toString(), "claims", 0));
        var second = store.publish(ApiVersion.V3, OWNER, DEST, CASE, SUB, log(1, "{}", "synthetic"));
        assertNotEquals(first.logId(), second.logId());
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V2, OWNER, first.logId(), row.eventId(), "claims", 0));
        store.clearOwner(UUID.randomUUID().toString()); assertEquals(1, store.page(ApiVersion.V3, OWNER, second.logId(), 0).total());
        store.discard(ApiVersion.V3, OWNER, second.logId());
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V3, OWNER, second.logId(), 0));
    }
    @Test void failedPublicationAndOwnerCleanupCannotLeaveAStaleVerifiedLog() {
        var store = new EventLogStore(); var first = store.publish(ApiVersion.V2, OWNER, DEST, CASE, SUB, log(1, "{}", "synthetic"));
        assertThrows(SessionException.class, () -> store.publish(ApiVersion.V2, OWNER, DEST, CASE, UUID.randomUUID(), log(1, "{}", "synthetic")));
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V2, OWNER, first.logId(), 0));
        var second = store.publish(ApiVersion.V2, OWNER, DEST, CASE, SUB, log(1, "{}", "synthetic")); store.clearOwner(OWNER);
        assertThrows(SessionException.class, () -> store.page(ApiVersion.V2, OWNER, second.logId(), 0));
    }
    @Test void worstCaseEscapedPageStillFitsOneNativeFrame() {
        var store = new EventLogStore(); var summary = store.publish(ApiVersion.V2, OWNER, DEST, CASE, SUB, log(5, "{}", "X" + "\u2028".repeat(1023)));
        String json = new Gson().toJson(Map.of("apiVersion", "v2", "sessionId", OWNER, "environment", "TEST", "data", store.page(ApiVersion.V2, OWNER, summary.logId(), 0)));
        assertTrue(json.getBytes(StandardCharsets.UTF_8).length < FrameCodec.MAX_BYTES);
    }
}
