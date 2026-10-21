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

class ReceiverKeyTest extends ReceiverTestSupport {
    @Test
    void missingOrDiscardedDestinationKeysPreventAnyReceiveRequest() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    ResourceExchange noNetwork =
                            (u, h) -> {
                                fail("No eligible native key must mean no HTTP request");
                                return null;
                            };
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            DEST, SUB, noNetwork, workspace,
                                                            Map.of())));
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            CASE, SUB, noNetwork, workspace,
                                                            Map.of())));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.discardKeys();
                                return null;
                            });
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s ->
                                                    s.receive(
                                                            DEST, SUB, noNetwork, workspace,
                                                            Map.of())));
                }
        }
    }

    @Test
    void testServiceKeysWithoutCertificatesAndOfficialTestIssuersWorkForReceiveAndEventLogs()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                for (String issuer :
                        List.of(
                                "https://test.fit-connect.fitko.dev",
                                "https://submission-api-testing.fit-connect.fitko.dev"))
                    try (var session = open(registry, api)) {
                        session.importKey(DEST, "decrypt", pem, List.of(registration));
                        var fixture = new ReceiverFixture(api, false, false);
                        ResourceExchange remote =
                                (url, headers) -> {
                                    String body = fixture.get(url, headers);
                                    if (url.endsWith("/.well-known/jwks.json")) {
                                        var document =
                                                JsonParser.parseString(body).getAsJsonObject();
                                        for (var key : document.getAsJsonArray("keys")) {
                                            key.getAsJsonObject().remove("x5c");
                                            key.getAsJsonObject().remove("use");
                                        }
                                        return document.toString();
                                    }
                                    if (url.contains("/events?")) {
                                        var page = JsonParser.parseString(body).getAsJsonObject();
                                        var events = page.getAsJsonArray("eventLog");
                                        for (int i = 0; i < events.size(); i++) {
                                            String[] parts =
                                                    events.get(i).getAsString().split("\\.");
                                            var claims =
                                                    JsonParser.parseString(
                                                                    new String(
                                                                            Base64.getUrlDecoder()
                                                                                    .decode(
                                                                                            parts[
                                                                                                    1]),
                                                                            StandardCharsets.UTF_8))
                                                            .getAsJsonObject();
                                            claims.addProperty("iss", issuer);
                                            String payload =
                                                    parts[0]
                                                            + "."
                                                            + b64(
                                                                    claims.toString()
                                                                            .getBytes(
                                                                                    StandardCharsets
                                                                                            .UTF_8));
                                            try {
                                                var signer = Signature.getInstance("RSASSA-PSS");
                                                signer.setParameter(
                                                        new PSSParameterSpec(
                                                                "SHA-512",
                                                                "MGF1",
                                                                MGF1ParameterSpec.SHA512,
                                                                64,
                                                                1));
                                                signer.initSign(privateKey);
                                                signer.update(
                                                        payload.getBytes(
                                                                StandardCharsets.US_ASCII));
                                                events.set(
                                                        i,
                                                        new JsonPrimitive(
                                                                payload
                                                                        + "."
                                                                        + b64(signer.sign())));
                                            } catch (Exception failure) {
                                                throw new AssertionError(failure);
                                            }
                                        }
                                        return page.toString();
                                    }
                                    return body;
                                };
                        try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                            assertArrayEquals(
                                    fixture.data,
                                    session.receive(DEST, SUB, read, workspace, fixture.schemas())
                                            .data());
                        }
                        try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
                            assertEquals(
                                    2,
                                    session.eventLog(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(CASE),
                                                    UUID.fromString(SUB),
                                                    source,
                                                    workspace)
                                            .entries()
                                            .size());
                        }
                    }
        }
    }

    @Test
    void retainedKeysRequireTheExactCurrentRegistrationNotJustItsKid() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(registration));
                                s.discardReceived();
                                return null;
                            });
                    assertEquals(1, session.loadedKeys().size());
                    var changed = JsonParser.parseString(registration).getAsJsonObject();
                    changed.addProperty("alg", "PS512");
                    registry.withSession(
                            api,
                            session,
                            s -> {
                                s.retainKeys(DEST, List.of(changed.toString()));
                                return null;
                            });
                    assertTrue(session.loadedKeys().isEmpty());
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    changed.addProperty("n", "AQAB");
                    assertThrows(
                            SessionException.class,
                            () ->
                                    registry.withSession(
                                            api,
                                            session,
                                            s -> {
                                                s.retainKeys(DEST, List.of(changed.toString()));
                                                return null;
                                            }));
                    assertTrue(session.loadedKeys().isEmpty());
                }
        }
    }
}
