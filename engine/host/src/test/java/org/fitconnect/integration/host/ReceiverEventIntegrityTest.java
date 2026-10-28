package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverEventIntegrityTest extends ReceiverTestSupport {
    @Test
    void sdkEventLogsRejectTamperingForeignSubjectsAmbiguousSubmitAndIncompletePages()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    for (String mode :
                            List.of(
                                    "wrong-subject",
                                    "wrong-subject-type",
                                    "wrong-case",
                                    "wrong-issuer",
                                    "duplicate-id",
                                    "duplicate-submit",
                                    "tampered",
                                    "missing-page",
                                    "empty")) {
                        var page = JsonParser.parseString(fixture.events).getAsJsonObject();
                        var events = page.getAsJsonArray("eventLog");
                        if (mode.equals("empty")) {
                            events = new JsonArray();
                            page.add("eventLog", events);
                            page.addProperty("totalCount", 0);
                        } else if (mode.equals("missing-page")) events.remove(1);
                        else if (mode.equals("duplicate-submit")) {
                            var claims =
                                    JsonParser.parseString(
                                                    new String(
                                                            Base64.getUrlDecoder()
                                                                    .decode(
                                                                            events.get(1)
                                                                                    .getAsString()
                                                                                    .split("\\.")[
                                                                                    1]),
                                                            StandardCharsets.UTF_8))
                                            .getAsJsonObject();
                            events.add(
                                    event(
                                            "submit-submission",
                                            claims.getAsJsonObject("events")
                                                    .getAsJsonObject(
                                                            "https://schema.fitko.de/fit-connect/events/submit-submission")
                                                    .getAsJsonObject("authenticationTags"),
                                            0));
                            page.addProperty("totalCount", 3);
                        } else {
                            String wire = events.get(1).getAsString();
                            if (mode.equals("tampered")) {
                                int at = wire.lastIndexOf('.') + 1;
                                wire =
                                        wire.substring(0, at)
                                                + (wire.charAt(at) == 'A' ? 'B' : 'A')
                                                + wire.substring(at + 1);
                            } else {
                                String[] parts = wire.split("\\.");
                                var claims =
                                        JsonParser.parseString(
                                                        new String(
                                                                Base64.getUrlDecoder()
                                                                        .decode(parts[1]),
                                                                StandardCharsets.UTF_8))
                                                .getAsJsonObject();
                                if (mode.equals("wrong-subject"))
                                    claims.addProperty("sub", "submission:" + ReceiverFixture.ATT);
                                if (mode.equals("wrong-subject-type"))
                                    claims.addProperty("sub", "reply:" + SUB);
                                if (mode.equals("wrong-case"))
                                    claims.addProperty("txn", "case:" + ReceiverFixture.ATT);
                                if (mode.equals("wrong-issuer"))
                                    claims.addProperty(
                                            "iss",
                                            "https://prod.fit-connect.fitko.net/submission-api");
                                if (mode.equals("duplicate-id"))
                                    claims.add(
                                            "jti",
                                            JsonParser.parseString(
                                                            new String(
                                                                    Base64.getUrlDecoder()
                                                                            .decode(
                                                                                    events.get(0)
                                                                                            .getAsString()
                                                                                            .split(
                                                                                                    "\\.")[
                                                                                            1]),
                                                                    StandardCharsets.UTF_8))
                                                    .getAsJsonObject()
                                                    .get("jti"));
                                String payload =
                                        parts[0]
                                                + "."
                                                + b64(
                                                        claims.toString()
                                                                .getBytes(StandardCharsets.UTF_8));
                                var signer = Signature.getInstance("RSASSA-PSS");
                                signer.setParameter(
                                        new PSSParameterSpec(
                                                "SHA-512",
                                                "MGF1",
                                                MGF1ParameterSpec.SHA512,
                                                64,
                                                1));
                                signer.initSign(privateKey);
                                signer.update(payload.getBytes(StandardCharsets.US_ASCII));
                                wire = payload + "." + b64(signer.sign());
                            }
                            events.set(1, new JsonPrimitive(wire));
                        }
                        page.addProperty("count", events.size());
                        String body = page.toString();
                        try (var source =
                                new EventLogAccess(
                                        api,
                                        CASE,
                                        SUB,
                                        (url, headers) ->
                                                url.contains("/events?")
                                                        ? body
                                                        : fixture.get(url, headers))) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.eventLog(
                                                                    UUID.fromString(DEST),
                                                                    UUID.fromString(CASE),
                                                                    UUID.fromString(SUB),
                                                                    source,
                                                                    workspace)),
                                    mode);
                        }
                    }
                }
        }
    }

    @Test
    void bothSdksCollectAndVerifyEveryPageOfALargerEventLog() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    var all =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    for (int i = 0; i < 99; i++) all.add(event("notify-submission", null, 0));
                    var first = new JsonObject();
                    first.addProperty("offset", 0);
                    first.addProperty("count", 100);
                    first.addProperty("totalCount", 101);
                    var firstEvents = new JsonArray();
                    for (int i = 0; i < 100; i++) firstEvents.add(all.get(i));
                    first.add("eventLog", firstEvents);
                    var second = new JsonObject();
                    second.addProperty("offset", 100);
                    second.addProperty("count", 1);
                    second.addProperty("totalCount", 101);
                    var last = new JsonArray();
                    last.add(all.get(100));
                    second.add("eventLog", last);
                    var pages = new AtomicInteger();
                    try (var source =
                            new EventLogAccess(
                                    api,
                                    CASE,
                                    SUB,
                                    (url, headers) -> {
                                        if (!url.contains("/events?"))
                                            return fixture.get(url, headers);
                                        pages.incrementAndGet();
                                        return url.contains("offset=100")
                                                ? second.toString()
                                                : first.toString();
                                    })) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.eventLog(
                                                        UUID.fromString(DEST),
                                                        UUID.fromString(CASE),
                                                        UUID.fromString(SUB),
                                                        source,
                                                        workspace));
                        assertEquals(101, result.entries().size());
                        assertEquals(2, pages.get());
                        assertEquals(
                                99,
                                result.entries().stream()
                                        .filter(e -> e.eventType().endsWith("notify-submission"))
                                        .count());
                    }
                }
        }
    }

    @Test
    void largeEventLogsReuseTrustKeysWithinOneVerificationAndRefreshOnTheNextRead()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    var tokens =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    for (int i = 0; i < 298; i++) tokens.add(event("notify-submission", null, 0));
                    var keys = new AtomicInteger();
                    for (int repeat = 0; repeat < 2; repeat++) {
                        try (var source =
                                new EventLogAccess(
                                        api,
                                        CASE,
                                        SUB,
                                        (url, headers) -> {
                                            if (url.endsWith("/.well-known/jwks.json"))
                                                keys.incrementAndGet();
                                            if (!url.contains("/events?"))
                                                return fixture.get(url, headers);
                                            var params = new HashMap<String, Integer>();
                                            for (String pair :
                                                    java.net
                                                            .URI
                                                            .create(url)
                                                            .getRawQuery()
                                                            .split("&")) {
                                                var parts = pair.split("=");
                                                params.put(parts[0], Integer.parseInt(parts[1]));
                                            }
                                            int offset = params.get("offset"),
                                                    end =
                                                            Math.min(
                                                                    tokens.size(),
                                                                    offset + params.get("limit"));
                                            var page = new JsonObject();
                                            page.addProperty("offset", offset);
                                            page.addProperty("count", end - offset);
                                            page.addProperty("totalCount", tokens.size());
                                            var items = new JsonArray();
                                            for (int i = offset; i < end; i++)
                                                items.add(tokens.get(i));
                                            page.add("eventLog", items);
                                            return page.toString();
                                        })) {
                            assertEquals(
                                    300,
                                    session.eventLog(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(CASE),
                                                    UUID.fromString(SUB),
                                                    source,
                                                    workspace)
                                            .entries()
                                            .size());
                        }
                        assertEquals(
                                repeat + 1,
                                keys.get(),
                                "One key fetch per verification, fresh keys for the next verification");
                    }
                }
        }
    }
}
