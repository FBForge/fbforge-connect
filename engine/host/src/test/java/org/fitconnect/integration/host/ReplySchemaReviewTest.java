package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReplySchemaReviewTest extends SenderTestSupport {
    @Test
    void bothSdkReplyReceiversKeepSchemaInvalidJsonAndXmlReadable() throws Exception {
        for (var api : ApiVersion.values())
            for (var mime : List.of("application/json", "application/xml")) {
                var remote = new SenderCapture(api.wireValue());
                remote.allowReplies = true;
                remote.metadata = "2.0.0";
                var gate = new SendAccess(api, remote);
                try (var adapters = registry();
                        var session =
                                adapters.openSession(
                                        api,
                                        "id",
                                        "secret",
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        gate)) {
                    var base = replyInput(api);
                    var input =
                            new SubmissionInput(
                                    base.fromDestinationId(),
                                    base.destinationId(),
                                    base.serviceIdentifier(),
                                    base.serviceName(),
                                    base.region(),
                                    base.schemaUri(),
                                    base.mimeType(),
                                    base.data(),
                                    base.attachments(),
                                    base.caseId(),
                                    base.processMessage(),
                                    new SubmissionInput.ReplyOffer(REPLY_SCHEMA, mime));
                    var attempt = gate.prepare(input);
                    adapters.withSession(
                            api,
                            session,
                            value -> {
                                value.prepareReplyChannel(
                                        UUID.fromString(attempt.attemptId()), input, workspace);
                                return null;
                            });
                    assertEquals(
                            "sent",
                            adapters.withSession(
                                            api,
                                            session,
                                            value ->
                                                    gate.execute(
                                                            attempt.attemptId(), value, workspace))
                                    .status());
                    var reference = session.replyChannels().getFirst();
                    var metadata =
                            JsonParser.parseString(
                                    new String(
                                            decrypt(
                                                    remote.submitted
                                                            .get("encryptedMetadata")
                                                            .getAsString()),
                                            StandardCharsets.UTF_8));
                    var publicKey = findJsonObject(metadata, "kid", reference.keyId()).deepCopy();
                    var fixture = new SenderIncomingReplyFixture(api, publicKey, mime, false);
                    var wrongSchema =
                            mime.equals("application/xml")
                                    ? fixture.schemas()
                                            .get(REPLY_SCHEMA.toString())
                                            .replace("xs:string", "xs:integer")
                                    : "{\"type\":\"object\",\"properties\":{\"vorname\":{\"type\":\"integer\"}}}";
                    try (var source =
                            ReceiveAccess.forReply(
                                    api, CASE.toString(), fixture.replyId.toString(), fixture)) {
                        var result =
                                adapters.withSession(
                                        api,
                                        session,
                                        value ->
                                                value.receiveReply(
                                                        CASE,
                                                        fixture.replyId,
                                                        source,
                                                        workspace,
                                                        Map.of(
                                                                REPLY_SCHEMA.toString(),
                                                                wrongSchema)));
                        assertArrayEquals(fixture.data, result.data());
                        assertArrayEquals(fixture.attachment, result.readPart(2, 0, 24 * 1024));
                        assertTrue(
                                result.issues().stream()
                                        .anyMatch(
                                                issue ->
                                                        issue.stage()
                                                                .equals("DATA_SCHEMA_INVALID")));
                        var review =
                                JsonParser.parseString(result.schemaSnapshot().document())
                                        .getAsJsonObject()
                                        .getAsJsonObject("validation");
                        assertEquals("invalid", review.get("status").getAsString());
                        assertFalse(review.getAsJsonArray("errors").isEmpty());
                        assertNotNull(result.evidence());
                        assertNotNull(
                                adapters.withSession(
                                        api,
                                        session,
                                        value ->
                                                value.prepareReplyReceipt(
                                                        new ReplyReceiptRequest(
                                                                CASE,
                                                                fixture.replyId,
                                                                "accept",
                                                                null,
                                                                null,
                                                                null),
                                                        result.evidence())));
                    }
                }
            }
    }
}
