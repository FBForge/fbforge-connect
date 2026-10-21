package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ReceiverReplyTest extends ReceiverTestSupport {
    @ParameterizedTest
    @EnumSource(ApiVersion.class)
    void digitalConsentWithoutReplyChannelDoesNotReportAnAuthenticationFailure(ApiVersion api)
            throws Exception {
        try (var adapters = registry();
                var session = open(adapters, api)) {
            String applicationMetadata = "{\"application\":{\"noEReply\":false}}";
            String applicationHash = hash(applicationMetadata.getBytes(StandardCharsets.UTF_8));
            var fixture =
                    new ReceiverFixture(
                            api,
                            false,
                            false,
                            text -> {
                                var metadata = JsonParser.parseString(text).getAsJsonObject();
                                metadata.addProperty(
                                        "$schema",
                                        "https://schema.fitko.de/fit-connect/metadata/2.1.0/metadata.schema.json");
                                var reference = new JsonObject();
                                reference.addProperty("zustimmungZumDigitalenBescheid", true);
                                metadata.add("additionalReferenceInfo", reference);
                                var dataSet = new JsonObject();
                                dataSet.addProperty(
                                        "dataSetId", "55555555-5555-4555-8555-555555555555");
                                var schema = new JsonObject();
                                schema.addProperty("schemaUri", "urn:test:application-metadata");
                                schema.addProperty("mimeType", "application/json");
                                dataSet.add("schema", schema);
                                var digest = new JsonObject();
                                digest.addProperty("type", "sha512");
                                digest.addProperty("content", applicationHash);
                                dataSet.add("hash", digest);
                                dataSet.addProperty("content", applicationMetadata);
                                var dataSets = new JsonArray();
                                dataSets.add(dataSet);
                                metadata.add("dataSets", dataSets);
                                return metadata.toString();
                            });
            session.importKey(DEST, "decrypt", pem, List.of(registration));
            try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                var content = session.receive(DEST, SUB, scope, workspace, fixture.schemas());
                assertArrayEquals(fixture.data, content.data());
            }
            var evidence = session.receiptEvidence(DEST, SUB);
            var error =
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
            assertEquals("reply_channel_missing", error.code());
            assertEquals(evidence, session.receiptEvidence(DEST, SUB));
            session.check();
        }
    }

    @Test
    void bothSdkReplySendersUseOnlyTheVerifiedChannelAndEncryptDataAndAttachments()
            throws Exception {
        for (var api : ApiVersion.values())
            for (boolean dataSet : api == ApiVersion.V3 ? List.of(false, true) : List.of(false))
                try (var adapters = registry();
                        var session = open(adapters, api)) {
                    var answerKey = JsonParser.parseString(registration).getAsJsonObject();
                    answerKey.remove("x5c");
                    answerKey.remove("use");
                    answerKey.addProperty("kid", "synthetic-reply");
                    String offer =
                            "\"replyChannel\":{\"fitConnect\":{\"encryptionPublicKey\":"
                                    + answerKey
                                    + ",\"processStandards\":[\"urn:test:answer\"]}},";
                    var fixture =
                            new ReceiverFixture(
                                    api,
                                    false,
                                    false,
                                    text -> {
                                        if (!dataSet)
                                            return text.replace(
                                                    "\"contentStructure\":",
                                                    offer + "\"contentStructure\":");
                                        var root = JsonParser.parseString(text).getAsJsonObject();
                                        root.addProperty(
                                                "$schema",
                                                "https://schema.fitko.de/fit-connect/metadata/3.0.0/metadata.schema.json");
                                        var fit = new JsonObject();
                                        fit.add("encryptionPublicKey", answerKey);
                                        fit.addProperty(
                                                "destinationId", ReceiverReplyCapture.ONLINE);
                                        var schema = new JsonObject();
                                        schema.addProperty("schemaUri", "urn:test:answer");
                                        schema.addProperty("mimeType", "application/json");
                                        var supported = new JsonArray();
                                        supported.add(schema);
                                        fit.add("supportedSchemas", supported);
                                        var channel = new JsonObject();
                                        channel.add("fitConnect", fit);
                                        var content = new JsonObject();
                                        content.add("replyChannels", channel);
                                        var entry = new JsonObject();
                                        entry.addProperty(
                                                "dataSetId", UUID.randomUUID().toString());
                                        entry.addProperty("content", content.toString());
                                        var digest = new JsonObject();
                                        digest.addProperty("type", "sha512");
                                        try {
                                            digest.addProperty(
                                                    "content",
                                                    hash(
                                                            content.toString()
                                                                    .getBytes(
                                                                            StandardCharsets
                                                                                    .UTF_8)));
                                        } catch (Exception failure) {
                                            throw new AssertionError(failure);
                                        }
                                        entry.add("hash", digest);
                                        var reference = new JsonObject();
                                        reference.addProperty(
                                                "schemaUri",
                                                "https://schema.fitko.de/fit-connect/metadata/dataset/reply-channel-1.0.0.schema.json");
                                        reference.addProperty("mimeType", "application/json");
                                        entry.add("schema", reference);
                                        var entries = new JsonArray();
                                        entries.add(entry);
                                        root.add("dataSets", entries);
                                        return root.toString();
                                    });
                    var input =
                            new ReplyInput(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    java.net.URI.create("urn:test:answer"),
                                    "application/json",
                                    "{\"status\":\"erhalten\"}".getBytes(StandardCharsets.UTF_8),
                                    List.of(
                                            new SubmissionInput.Attachment(
                                                    "Antwort.txt",
                                                    "text/plain",
                                                    "Synthetische Antwort",
                                                    "Antwortanlage"
                                                            .getBytes(StandardCharsets.UTF_8))),
                                    null);
                    ResourceExchange forbidden =
                            (url, headers) -> {
                                throw new AssertionError("Unverified reply reached HTTP: " + url);
                            };
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, forbidden));
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    ResourceExchange supportingReplies =
                            (url, headers) -> {
                                String resource =
                                        fixture.get(url, headers)
                                                .replace(
                                                        "\"submissionSchemas\":",
                                                        "\"replyChannels\":{\"fitConnect\":{\"processStandards\":[\"urn:test:answer\"]}},\"submissionSchemas\":");
                                if (url.endsWith("/submissions/" + SUB) && api == ApiVersion.V3)
                                    resource =
                                            resource.replace(
                                                    "\"submissionId\":",
                                                    "\"fromDestinationId\":\""
                                                            + ReceiverReplyCapture.ONLINE
                                                            + "\",\"submissionId\":");
                                return resource;
                            };
                    try (var scope = new ReceiveAccess(api, DEST, SUB, supportingReplies)) {
                        session.receive(DEST, SUB, scope, workspace, fixture.schemas());
                    }
                    var recipient = session.replyRecipient(DEST, SUB);
                    assertEquals(UUID.fromString(CASE), recipient.caseId());
                    assertEquals(
                            List.of(
                                    new ReplyRecipient.Schema(
                                            java.net.URI.create("urn:test:answer"),
                                            dataSet ? "application/json" : null)),
                            recipient.schemas());
                    if (dataSet) {
                        assertEquals(
                                UUID.fromString(ReceiverReplyCapture.ONLINE),
                                recipient.replyDestinationId());
                        var wrongMime =
                                new ReplyInput(
                                        input.destinationId(),
                                        input.submissionId(),
                                        input.caseId(),
                                        input.schemaUri(),
                                        "application/xml",
                                        input.data(),
                                        List.of(),
                                        null);
                        assertThrows(
                                SessionException.class,
                                () -> session.sendReply(wrongMime, workspace, forbidden));
                    }
                    assertFalse(recipient.toString().contains("synthetic-reply"));
                    for (var wrong :
                            List.of(
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            input.caseId(),
                                            java.net.URI.create("urn:test:other"),
                                            input.mimeType(),
                                            input.data(),
                                            input.attachments(),
                                            null),
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            UUID.randomUUID(),
                                            input.schemaUri(),
                                            input.mimeType(),
                                            input.data(),
                                            input.attachments(),
                                            null)))
                        assertThrows(
                                SessionException.class,
                                () -> session.sendReply(wrong, workspace, forbidden));
                    for (String advertised :
                            api == ApiVersion.V2 ? List.of("2.0.0", "2.1.0") : List.of("3.0.0")) {
                        var capture = new ReceiverReplyCapture(api, advertised);
                        var access = new ReplyAccess(api, capture);
                        var prepared = access.prepare(input, recipient);
                        assertEquals(0, capture.posts);
                        ReplyAccess.State sent;
                        try {
                            sent =
                                    access.execute(
                                            prepared.attemptId(),
                                            session,
                                            workspace,
                                            () ->
                                                    assertEquals(
                                                            recipient,
                                                            session.replyRecipient(DEST, SUB)));
                        } catch (Exception failure) {
                            throw new AssertionError(
                                    api
                                            + " reply SDK failed, requested resources: "
                                            + capture.calls,
                                    failure);
                        }
                        assertEquals(
                                "sent",
                                sent.status(),
                                api + ": " + sent + " resources: " + capture.calls);
                        assertEquals(ReceiverReplyCapture.REPLY, sent.replyId());
                        assertEquals(input.caseId().toString(), sent.caseId());
                        assertThrows(
                                SessionException.class,
                                () ->
                                        access.execute(
                                                prepared.attemptId(),
                                                session,
                                                workspace,
                                                () -> {}));
                        assertEquals(1, capture.posts);
                        assertNotNull(capture.submitted);
                        assertArrayEquals(
                                input.data(),
                                openReply(capture.submitted.get("encryptedData").getAsString()));
                        var metadata =
                                JsonParser.parseString(
                                                new String(
                                                        openReply(
                                                                capture.submitted
                                                                        .get("encryptedMetadata")
                                                                        .getAsString()),
                                                        StandardCharsets.UTF_8))
                                        .getAsJsonObject();
                        assertEquals(
                                "https://schema.fitko.de/fit-connect/metadata/"
                                        + advertised
                                        + "/metadata.schema.json",
                                metadata.get("$schema").getAsString(),
                                api.wireValue());
                        assertTrue(metadata.toString().contains("Antwort.txt"));
                        assertEquals(capture.announced.size(), capture.uploads.size());
                        assertFalse(capture.uploads.isEmpty());
                        assertTrue(
                                capture.uploads.values().stream()
                                        .anyMatch(
                                                value -> {
                                                    try {
                                                        return Arrays.equals(
                                                                "Antwortanlage"
                                                                        .getBytes(
                                                                                StandardCharsets
                                                                                        .UTF_8),
                                                                openReply(value));
                                                    } catch (Exception failure) {
                                                        throw new AssertionError(failure);
                                                    }
                                                }));
                    }
                    var obsolete = new ReceiverReplyCapture(api, "1.5.0");
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, obsolete));
                    assertEquals(
                            0,
                            obsolete.posts,
                            "Metadata 1.x must fail before any reply announcement");
                    if (!dataSet)
                        for (String xml :
                                List.of(
                                        "<antwort><status>erhalten</status></antwort>",
                                        "<!DOCTYPE antwort><antwort/>")) {
                            var xmlInput =
                                    new ReplyInput(
                                            input.destinationId(),
                                            input.submissionId(),
                                            input.caseId(),
                                            input.schemaUri(),
                                            "application/xml",
                                            xml.getBytes(StandardCharsets.UTF_8),
                                            List.of(),
                                            input.processMessage());
                            var xmlRemote =
                                    new ReceiverReplyCapture(
                                            api, api == ApiVersion.V2 ? "2.0.0" : "3.0.0");
                            var xmlAccess = new ReplyAccess(api, xmlRemote);
                            var xmlAttempt = xmlAccess.prepare(xmlInput, recipient);
                            var xmlResult =
                                    xmlAccess.execute(
                                            xmlAttempt.attemptId(), session, workspace, () -> {});
                            if (xml.startsWith("<!DOCTYPE")) {
                                assertEquals("failed", xmlResult.status());
                                assertEquals(0, xmlRemote.posts);
                            } else {
                                assertEquals("sent", xmlResult.status(), xmlResult.toString());
                                assertArrayEquals(
                                        xmlInput.data(),
                                        openReply(
                                                xmlRemote
                                                        .submitted
                                                        .get("encryptedData")
                                                        .getAsString()));
                            }
                        }
                    session.discardReceived();
                    assertThrows(SessionException.class, () -> session.replyRecipient(DEST, SUB));
                    assertThrows(
                            SessionException.class,
                            () -> session.sendReply(input, workspace, forbidden));
                }
    }
}
