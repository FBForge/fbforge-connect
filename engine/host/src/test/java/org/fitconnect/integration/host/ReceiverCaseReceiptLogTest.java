package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.security.spec.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiverCaseReceiptLogTest extends ReceiverTestSupport {
    @Test
    void completeCaseVerifiesReceiptsFromDifferentDestinationsAndRejectsTampering()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    String otherDestination = "55555555-5555-4555-8555-555555555555";
                    String reply = "66666666-6666-4666-8666-666666666666";
                    for (String attack : List.of("", "signature", "case", "key")) {
                        var page = JsonParser.parseString(fixture.events).getAsJsonObject();
                        var tokens = page.getAsJsonArray("eventLog");
                        var submitted = claims(tokens.get(1).getAsString());
                        var tags =
                                submitted
                                        .getAsJsonObject("events")
                                        .entrySet()
                                        .iterator()
                                        .next()
                                        .getValue()
                                        .getAsJsonObject()
                                        .getAsJsonObject("authenticationTags");
                        tokens.add(event("create-reply", null, 0, "reply:" + reply, CASE));
                        tokens.add(event("submit-reply", tags, 0, "reply:" + reply, CASE));
                        tokens.add(
                                receipt(
                                        "accept-submission",
                                        tags,
                                        "submission:" + SUB,
                                        DEST,
                                        CASE));
                        String receipt =
                                receipt(
                                        "accept-reply",
                                        tags,
                                        "reply:" + reply,
                                        otherDestination,
                                        attack.equals("case")
                                                ? UUID.randomUUID().toString()
                                                : CASE);
                        if (attack.equals("signature")) {
                            var parts = receipt.split("\\.");
                            parts[2] =
                                    (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
                            receipt = String.join(".", parts);
                        }
                        tokens.add(receipt);
                        page.addProperty("count", tokens.size());
                        page.addProperty("totalCount", tokens.size());
                        try (var source =
                                EventLogAccess.forCase(
                                        api,
                                        CASE,
                                        (url, headers) -> {
                                            if (url.contains("/events?")) return page.toString();
                                            if (url.endsWith("/keys/synthetic-sign")) {
                                                assertTrue(
                                                        url.contains("/destinations/" + DEST + "/")
                                                                || url.contains(
                                                                        "/destinations/"
                                                                                + otherDestination
                                                                                + "/"));
                                                assertTrue(
                                                        headers.keySet().stream()
                                                                .noneMatch(
                                                                        name ->
                                                                                name
                                                                                        .equalsIgnoreCase(
                                                                                                "Authorization")),
                                                        "Public key reads carry no token");
                                                if (attack.equals("key"))
                                                    throw new SessionException("resource_missing");
                                                return signingRegistration("synthetic-sign");
                                            }
                                            assertTrue(
                                                    url.endsWith("/.well-known/jwks.json"),
                                                    "Case verification must not fetch message content");
                                            return fixture.get(url, headers);
                                        })) {
                            if (attack.isEmpty()) {
                                var log =
                                        registry.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.caseEventLog(
                                                                UUID.fromString(CASE),
                                                                source,
                                                                workspace));
                                assertEquals(6, log.entries().size());
                                assertEquals(
                                        otherDestination, log.entries().getLast().event().issuer());
                                assertTrue(session.loadedKeys().isEmpty());
                            } else {
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                registry.withSession(
                                                        api,
                                                        session,
                                                        value ->
                                                                value.caseEventLog(
                                                                        UUID.fromString(CASE),
                                                                        source,
                                                                        workspace)),
                                        api + ": " + attack);
                            }
                        }
                    }
                }
        }
    }

    private static JsonObject claims(String token) {
        return JsonParser.parseString(
                        new String(
                                Base64.getUrlDecoder().decode(token.split("\\.")[1]),
                                StandardCharsets.UTF_8))
                .getAsJsonObject();
    }

    private static String receipt(
            String type, JsonObject tags, String subject, String issuer, String caseId)
            throws Exception {
        var payload = claims(event(type, tags, 0, subject, caseId));
        payload.addProperty("iss", issuer);
        String header =
                b64(
                        "{\"alg\":\"PS512\",\"kid\":\"synthetic-sign\",\"typ\":\"secevent+jwt\"}"
                                .getBytes(StandardCharsets.UTF_8));
        String wire = header + "." + b64(payload.toString().getBytes(StandardCharsets.UTF_8));
        var signer = Signature.getInstance("RSASSA-PSS");
        signer.setParameter(
                new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        signer.initSign(privateKey);
        signer.update(wire.getBytes(StandardCharsets.US_ASCII));
        return wire + "." + b64(signer.sign());
    }
}
