package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ReceiverSdkDiagnosticTest extends ReceiverTestSupport {
    @ParameterizedTest
    @EnumSource(ApiVersion.class)
    void replyChannelMismatchReasonSurvivesTheRealSdkAndEngineFrame(ApiVersion api)
            throws Exception {
        var answerKey = JsonParser.parseString(registration).getAsJsonObject();
        answerKey.remove("x5c");
        answerKey.remove("use");
        answerKey.addProperty("kid", "synthetic-reply");
        var fixture =
                new ReceiverFixture(
                        api,
                        false,
                        false,
                        text ->
                                text.replace(
                                        "\"contentStructure\":",
                                        "\"replyChannel\":{\"fitConnect\":{\"encryptionPublicKey\":"
                                                + answerKey
                                                + ",\"processStandards\":[\"urn:test:answer\"]}},\"contentStructure\":"));
        ResourceExchange remote =
                (url, headers) -> {
                    if (url.contains("/destination-api/") && url.contains("/keys?"))
                        return "{\"keys\":["
                                + registration
                                + "],\"offset\":0,\"count\":1,\"totalCount\":1}";
                    return fixture.get(url, headers);
                };
        try (var registry = registry();
                var content = new ContentStore(workspace);
                var sessions =
                        new SessionManager(
                                registry,
                                (url, body) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                ignored -> remote,
                                content)) {
            String owner =
                    sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                            .sessionId();
            sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
            sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
            var engine = new Engine(registry, sessions);
            byte[] schema =
                    fixture.schemas()
                            .get(ReceiverFixture.SCHEMA)
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
            String handle = content.begin(owner, schema.length).contentId();
            content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
            String schemaDocument =
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
            var frame =
                    command(
                            api,
                            owner,
                            "verify_submission",
                            "destinationId",
                            DEST,
                            "submissionId",
                            SUB,
                            "schemaDocument",
                            schemaDocument);
            var response =
                    JsonParser.parseString(engine.handle(frame.toString())).getAsJsonObject();
            assertFalse(response.get("ok").getAsBoolean(), response.toString());
            assertEquals("verification_failed", response.get("error").getAsString());
            assertTrue(response.has("diagnostics"), response.toString());
            String diagnostics = response.getAsJsonArray("diagnostics").toString();
            if (api == ApiVersion.V2) {
                assertTrue(diagnostics.toLowerCase(Locale.ROOT).contains("reply"), diagnostics);
                assertTrue(diagnostics.toLowerCase(Locale.ROOT).contains("support"), diagnostics);
            } else {
                // SDK4 rejects service selection first when the requested reply channel is not
                // offered.
                assertTrue(diagnostics.contains("No matching service found"), diagnostics);
                assertTrue(diagnostics.contains("METADATA"), diagnostics);
            }
            assertFalse(response.has("result"));
            assertFalse(response.toString().contains(pem));
            assertFalse(response.toString().contains("synthetic-token"));
        }
    }

    @ParameterizedTest
    @EnumSource(ApiVersion.class)
    void invalidEventLogRetainsSdkReasonAndStillReleasesNoContent(ApiVersion api) throws Exception {
        var fixture = new ReceiverFixture(api, false, false);
        var page = JsonParser.parseString(fixture.events).getAsJsonObject();
        var events = page.getAsJsonArray("eventLog");
        String token = events.get(1).getAsString();
        int signature = token.lastIndexOf('.') + 1;
        events.set(
                1,
                new JsonPrimitive(
                        token.substring(0, signature)
                                + (token.charAt(signature) == 'A' ? 'B' : 'A')
                                + token.substring(signature + 1)));
        ResourceExchange remote =
                (url, headers) ->
                        url.contains("/events?") ? page.toString() : fixture.get(url, headers);
        try (var registry = registry();
                var session = open(registry, api)) {
            session.importKey(DEST, "decrypt", pem, List.of(registration));
            try (var source = new ReceiveAccess(api, DEST, SUB, remote)) {
                var failure =
                        assertThrows(
                                SessionException.class,
                                () ->
                                        session.receive(
                                                DEST, SUB, source, workspace, fixture.schemas()));
                assertEquals("verification_failed", failure.code());
                assertFalse(
                        failure.diagnostics().isEmpty(), "The original SDK reason must survive");
                assertTrue(
                        failure.diagnostics().stream()
                                .anyMatch(d -> d.stage().equals("EVENT_LOG")));
                assertNull(failure.getCause());
                assertThrows(SessionException.class, () -> session.receiptEvidence(DEST, SUB));
            }
        }
    }
}
