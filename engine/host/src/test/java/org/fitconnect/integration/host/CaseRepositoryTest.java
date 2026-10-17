package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class CaseRepositoryTest {
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();

    static byte[] bytes(String v) {
        return v.getBytes(StandardCharsets.UTF_8);
    }

    static String request(String operation, String record, String content, int offset) {
        var v = new JsonObject();
        v.addProperty("operation", operation);
        v.addProperty("recordId", record);
        v.addProperty("contentId", content);
        v.addProperty("offset", offset);
        return v.toString();
    }

    static ReceivedContent received() {
        return new ReceivedContent(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                bytes("{\"subject\":\"Fiktiver Antrag\"}"),
                bytes("{\"vorname\":\"Erika\"}"),
                "application/json",
                List.of(
                        new ReceivedContent.Attachment(
                                UUID.randomUUID(),
                                "Nachweis.pdf",
                                "application/pdf",
                                null,
                                bytes("%PDF-1.7\nfictional"))),
                List.of(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false)),
                new SchemaSnapshot("urn:test:schema", "{\"title\":\"Antrag\"}"));
    }

    @Test
    void copiesSurviveProofDisposalAndReceiptsWhileOtherScopesRemainIsolated() {
        try (var cases = new CaseRepository()) {
            var content = received();
            String scope = "v3/profile-a";
            String id = cases.receive(scope, content);
            var proof = new ReceiveStore();
            var summary =
                    proof.publish(
                            ApiVersion.V3,
                            UUID.randomUUID().toString(),
                            content.destinationId(),
                            content.submissionId(),
                            content);
            proof.clear();
            assertFalse(JSON.toJson(cases.list(scope)).contains(summary.proofId()));
            assertEquals("Fiktiver Antrag", cases.list(scope).getFirst().title());
            assertEquals(0, cases.list("v2/profile-a").size());
            assertThrows(
                    SessionException.class,
                    () -> cases.resource("v3/profile-b", request("parts", id, null, 0)));
            var first = (CaseRepository.Page) cases.resource(scope, request("parts", id, null, 0));
            assertEquals(4, first.total());
            var part = first.parts().get(1);
            for (String action : List.of("accept", "reject")) {
                cases.receipt(scope, content.submissionId().toString(), "confirmed", action, false);
                assertEquals(
                        action.equals("accept") ? "accepted" : "rejected",
                        cases.list(scope).getFirst().status());
                var chunk =
                        (CaseRepository.Chunk)
                                cases.resource(scope, request("read", id, part.contentId(), 0));
                assertArrayEquals(content.data(), Base64.getDecoder().decode(chunk.chunk()));
            }
            String id2 = cases.receive("v3/profile-b", content);
            cases.delete(scope, id);
            assertTrue(cases.list(scope).isEmpty());
            assertEquals(id2, cases.list("v3/profile-b").getFirst().recordId());
        }
    }

    @Test
    void outgoingSnapshotsKeepExactBytesAndUnknownResultsDoNotInventServerIds() {
        try (var cases = new CaseRepository()) {
            byte[] original = bytes("{\"test\":1}");
            var input =
                    new SubmissionInput(
                            null,
                            UUID.randomUUID(),
                            "urn:test:service",
                            "Fiktive Leistung",
                            null,
                            URI.create("urn:test:schema"),
                            "application/json",
                            original,
                            List.of(),
                            null,
                            null);
            String id = cases.outgoing("v2/sender", input);
            original[0] = 0;
            cases.outcome(id, "uncertain", null, null, null);
            var summary = cases.list("v2/sender").getFirst();
            assertNull(summary.caseId());
            assertNull(summary.submissionId());
            assertEquals("uncertain", summary.status());
            var page =
                    (CaseRepository.Page)
                            cases.resource("v2/sender", request("parts", id, null, 0));
            var chunk =
                    (CaseRepository.Chunk)
                            cases.resource(
                                    "v2/sender",
                                    request("read", id, page.parts().getFirst().contentId(), 0));
            assertArrayEquals(bytes("{\"test\":1}"), Base64.getDecoder().decode(chunk.chunk()));
            assertThrows(
                    SessionException.class,
                    () ->
                            cases.resource(
                                    "v2/sender",
                                    request("read", id, UUID.randomUUID().toString(), 0)));
        }
    }

    @Test
    void limitsNeverEvictExistingRecordsAndClearIsScoped() {
        try (var cases = new CaseRepository()) {
            for (int i = 0; i < CaseRepository.MAX_RECORDS; i++)
                cases.receive("scope-a", received());
            assertThrows(SessionException.class, () -> cases.receive("scope-b", received()));
            assertEquals(100, cases.list("scope-a").size());
            cases.resource("scope-b", request("clear", null, null, 0));
            assertEquals(100, cases.list("scope-a").size());
            cases.resource("scope-a", request("clear", null, null, 0));
            assertTrue(cases.list("scope-a").isEmpty());
            assertThrows(
                    SessionException.class, () -> cases.capacity(CaseRepository.MAX_BYTES + 1));
            cases.receive("scope-b", received());
            assertEquals(1, cases.list("scope-b").size());
        }
    }

    @Test
    void repliesRetainTheirOwnIdentityAndNeverBecomeSubmissionAuthority() {
        UUID reply = UUID.randomUUID(), caseId = UUID.randomUUID(), channel = UUID.randomUUID();
        var evidence =
                new ReplyReceiptEvidence(
                        caseId,
                        reply,
                        channel,
                        "AAAAAAAAAAAAAAAAAAAAAA",
                        "AAAAAAAAAAAAAAAAAAAAAA",
                        Map.of());
        try (var cases = new CaseRepository()) {
            var content =
                    new ReceivedReplyContent(
                            reply,
                            caseId,
                            null,
                            channel,
                            bytes("{}"),
                            bytes("{\"status\":\"ok\"}"),
                            "application/json",
                            List.of(),
                            List.of(),
                            evidence);
            String id = cases.receive("reply-owner", content);
            assertEquals(id, cases.receive("reply-owner", content));
            cases.receipt("reply-owner", reply.toString(), "confirmed", "accept", true);
            var item = cases.list("reply-owner").getFirst();
            assertEquals("reply", item.kind());
            assertEquals("accepted", item.status());
            assertEquals(reply.toString(), item.replyId());
            assertNull(item.submissionId());
            assertFalse(JSON.toJson(item).contains(channel.toString()));
        }
    }

    @Test
    void anUnverifiedEnvelopeUpgradesInPlaceWithoutInventingVerifiedData() {
        try (var cases = new CaseRepository()) {
            var data = received();
            var info =
                    new SubmissionInfo(
                            data.destinationId(),
                            null,
                            data.submissionId(),
                            data.caseId(),
                            List.of(),
                            "urn:test:service",
                            "Fiktive Leistung",
                            null,
                            null,
                            null,
                            true,
                            true);
            cases.notice("scope", info);
            var before = cases.list("scope").getFirst();
            assertEquals("unverified", before.status());
            var page =
                    (CaseRepository.Page)
                            cases.resource("scope", request("parts", before.recordId(), null, 0));
            assertEquals(1, page.total());
            assertEquals("metadata", page.parts().getFirst().kind());
            assertEquals(before.recordId(), cases.receive("scope", data));
            var after = cases.list("scope").getFirst();
            assertEquals("verified", after.status());
            assertEquals(before.createdAt(), after.createdAt());
            assertNotEquals(before.revision(), after.revision());
            assertEquals(
                    4,
                    ((CaseRepository.Page)
                                    cases.resource(
                                            "scope", request("parts", after.recordId(), null, 0)))
                            .total());
            var limit =
                    assertThrows(
                            SessionException.class,
                            () -> cases.capacity(CaseRepository.MAX_BYTES + 1));
            assertEquals("case_limit", limit.code());
            assertEquals(1, cases.list("scope").size());
        }
    }
}
