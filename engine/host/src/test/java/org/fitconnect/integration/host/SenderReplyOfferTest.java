package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class SenderReplyOfferTest extends SenderTestSupport {
    @Test
    void bothSdkReplyOffersKeepPrivateKeysNativeAndBindThemToTheActualAnnouncedCase()
            throws Exception {
        try (var adapters = registry()) {
            for (var api : ApiVersion.values()) {
                var remote = new SenderCapture(api.wireValue());
                remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                remote.allowReplies = true;
                var access = new SendAccess(api, remote);
                var attempt = access.prepare(replyInput(api));
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                access)) {
                    assertTrue(
                            session.replyChannels().isEmpty(),
                            "Preparing a send must not generate a private reply key");
                    var outcome =
                            adapters.withSession(
                                    api,
                                    session,
                                    s -> access.execute(attempt.attemptId(), s, workspace));
                    assertEquals("sent", outcome.status());
                    var channel = session.replyChannels().getFirst();
                    assertEquals(UUID.fromString(attempt.attemptId()), channel.attemptId());
                    assertEquals(TARGET, channel.destinationId());
                    assertEquals(api == ApiVersion.V3 ? SOURCE : null, channel.fromDestinationId());
                    assertEquals(CASE, channel.caseId());
                    assertEquals(SUBMISSION, channel.submissionId());
                    assertEquals("bound", channel.status());
                    assertEquals("reply-key:" + attempt.attemptId(), channel.keyId());
                    var metadata =
                            JsonParser.parseString(
                                    new String(
                                            decrypt(
                                                    remote.submitted
                                                            .get("encryptedMetadata")
                                                            .getAsString()),
                                            StandardCharsets.UTF_8));
                    JsonObject offered = findJsonObject(metadata, "kid", channel.keyId());
                    assertNotNull(offered);
                    assertEquals("RSA", offered.get("kty").getAsString());
                    assertEquals("RSA-OAEP-256", offered.get("alg").getAsString());
                    assertEquals(
                            4096,
                            new BigInteger(
                                            1,
                                            Base64.getUrlDecoder()
                                                    .decode(offered.get("n").getAsString()))
                                    .bitLength());
                    assertEquals(
                            BigInteger.valueOf(65537),
                            new BigInteger(
                                    1,
                                    Base64.getUrlDecoder().decode(offered.get("e").getAsString())));
                    assertTrue(
                            offered.getAsJsonArray("key_ops").asList().stream()
                                    .anyMatch(value -> value.getAsString().equals("wrapKey")));
                    for (String field : List.of("d", "p", "q", "dp", "dq", "qi", "oth", "k"))
                        assertFalse(offered.has(field), field);
                    // SDK4's ApiJwk writes an empty x5c property even for its certificate-free
                    // generator.
                    assertTrue(
                            !offered.has("x5c")
                                    || offered.get("x5c").isJsonNull()
                                    || offered.get("x5c").isJsonArray()
                                            && offered.getAsJsonArray("x5c").isEmpty());
                    assertTrue(metadata.toString().contains(REPLY_SCHEMA.toString()));
                    if (api == ApiVersion.V3) {
                        var replySchema =
                                findJsonObject(metadata, "schemaUri", REPLY_SCHEMA.toString());
                        assertNotNull(
                                replySchema,
                                "The reply dataset must contain the independently configured reply schema");
                        assertEquals("application/xml", replySchema.get("mimeType").getAsString());
                        var replyAddress =
                                findJsonObject(metadata, "destinationId", SOURCE.toString());
                        assertNotNull(
                                replyAddress,
                                "Replies must address the original online-service destination");
                        assertEquals(
                                channel.keyId(),
                                replyAddress
                                        .getAsJsonObject("encryptionPublicKey")
                                        .get("kid")
                                        .getAsString());
                    }
                    String publicState = new Gson().toJson(session.replyChannels());
                    assertFalse(publicState.contains("private"));
                    assertFalse(publicState.contains("\"n\""));
                    assertFalse(publicState.contains("synthetic-token"));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    session.completeReplyChannel(
                                            UUID.fromString(attempt.attemptId()),
                                            UUID.randomUUID(),
                                            SUBMISSION,
                                            true));
                    assertEquals(channel, session.replyChannels().getFirst());
                    session.discardKeys();
                    assertEquals(
                            channel,
                            session.replyChannels().getFirst(),
                            "Destination keys and ephemeral reply keys have separate lifetimes");
                    session.close();
                    assertThrows(SessionException.class, session::replyChannels);
                }
            }
        }
    }

    @Test
    void replyKeysAreDiscardedBeforeAnyWriteButRetainedForKnownAndUnknownUncertainCases()
            throws Exception {
        try (var adapters = registry()) {
            for (var api : ApiVersion.values())
                for (String mode : List.of("before-write", "known-case", "lost-announcement")) {
                    var remote = new SenderCapture(api.wireValue());
                    remote.metadata = api == ApiVersion.V2 ? "2.0.0" : "3.0.0";
                    remote.allowReplies = true;
                    remote.omitCertificate = mode.equals("before-write");
                    remote.failUpload = mode.equals("known-case");
                    remote.loseAnnouncement = mode.equals("lost-announcement");
                    var access = new SendAccess(api, remote);
                    var attempt = access.prepare(replyInput(api));
                    try (var session =
                            adapters.openSession(
                                    api,
                                    "id",
                                    "secret",
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    access)) {
                        var result =
                                adapters.withSession(
                                        api,
                                        session,
                                        s -> access.execute(attempt.attemptId(), s, workspace));
                        if (mode.equals("before-write")) {
                            assertEquals("failed", result.status());
                            assertTrue(session.replyChannels().isEmpty());
                            assertEquals(0, remote.posts);
                        } else {
                            assertEquals("uncertain", result.status());
                            assertEquals(1, remote.posts);
                            var channel = session.replyChannels().getFirst();
                            assertEquals(
                                    mode.equals("known-case") ? "bound" : "unresolved",
                                    channel.status());
                            assertEquals(mode.equals("known-case") ? CASE : null, channel.caseId());
                            assertEquals(
                                    mode.equals("known-case") ? SUBMISSION : null,
                                    channel.submissionId());
                            assertThrows(
                                    SessionException.class,
                                    () -> access.execute(attempt.attemptId(), session, workspace));
                            assertEquals(1, session.replyChannels().size());
                        }
                    }
                }
        }
    }

    @Test
    void v3ReplyOfferFailsBeforeAnyWriteWhenTheSourceAdvertisesNoMetadataVersions()
            throws Exception {
        var remote = new SenderCapture("v3");
        remote.allowReplies = true;
        var gate =
                new SendAccess(
                        ApiVersion.V3,
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                return request("GET", url, headers, null).body();
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                if (url.equals(remote.BASE + "/destinations/" + SOURCE))
                                    return new Response(
                                            200,
                                            "{\"destinationId\":\""
                                                    + SOURCE
                                                    + "\",\"type\":\"C\",\"status\":\"active\",\"metadataVersions\":[]}");
                                return remote.request(method, url, headers, body);
                            }
                        });
        try (var adapters = registry();
                var session =
                        adapters.openSession(
                                ApiVersion.V3,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                gate)) {
            var prepared = gate.prepare(replyInput(ApiVersion.V3));
            var result =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> gate.execute(prepared.attemptId(), value, workspace));
            assertEquals("failed", result.status());
            assertEquals("reply_metadata_required", result.error());
            assertEquals(0, remote.posts);
            assertTrue(remote.uploads.isEmpty());
        }
    }
}
