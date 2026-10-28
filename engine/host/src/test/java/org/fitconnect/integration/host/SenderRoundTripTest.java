package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderRoundTripTest extends SenderTestSupport {
    @Test
    void v3SdkSendsServiceAndProcessMessagesWithAuthenticatedEncryptedContent() throws Exception {
        try (var adapters = registry()) {
            for (var process :
                    Arrays.asList(
                            null,
                            new SubmissionInput.ProcessMessage("urn:test:process", "request"))) {
                var exchange = new SenderCapture();
                try (var session =
                        adapters.openSession(
                                ApiVersion.V3,
                                "synthetic-id",
                                "synthetic-secret",
                                (url, body) ->
                                        "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}",
                                exchange)) {
                    var result =
                            adapters.withSession(
                                    ApiVersion.V3,
                                    session,
                                    s ->
                                            s.send(
                                                    input(process, process == null ? null : CASE),
                                                    workspace));
                    assertEquals(new SendResult(TARGET, SOURCE, SUBMISSION, CASE), result);
                    assertEquals(1, exchange.posts);
                    assertEquals(
                            SOURCE.toString(),
                            exchange.announce.get("fromDestinationId").getAsString());
                    assertEquals(
                            TARGET.toString(),
                            exchange.announce.get("destinationId").getAsString());
                    assertEquals(1, exchange.uploads.size());
                    assertArrayEquals(
                            DATA, decrypt(exchange.submitted.get("encryptedData").getAsString()));
                    var metadata =
                            JsonParser.parseString(
                                            new String(
                                                    decrypt(
                                                            exchange.submitted
                                                                    .get("encryptedMetadata")
                                                                    .getAsString()),
                                                    StandardCharsets.UTF_8))
                                    .getAsJsonObject();
                    assertTrue(metadata.get("$schema").getAsString().contains("/3.0.0/"));
                    String metadataText = metadata.toString();
                    assertTrue(metadataText.contains("Synthetische Beschreibung"));
                    assertTrue(metadataText.contains("Anlage.txt"));
                    assertTrue(metadataText.contains(SCHEMA.toString()));
                    assertDataHash(metadata);
                    assertArrayEquals(
                            "Testanlage".getBytes(StandardCharsets.UTF_8),
                            decrypt(exchange.uploads.values().iterator().next()));
                    if (process != null) {
                        assertEquals(
                                "request",
                                exchange.announce
                                        .getAsJsonObject("processMessage")
                                        .get("messageId")
                                        .getAsString());
                        assertEquals(
                                CASE.toString(),
                                exchange.announce
                                        .getAsJsonObject("case")
                                        .get("caseId")
                                        .getAsString());
                    } else {
                        assertEquals(
                                SERVICE,
                                exchange.announce
                                        .getAsJsonObject("publicService")
                                        .get("identifier")
                                        .getAsString());
                        assertTrue(
                                !exchange.announce.has("case")
                                        || exchange.announce.get("case").isJsonNull(),
                                "A normal service submission opens its case implicitly; case.publicService is legal only for a process message");
                    }
                }
            }
        }
    }

    @Test
    void sentSubmissionsCanBeReceivedAndVerifiedByBothSdkAdapters() throws Exception {
        try (var adapters = registry()) {
            for (ApiVersion sending : ApiVersion.values())
                for (boolean processReply :
                        sending == ApiVersion.V3 ? List.of(false, true) : List.of(false)) {
                    var remote = new SenderCapture(sending.wireValue());
                    remote.metadata = processReply ? "3.0.0" : "2.0.0";
                    remote.allowReplies = true;
                    var gate = new SendAccess(sending, remote);
                    var original = input(null, null);
                    var input =
                            new SubmissionInput(
                                    sending == ApiVersion.V3 ? SOURCE : null,
                                    TARGET,
                                    SERVICE,
                                    original.serviceName(),
                                    original.region(),
                                    SCHEMA,
                                    original.mimeType(),
                                    DATA,
                                    original.attachments(),
                                    null,
                                    null,
                                    new SubmissionInput.ReplyOffer(
                                            REPLY_SCHEMA,
                                            "application/json",
                                            processReply
                                                    ? List.of(
                                                            new SubmissionInput.ProcessMessage(
                                                                    "urn:test:process",
                                                                    "supplement"))
                                                    : List.of()));
                    try (var sender =
                            adapters.openSession(
                                    sending,
                                    "id",
                                    "secret",
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    gate)) {
                        var attempt = gate.prepare(input);
                        assertEquals(
                                "sent",
                                gate.execute(attempt.attemptId(), sender, workspace).status());
                        var envelope = JsonParser.parseString(remote.response()).getAsJsonObject();
                        remote.submitted
                                .entrySet()
                                .forEach(entry -> envelope.add(entry.getKey(), entry.getValue()));
                        envelope.add("publicService", remote.announce.get("publicService"));
                        envelope.addProperty("region", input.region());
                        var tags = new JsonObject();
                        tags.addProperty(
                                "metadata",
                                SenderIncomingReplyFixture.tag(
                                        remote.submitted.get("encryptedMetadata").getAsString()));
                        tags.addProperty(
                                "data",
                                SenderIncomingReplyFixture.tag(
                                        remote.submitted.get("encryptedData").getAsString()));
                        var attachments = new JsonObject();
                        remote.uploads.forEach(
                                (url, wire) ->
                                        attachments.addProperty(
                                                url.substring(url.lastIndexOf('/') + 1),
                                                SenderIncomingReplyFixture.tag(wire)));
                        tags.add("attachments", attachments);
                        var events = new JsonArray();
                        events.add(submissionEvent("create-submission", null));
                        events.add(submissionEvent("submit-submission", tags));
                        String eventPage =
                                "{\"offset\":0,\"count\":2,\"totalCount\":2,\"eventLog\":"
                                        + events
                                        + "}";
                        for (ApiVersion receiving : ApiVersion.values()) {
                            if (processReply && receiving == ApiVersion.V2) continue;
                            String base =
                                    "https://test.fit-connect.fitko.dev/submission-api/"
                                            + receiving.wireValue();
                            ResourceExchange read =
                                    (url, headers) -> {
                                        if (url.equals(base + "/submissions/" + SUBMISSION))
                                            return envelope.toString();
                                        if (url.contains("/events?")) return eventPage;
                                        if (url.endsWith("/.well-known/jwks.json")) {
                                            var server = publicKey.deepCopy();
                                            server.addProperty("kid", "synthetic-server");
                                            server.addProperty("alg", "PS512");
                                            server.remove("x5c");
                                            server.remove("use");
                                            var ops = new JsonArray();
                                            ops.add("verify");
                                            server.add("key_ops", ops);
                                            return "{\"keys\":[" + server + "]}";
                                        }
                                        if (url.contains("/attachments/"))
                                            return remote.uploads.get(
                                                    url.replace(base, remote.BASE));
                                        return remote.get(url.replace(base, remote.BASE), headers);
                                    };
                            try (var receiver =
                                    adapters.openSession(
                                            receiving,
                                            "id",
                                            "secret",
                                            (u, b) ->
                                                    "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                            read)) {
                                String pem =
                                        "-----BEGIN PRIVATE KEY-----\n"
                                                + Base64.getEncoder()
                                                        .encodeToString(privateKey.getEncoded())
                                                + "\n-----END PRIVATE KEY-----";
                                receiver.importKey(
                                        TARGET.toString(),
                                        "decrypt",
                                        pem,
                                        List.of(publicKey.toString()));
                                try (var scope =
                                        new ReceiveAccess(
                                                receiving,
                                                TARGET.toString(),
                                                SUBMISSION.toString(),
                                                read)) {
                                    var result =
                                            adapters.withSession(
                                                    receiving,
                                                    receiver,
                                                    session ->
                                                            session.receive(
                                                                    TARGET.toString(),
                                                                    SUBMISSION.toString(),
                                                                    scope,
                                                                    workspace,
                                                                    Map.of(
                                                                            SCHEMA.toString(),
                                                                            "{\"type\":\"object\"}")));
                                    assertArrayEquals(
                                            DATA, result.data(), sending + " -> " + receiving);
                                    assertArrayEquals(
                                            input.attachments().getFirst().data(),
                                            result.attachments().getFirst().bytes());
                                    assertEquals(
                                            "Anlage.txt",
                                            result.attachments().getFirst().fileName());
                                    exerciseReplyRoundtrip(
                                            adapters,
                                            sending,
                                            sender,
                                            receiving,
                                            receiver,
                                            remote,
                                            processReply);
                                }
                            }
                        }
                    }
                }
        }
    }

    @Test
    void v2SdkUsesMetadataTwoAndImplicitSenderWithEncryptedAttachments() throws Exception {
        try (var adapters = registry()) {
            var exchange = new SenderCapture("v2");
            exchange.metadata = "2.0.0";
            try (var session =
                    adapters.openSession(
                            ApiVersion.V2,
                            "id",
                            "secret",
                            (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                            exchange)) {
                var original = input(null, null);
                var request =
                        new SubmissionInput(
                                null,
                                TARGET,
                                SERVICE,
                                original.serviceName(),
                                original.region(),
                                SCHEMA,
                                "application/json",
                                DATA,
                                original.attachments(),
                                null,
                                null);
                assertEquals(
                        new SendResult(TARGET, null, SUBMISSION, CASE),
                        adapters.withSession(
                                ApiVersion.V2, session, s -> s.send(request, workspace)));
                assertEquals(1, exchange.posts);
                assertFalse(exchange.announce.has("fromDestinationId"));
                assertEquals(
                        SERVICE,
                        exchange.announce
                                .getAsJsonObject("publicService")
                                .get("identifier")
                                .getAsString());
                assertArrayEquals(
                        DATA, decrypt(exchange.submitted.get("encryptedData").getAsString()));
                var metadata =
                        JsonParser.parseString(
                                        new String(
                                                decrypt(
                                                        exchange.submitted
                                                                .get("encryptedMetadata")
                                                                .getAsString()),
                                                StandardCharsets.UTF_8))
                                .getAsJsonObject();
                assertTrue(metadata.get("$schema").getAsString().contains("/2.0.0/"));
                assertTrue(metadata.toString().contains("Synthetische Beschreibung"));
                assertDataHash(metadata);
                assertEquals(1, exchange.uploads.size());
                assertArrayEquals(
                        "Testanlage".getBytes(StandardCharsets.UTF_8),
                        decrypt(exchange.uploads.values().iterator().next()));
            }
        }
    }
}
