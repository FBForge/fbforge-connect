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

final class ReceiverFragmentFixture extends ReceiverTestSupport implements ResourceExchange {
    static final String FIRST = "55555555-5555-4555-8555-555555555555",
            SECOND = "66666666-6666-4666-8666-666666666666";
    final ReceiverFixture parent;
    final String first, second, events;
    final AtomicInteger downloads = new AtomicInteger();

    ReceiverFragmentFixture(ApiVersion api, String filename) throws Exception {
        parent =
                new ReceiverFixture(
                        api,
                        false,
                        false,
                        text ->
                                text.replace(
                                        "\"filename\":\"Anlage.txt\"",
                                        "\"filename\":\""
                                                + filename
                                                + "\",\"fragments\":[\""
                                                + FIRST
                                                + "\",\""
                                                + SECOND
                                                + "\"]"));
        first = encrypt("Test".getBytes(StandardCharsets.UTF_8), false);
        second = encrypt("anlage".getBytes(StandardCharsets.UTF_8), false);
        var tags = new JsonObject();
        tags.addProperty("metadata", parent.encryptedMetadata.split("\\.")[4]);
        tags.addProperty("data", parent.encryptedData.split("\\.")[4]);
        var fragments = new JsonObject();
        fragments.addProperty(FIRST, first.split("\\.")[4]);
        fragments.addProperty(SECOND, second.split("\\.")[4]);
        tags.add("attachments", fragments);
        events = eventPage(tags);
    }

    public String get(String url, Map<String, String> headers) {
        if (url.endsWith("/attachments/" + FIRST)) {
            downloads.incrementAndGet();
            return first;
        }
        if (url.endsWith("/attachments/" + SECOND)) {
            downloads.incrementAndGet();
            return second;
        }
        if (url.contains("/events?")) return events;
        String result = parent.get(url, headers);
        if (url.endsWith("/submissions/" + SUB)) {
            var body = JsonParser.parseString(result).getAsJsonObject();
            var ids = new JsonArray();
            ids.add(FIRST);
            ids.add(SECOND);
            body.add("attachments", ids);
            return body.toString();
        }
        return result;
    }
}
