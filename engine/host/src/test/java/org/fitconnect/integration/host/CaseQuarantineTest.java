package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class CaseQuarantineTest {
    @Test
    void quarantineIsBoundToTheMessageScopeAndContextAndCannotBeUndoneByReceiptOrReceive() {
        for (boolean reply : List.of(false, true)) {
            try (var cases = new CaseRepository()) {
                var submission = CaseRepositoryTest.received();
                UUID replyId = UUID.randomUUID(), channel = UUID.randomUUID();
                var response =
                        new ReceivedReplyContent(
                                replyId,
                                submission.caseId(),
                                null,
                                channel,
                                submission.metadata(),
                                submission.data(),
                                "application/json",
                                List.of(),
                                List.of(),
                                new ReplyReceiptEvidence(
                                        submission.caseId(),
                                        replyId,
                                        channel,
                                        "AAAAAAAAAAAAAAAAAAAAAA",
                                        "AAAAAAAAAAAAAAAAAAAAAA",
                                        Map.of()));
                String scope = "v3/profile-a";
                String other = "v3/profile-b";
                String id =
                        reply ? cases.receive(scope, response) : cases.receive(scope, submission);
                String foreign =
                        reply ? cases.receive(other, response) : cases.receive(other, submission);
                String kind = reply ? "reply" : "submission";
                String subject = (reply ? replyId : submission.submissionId()).toString();
                String context =
                        (reply ? submission.caseId() : submission.destinationId()).toString();
                var parts =
                        (CaseRepository.Page)
                                cases.resource(
                                        scope, CaseRepositoryTest.request("parts", id, null, 0));
                cases.quarantine(scope, kind, subject, UUID.randomUUID().toString());
                assertEquals("verified", cases.list(scope).getFirst().status());
                cases.quarantine(scope, kind, UUID.randomUUID().toString(), context);
                assertEquals("verified", cases.list(scope).getFirst().status());
                cases.quarantine(scope, kind, subject, context);
                cases.receipt(scope, subject, "confirmed", "accept", reply);
                assertEquals(
                        id,
                        reply ? cases.receive(scope, response) : cases.receive(scope, submission));
                var issues =
                        List.of(
                                new ReceivedContent.Issue(
                                        "MALWARE_ATTACHMENT_BLOCKED",
                                        false,
                                        List.of(
                                                new BlockedAttachment(
                                                        UUID.randomUUID(), "blocked.txt"))));
                var filteredSubmission =
                        new ReceivedContent(
                                submission.destinationId(),
                                submission.submissionId(),
                                submission.caseId(),
                                submission.metadata(),
                                submission.data(),
                                submission.mimeType(),
                                List.of(),
                                issues,
                                submission.schemaSnapshot());
                var filteredReply =
                        new ReceivedReplyContent(
                                replyId,
                                submission.caseId(),
                                null,
                                channel,
                                submission.metadata(),
                                submission.data(),
                                "application/json",
                                List.of(),
                                issues,
                                response.evidence());
                assertEquals(
                        id,
                        reply
                                ? cases.receive(scope, filteredReply)
                                : cases.receive(scope, filteredSubmission));
                assertEquals("blocked", cases.list(scope).getFirst().status());
                assertEquals(List.of("MALWARE_DETECTED"), cases.list(scope).getFirst().warnings());
                for (String operation : List.of("parts", "read")) {
                    var failure =
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            cases.resource(
                                                    scope,
                                                    CaseRepositoryTest.request(
                                                            operation,
                                                            id,
                                                            parts.parts().getFirst().contentId(),
                                                            0)));
                    assertEquals("malware_detected", failure.code());
                }
                assertEquals("verified", cases.list(other).getFirst().status());
                assertNotNull(
                        cases.resource(
                                other, CaseRepositoryTest.request("parts", foreign, null, 0)));
                cases.delete(scope, id);
                assertTrue(cases.list(scope).isEmpty());
                assertNotEquals(
                        id,
                        reply ? cases.receive(scope, response) : cases.receive(scope, submission));
            }
        }
    }
}
