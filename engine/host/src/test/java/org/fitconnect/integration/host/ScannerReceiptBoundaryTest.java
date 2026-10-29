package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ScannerReceiptBoundaryTest extends ReceiverTestSupport {
    @Test
    void nativeAttachmentProblemsRequireConfirmationAndRemainBoundToTheOriginalProof()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var fixture = new ReceiverFixture(api, false, false);
            ResourceExchange remote =
                    (url, headers) ->
                            url.contains("/destination-api/") && url.contains("/keys?")
                                    ? "{\"keys\":["
                                            + registration
                                            + ","
                                            + signingRegistration("synthetic-sign")
                                            + "],\"offset\":0,\"count\":2,\"totalCount\":2}"
                                    : fixture.get(url, headers);
            try (var registry = registry();
                    var content = new ContentStore(workspace);
                    var server =
                            new MalwareScannerTest.ScannerServer(
                                    "clamav",
                                    bytes ->
                                            Arrays.equals(
                                                            bytes,
                                                            "Testanlage"
                                                                    .getBytes(
                                                                            StandardCharsets.UTF_8))
                                                    ? "stream: Eicar FOUND\0"
                                                    : "stream: OK\0");
                    var state =
                            new SessionState(
                                    registry,
                                    (url, body) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content)) {
                String owner =
                        state.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "synthetic", "synthetic")
                                .sessionId();
                state.destinationsFlow.resource(
                        api, owner, "load_destination", DEST, 0, null, null);
                state.destinationsFlow.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                state.destinationsFlow.resource(api, owner, "import_key", DEST, 0, "sign", pem);
                byte[] schema =
                        fixture.schemas()
                                .get(ReceiverFixture.SCHEMA)
                                .getBytes(StandardCharsets.UTF_8);
                String handle = content.begin(owner, schema.length).contentId();
                content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
                String catalog =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemas",
                                                List.of(
                                                        Map.of(
                                                                "uri",
                                                                ReceiverFixture.SCHEMA,
                                                                "contentId",
                                                                handle))));
                state.scanners.put(
                        owner,
                        new MalwareScanner(
                                new MalwareScanner.Config(
                                        "clamav", "127.0.0.1", server.port(), "")));
                var proof =
                        (ReceiveStore.Summary)
                                state.receiveFlow.verify(api, owner, DEST, SUB, catalog).data();
                assertEquals(2, proof.partCount());
                assertEquals(
                        List.of(
                                new BlockedAttachment(
                                        UUID.fromString(ReceiverFixture.ATT), "Anlage.txt")),
                        proof.blockedAttachments());
                var request =
                        new ReceiptRequest(
                                UUID.fromString(DEST),
                                UUID.fromString(SUB),
                                UUID.fromString(CASE),
                                "accept",
                                "synthetic-sign",
                                null,
                                null,
                                null);
                var prepared =
                        (SessionManager.PreparedReceipt)
                                state.receiptsFlow
                                        .prepareReceipt(api, owner, request, proof.proofId())
                                        .data();
                var review =
                        (Map<?, ?>)
                                state.receiptsFlow
                                        .review(api, owner, prepared.attempt().attemptId(), false)
                                        .data();
                assertEquals(true, review.get("requiresConfirmation"));
                assertEquals(1, review.get("attachmentProblemCount"));
                assertEquals(
                        List.of(UUID.fromString(ReceiverFixture.ATT)),
                        state.pendingReceipts.get(owner).request().blockedAttachments());
                var renderer = new com.google.gson.JsonObject();
                renderer.addProperty("destinationId", DEST);
                renderer.addProperty("submissionId", SUB);
                renderer.addProperty("caseId", CASE);
                renderer.addProperty("action", "accept");
                renderer.addProperty("signingKid", "synthetic-sign");
                renderer.addProperty("proofId", proof.proofId());
                assertNotNull(ReceiptDraft.resolve(renderer.toString()));
                renderer.add(
                        "blockedAttachments", new Gson().toJsonTree(List.of(ReceiverFixture.ATT)));
                assertThrows(
                        SessionException.class, () -> ReceiptDraft.resolve(renderer.toString()));
                state.receiptsFlow.receipt(
                        api, owner, "cancel_receipt", prepared.attempt().attemptId());
                assertThrows(
                        SessionException.class,
                        () ->
                                state.receiptsFlow.review(
                                        api, owner, prepared.attempt().attemptId(), false));
            }
        }
    }
}
