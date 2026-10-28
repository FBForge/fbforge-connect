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

class ReceiverCaseLogTest extends ReceiverTestSupport {
    @Test
    void caseLogsVerifyMultipleSubjectsAndNeverRequireContentOrPrivateKeys() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    var original =
                            JsonParser.parseString(fixture.events)
                                    .getAsJsonObject()
                                    .getAsJsonArray("eventLog");
                    var decoded =
                            JsonParser.parseString(
                                            new String(
                                                    Base64.getUrlDecoder()
                                                            .decode(
                                                                    original.get(1)
                                                                            .getAsString()
                                                                            .split("\\.")[1]),
                                                    StandardCharsets.UTF_8))
                                    .getAsJsonObject();
                    var tags =
                            decoded.getAsJsonObject("events")
                                    .entrySet()
                                    .iterator()
                                    .next()
                                    .getValue()
                                    .getAsJsonObject()
                                    .getAsJsonObject("authenticationTags");
                    String reply = UUID.randomUUID().toString();
                    for (String attack : List.of("", "case", "signature", "subject", "empty")) {
                        var tokens = original.deepCopy();
                        tokens.add(event("create-reply", null, 0, "reply:" + reply, CASE));
                        String token =
                                event(
                                        "submit-reply",
                                        tags,
                                        0,
                                        (attack.equals("subject") ? "submission:" : "reply:")
                                                + reply,
                                        attack.equals("case")
                                                ? UUID.randomUUID().toString()
                                                : CASE);
                        if (attack.equals("signature")) {
                            var parts = token.split("\\.");
                            parts[2] =
                                    (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
                            token = String.join(".", parts);
                        }
                        tokens.add(token);
                        if (attack.equals("empty")) tokens = new JsonArray();
                        var page = new JsonObject();
                        page.addProperty("offset", 0);
                        page.addProperty("count", tokens.size());
                        page.addProperty("totalCount", tokens.size());
                        page.add("eventLog", tokens);
                        try (var source =
                                EventLogAccess.forCase(
                                        api,
                                        CASE,
                                        (url, headers) -> {
                                            if (url.contains("/events?")) return page.toString();
                                            assertTrue(
                                                    url.contains("/keys/")
                                                            || url.endsWith(
                                                                    "/.well-known/jwks.json"),
                                                    "Case logs must not read content");
                                            return fixture.get(url, headers);
                                        })) {
                            if (attack.isEmpty() || attack.equals("empty")) {
                                var log =
                                        registry.withSession(
                                                api,
                                                session,
                                                value ->
                                                        value.caseEventLog(
                                                                UUID.fromString(CASE),
                                                                source,
                                                                workspace));
                                assertEquals(attack.isEmpty() ? 4 : 0, log.entries().size());
                                if (attack.isEmpty()) {
                                    assertEquals(
                                            "submission", log.entries().getFirst().subjectType());
                                    assertEquals("reply", log.entries().getLast().subjectType());
                                    assertEquals(
                                            UUID.fromString(reply),
                                            log.entries().getLast().subjectId());
                                }
                            } else
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

    @Test
    void bothSdksVerifyEventLogsWithoutPrivateKeysOrSubmissionContent() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    var fixture = new ReceiverFixture(api, false, false);
                    var contentReads = new AtomicInteger();
                    ResourceExchange remote =
                            (url, headers) -> {
                                if (url.endsWith("/submissions/" + SUB)) {
                                    contentReads.incrementAndGet();
                                    throw new SessionException("resource_missing");
                                }
                                return fixture.get(url, headers);
                            };
                    try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
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
                        assertEquals(2, result.entries().size());
                        assertEquals(UUID.fromString(SUB), result.submissionId());
                        assertEquals(
                                List.of("CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED"),
                                result.warnings());
                        assertTrue(
                                result.entries()
                                        .get(1)
                                        .claimsJson()
                                        .contains("authenticationTags"));
                        assertTrue(result.entries().get(1).headerJson().contains("PS512"));
                        assertEquals(0, contentReads.get());
                        assertTrue(
                                registry.withSession(api, session, s -> s.loadedKeys()).isEmpty());
                    }
                }
        }
    }

    @Test
    void sdkWrappingDoesNotHideReadFailuresDuringReceiveOrEventLogVerification() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    var fixture = new ReceiverFixture(api, false, false);
                    for (String code :
                            List.of(
                                    "resource_denied",
                                    "resource_missing",
                                    "resource_unavailable",
                                    "endpoint_blocked"))
                        for (String failedPath : List.of("/events?", "/.well-known/jwks.json")) {
                            ResourceExchange remote =
                                    (url, headers) -> {
                                        if (url.contains(failedPath))
                                            throw new SessionException(code);
                                        return fixture.get(url, headers);
                                    };
                            try (var read = new ReceiveAccess(api, DEST, SUB, remote)) {
                                assertEquals(
                                        code,
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                session.receive(
                                                                        DEST,
                                                                        SUB,
                                                                        read,
                                                                        workspace,
                                                                        fixture.schemas()))
                                                .code(),
                                        api + " receive");
                                assertThrows(
                                        SessionException.class,
                                        () -> session.receiptEvidence(DEST, SUB));
                            }
                            try (var source = new EventLogAccess(api, CASE, SUB, remote)) {
                                assertEquals(
                                        code,
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                session.eventLog(
                                                                        UUID.fromString(DEST),
                                                                        UUID.fromString(CASE),
                                                                        UUID.fromString(SUB),
                                                                        source,
                                                                        workspace))
                                                .code(),
                                        api + " events");
                            }
                        }
                }
        }
    }
}
