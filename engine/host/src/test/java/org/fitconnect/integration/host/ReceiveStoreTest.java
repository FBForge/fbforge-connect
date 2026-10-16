package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.*;

class ReceiveStoreTest {
    private static final String SESSION = "11111111-1111-4111-8111-111111111111";
    private static final UUID DEST = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID SUB = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID CASE = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final UUID ATT = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static ReceivedContent content(byte[] data) {
        return new ReceivedContent(DEST, SUB, CASE, "{\"original\":true}".getBytes(StandardCharsets.UTF_8), data,
                "application/json", List.of(new ReceivedContent.Attachment(ATT, "Anlage.txt", "text/plain", "Synthetische Beschreibung",
                        "Anlage".getBytes(StandardCharsets.UTF_8))), List.of(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false)));
    }
    @Test void schemaSnapshotUsesTheSameApiSessionAndProofBoundaryAsTheVerifiedContent() {
        var original = content(new byte[0]);
        var annotated = new ReceivedContent(original.destinationId(), original.submissionId(), original.caseId(), original.metadata(), original.data(), original.mimeType(), original.attachments(), original.issues(), new SchemaSnapshot("urn:test:schema", "{}"));
        var store = new ReceiveStore(); var summary = store.publish(ApiVersion.V3, SESSION, DEST, SUB, annotated);
        assertEquals("urn:test:schema", store.schema(ApiVersion.V3, SESSION, summary.proofId(), 0).schemaUri());
        assertThrows(SessionException.class, () -> store.schema(ApiVersion.V2, SESSION, summary.proofId(), 0));
        assertThrows(SessionException.class, () -> store.schema(ApiVersion.V3, UUID.randomUUID().toString(), summary.proofId(), 0));
        store.discard(ApiVersion.V3, SESSION, summary.proofId());
        assertThrows(SessionException.class, () -> store.schema(ApiVersion.V3, SESSION, summary.proofId(), 0));
    }
    @Test void summaryContainsOnlyBoundReferencesAndOriginalBytesAreReadInLimitedChunks() {
        var store = new ReceiveStore(); byte[] data = new byte[ContentStore.CHUNK_BYTES + 7]; new Random(1).nextBytes(data);
        var summary = store.publish(ApiVersion.V2, SESSION, DEST, SUB, content(data));
        assertEquals(DEST.toString(), summary.destinationId()); assertEquals(SUB.toString(), summary.submissionId());
        assertEquals(CASE.toString(), summary.caseId()); assertEquals(3, summary.partCount());
        assertFalse(new com.google.gson.Gson().toJson(summary).contains("original"));
        var page = store.parts(ApiVersion.V2, SESSION, summary.proofId(), 0);
        assertEquals(2, page.parts().size());
        assertEquals("Synthetische Beschreibung", store.parts(ApiVersion.V2, SESSION, summary.proofId(), 2).parts().getFirst().description());
        var part = page.parts().get(1);
        var first = store.read(ApiVersion.V2, SESSION, summary.proofId(), part.contentId(), 0);
        assertEquals(ContentStore.CHUNK_BYTES, Base64.getDecoder().decode(first.chunk()).length);
        assertFalse(first.complete());
        var last = store.read(ApiVersion.V2, SESSION, summary.proofId(), part.contentId(), ContentStore.CHUNK_BYTES);
        assertArrayEquals(Arrays.copyOfRange(data, ContentStore.CHUNK_BYTES, data.length), Base64.getDecoder().decode(last.chunk()));
        assertTrue(last.complete());
        assertEquals(summary, store.state(ApiVersion.V2, SESSION, summary.proofId()));
    }
    @Test void apiSessionProofAndContentIdentityAreAllRequired() {
        var store = new ReceiveStore(); var summary = store.publish(ApiVersion.V3, SESSION, DEST, SUB, content(new byte[0]));
        var part = store.parts(ApiVersion.V3, SESSION, summary.proofId(), 0).parts().getFirst();
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V2, SESSION, summary.proofId(), 0));
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V3, DEST.toString(), summary.proofId(), 0));
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V3, SESSION, SUB.toString(), 0));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, SESSION, summary.proofId(), ATT.toString(), 0));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, SESSION, summary.proofId(), part.contentId(), -1));
        assertThrows(SessionException.class, () -> store.read(ApiVersion.V3, SESSION, summary.proofId(), part.contentId(), Integer.MAX_VALUE));
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V3, SESSION, summary.proofId(), 1));
        assertEquals(summary, store.state(ApiVersion.V3, SESSION, summary.proofId()));
    }
    @Test void replacingFailingOrDiscardingAProofPreventsReadingItsPreviousContent() {
        var store = new ReceiveStore(); var first = store.publish(ApiVersion.V2, SESSION, DEST, SUB, content(new byte[0]));
        var second = store.publish(ApiVersion.V2, SESSION, DEST, SUB, content(new byte[0]));
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V2, SESSION, first.proofId(), 0));
        assertThrows(SessionException.class, () -> store.publish(ApiVersion.V2, SESSION, DEST, CASE, content(new byte[0])));
        assertThrows(SessionException.class, () -> store.parts(ApiVersion.V2, SESSION, second.proofId(), 0));
        var third = store.publish(ApiVersion.V3, SESSION, DEST, SUB, content(new byte[0]));
        store.clearOwner(DEST.toString()); assertEquals(third, store.state(ApiVersion.V3, SESSION, third.proofId()));
        store.clearOwner(SESSION); assertThrows(SessionException.class, () -> store.parts(ApiVersion.V3, SESSION, third.proofId(), 0));
    }
    @Test void descriptorsArePagedBeforeTheyCanExceedTheNativeFrameEvenWithJsonEscaping() {
        var attachments = new ArrayList<ReceivedContent.Attachment>();
        for (int i = 0; i < 39; i++) attachments.add(new ReceivedContent.Attachment(UUID.randomUUID(), "ä".repeat(250), "application/pdf", "<".repeat(4096), new byte[0]));
        var content = new ReceivedContent(DEST, SUB, CASE, new byte[0], new byte[0], "application/json", attachments, List.of());
        var store = new ReceiveStore(); var summary = store.publish(ApiVersion.V2, SESSION, DEST, SUB, content);
        assertEquals(41, summary.partCount());
        for (int offset = 0; offset < summary.partCount(); offset += 2) {
            var page = store.parts(ApiVersion.V2, SESSION, summary.proofId(), offset);
            assertTrue(new com.google.gson.Gson().toJson(page).getBytes(StandardCharsets.UTF_8).length < FrameCodec.MAX_BYTES - 1024);
            assertTrue(page.parts().size() <= 2);
        }
    }
    @Test void nativeRangesAreDefensiveBoundedAndHandleEmptyPartsWithoutOverflow() {
        var content = content(new byte[] { 1, 2, 3 });
        byte[] range = content.readPart(1, 1, 2); range[0] = 9;
        assertArrayEquals(new byte[] { 2, 3 }, content.readPart(1, 1, 2));
        assertArrayEquals(new byte[0], content.readPart(1, 3, 1));
        assertThrows(SessionException.class, () -> content.readPart(1, 0, Integer.MAX_VALUE));
        assertThrows(SessionException.class, () -> content.readPart(-1, 0, 1));
        assertThrows(SessionException.class, () -> content.readPart(content.partCount(), 0, 1));
        assertThrows(SessionException.class, () -> content.readPart(1, 0, 0));
        var store = new ReceiveStore(); var summary = store.publish(ApiVersion.V2, SESSION, DEST, SUB, content(new byte[0]));
        String id = store.parts(ApiVersion.V2, SESSION, summary.proofId(), 0).parts().get(1).contentId();
        var empty = store.read(ApiVersion.V2, SESSION, summary.proofId(), id, 0);
        assertTrue(empty.complete()); assertEquals("", empty.chunk());
        assertThrows(SessionException.class, () -> store.discard(ApiVersion.V3, SESSION, summary.proofId()));
        assertEquals(summary, store.state(ApiVersion.V2, SESSION, summary.proofId()));
        store.discard(ApiVersion.V2, SESSION, summary.proofId());
        assertThrows(SessionException.class, () -> store.state(ApiVersion.V2, SESSION, summary.proofId()));
    }
}
