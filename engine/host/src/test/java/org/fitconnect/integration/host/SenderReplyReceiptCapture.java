package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

final class SenderReplyReceiptCapture extends SenderTestSupport implements ResourceExchange {
    final SenderIncomingReplyFixture fixture;
    final PreparedReplyReceipt expected;
    int puts;
    String ackAttack = "";
    boolean wrongCase;

    SenderReplyReceiptCapture(SenderIncomingReplyFixture fixture, PreparedReplyReceipt expected) {
        this.fixture = fixture;
        this.expected = expected;
    }

    public String get(String url, Map<String, String> headers) {
        String result = fixture.get(url, headers);
        return wrongCase && url.endsWith("/replies/" + fixture.replyId)
                ? result.replace(CASE.toString(), UUID.randomUUID().toString())
                : result;
    }

    public Response request(String method, String url, Map<String, String> headers, String body) {
        if (method.equals("GET")) return new Response(200, get(url, headers));
        assertEquals("PUT", method);
        assertEquals(
                "https://test.fit-connect.fitko.dev/submission-api/"
                        + fixture.api.wireValue()
                        + "/replies/"
                        + fixture.replyId
                        + "/"
                        + expected.request().action(),
                url);
        assertEquals(JsonParser.parseString(expected.body()), JsonParser.parseString(body));
        assertTrue(
                headers.entrySet().stream()
                        .anyMatch(
                                item ->
                                        item.getKey().equalsIgnoreCase("Authorization")
                                                && item.getValue()
                                                        .equals("Bearer synthetic-token")));
        assertTrue(
                headers.entrySet().stream()
                        .anyMatch(
                                item ->
                                        item.getKey().equalsIgnoreCase("Content-Type")
                                                && item.getValue().equals("application/json")));
        puts++;
        try {
            if (ackAttack.equals("empty")) return new Response(200, "");
            fixture.replyReceiptPayload = JsonParser.parseString(body).getAsJsonObject();
            fixture.attack = ackAttack;
            if (ackAttack.equals("tags") && fixture.replyReceiptPayload.has("authenticationTags"))
                fixture.replyReceiptPayload
                        .getAsJsonObject("authenticationTags")
                        .addProperty("data", "AAAAAAAAAAAAAAAAAAAAAA");
            String name = expected.request().action() + "-reply";
            if (ackAttack.equals("event-action")
                    || ackAttack.equals("tags") && expected.request().action().equals("reject"))
                name = "create-reply";
            String token = fixture.event(name, null);
            if (ackAttack.equals("signature")) {
                var parts = token.split("\\.");
                parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
                token = String.join(".", parts);
            }
            return new Response(200, token);
        } catch (Exception failure) {
            throw new AssertionError(failure);
        } finally {
            fixture.attack = "";
            fixture.replyReceiptPayload = null;
        }
    }
}
