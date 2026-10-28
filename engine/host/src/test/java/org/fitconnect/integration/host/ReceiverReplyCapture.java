package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

final class ReceiverReplyCapture extends ReceiverTestSupport implements ResourceExchange {
    static final String REPLY = "55555555-5555-4555-8555-555555555555",
            ONLINE = "66666666-6666-4666-8666-666666666666";
    final ApiVersion api;
    final String metadataVersion;
    final List<String> calls = new ArrayList<>();
    final Map<String, String> uploads = new LinkedHashMap<>();
    Set<String> announced = Set.of();
    int posts;
    JsonObject submitted;

    ReceiverReplyCapture(ApiVersion api, String metadataVersion) {
        this.api = api;
        this.metadataVersion = metadataVersion;
    }

    public String get(String url, Map<String, String> headers) {
        throw new AssertionError("SDK must use request");
    }

    public Response request(String method, String url, Map<String, String> headers, String body) {
        String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
        calls.add(method + " " + url);
        assertEquals(url, SendHttpTransport.allowedReply(api, method, url).toString());
        assertTrue(
                url.startsWith(base + "/")
                        || url.equals(
                                "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/"
                                        + DEST),
                url);
        if (method.equals("GET")) {
            if (url.equals(base + "/cases?offset=0&limit=1"))
                return new Response(
                        200, "{\"cases\":[],\"offset\":0,\"count\":0,\"totalCount\":0}");
            if (url.equals(base + "/cases/" + CASE))
                return new Response(
                        200,
                        "{\"caseId\":\""
                                + CASE
                                + "\",\"destinationId\":\""
                                + DEST
                                + "\",\"fromDestinationId\":\""
                                + ONLINE
                                + "\"}");
            if (url.contains("/destinations/") && !url.endsWith("/limits")) {
                String id = url.substring(url.lastIndexOf('/') + 1);
                assertTrue(Set.of(DEST, ONLINE).contains(id));
                return new Response(
                        200,
                        "{\"destinationId\":\""
                                + id
                                + "\",\"type\":\""
                                + (id.equals(DEST) ? "A" : "B")
                                + "\",\"status\":\"active\",\"metadataVersions\":[\""
                                + metadataVersion
                                + "\"],\"publicServices\":[]}");
            }
            if (url.equals(base + "/cases/" + CASE + "/limits"))
                return new Response(
                        200, "{\"attachments\":{\"reply\":{\"applicable\":" + limits() + "}}}");
            if (url.equals(base + "/limits/" + DEST + "/" + ONLINE))
                return new Response(200, "{\"attachments\":{\"applicable\":" + limits() + "}}");
        }
        if (method.equals("POST") && url.equals(base + "/replies")) {
            posts++;
            var value = JsonParser.parseString(body).getAsJsonObject();
            assertEquals(CASE, value.get("caseId").getAsString());
            if (api == ApiVersion.V3) {
                assertEquals(DEST, value.get("fromDestinationId").getAsString());
                assertTrue(
                        !value.has("processMessage") || value.get("processMessage").isJsonNull(),
                        "Normal reply must not invent an unoffered process message");
            }
            var ids = new HashSet<String>();
            for (var id : value.getAsJsonArray("announcedAttachments"))
                assertTrue(ids.add(id.getAsString()));
            announced = Set.copyOf(ids);
            return new Response(201, result());
        }
        if (method.equals("PUT") && url.startsWith(base + "/replies/" + REPLY + "/attachments/")) {
            String id = url.substring(url.lastIndexOf('/') + 1);
            assertTrue(announced.contains(id));
            assertNull(uploads.put(id, body));
            return new Response(204, "");
        }
        if (method.equals("PUT") && url.equals(base + "/replies/" + REPLY)) {
            assertNull(submitted);
            submitted = JsonParser.parseString(body).getAsJsonObject();
            return new Response(200, result());
        }
        throw new AssertionError("Unexpected reply SDK request: " + method + " " + url);
    }

    String result() {
        return "{\"replyId\":\""
                + REPLY
                + "\",\"caseId\":\""
                + CASE
                + "\",\"fromDestinationId\":\""
                + DEST
                + "\",\"attachments\":[]}";
    }

    String limits() {
        return "{\"maxNumber\":40,\"maxSizeIndividualBytes\":33554432,\"maxSizeAggregateBytes\":67108864}";
    }
}
