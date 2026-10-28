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

final class SenderCapture extends SenderTestSupport implements ResourceExchange {
    final String BASE;

    SenderCapture() {
        this("v3");
    }

    SenderCapture(String version) {
        BASE = "https://test.fit-connect.fitko.dev/submission-api/" + version;
    }

    int posts;
    int uploadAttempts;
    boolean failUpload;
    boolean loseAnnouncement;
    boolean omitCertificate;
    boolean denySource;
    boolean countOnly;
    long encryptedCharacters;
    int maxUploadBytes;
    int wireChecksum;
    String metadata = "3.0.0";
    String dataMimeType = "application/json";
    boolean offerService = true;
    boolean allowReplies;
    JsonObject announce, submitted;
    ResourceExchange incoming;
    final Map<String, String> uploads = new HashMap<>();

    public String get(String url, Map<String, String> headers) {
        return request("GET", url, headers, null).body();
    }

    public Response request(String method, String url, Map<String, String> headers, String body) {
        if (incoming != null
                && method.equals("GET")
                && (url.contains("/replies/")
                        || url.contains("/events?")
                        || url.endsWith("/cases/" + CASE)
                        || url.endsWith("/.well-known/jwks.json")))
            return new Response(200, incoming.get(url, headers));
        if (url.equals(
                "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/" + SOURCE)) {
            if (denySource) return new Response(403, "{}");
            assertEquals("GET", method);
            assertEquals(
                    "Bearer synthetic-token",
                    headers.entrySet().stream()
                            .filter(e -> e.getKey().equalsIgnoreCase("Authorization"))
                            .map(Map.Entry::getValue)
                            .findFirst()
                            .orElse(null));
            return new Response(200, "{\"destinationId\":\"" + SOURCE + "\"}");
        }
        assertTrue(url.startsWith(BASE + "/"), "Every SDK resource call stays on TEST/v3");
        if (method.equals("GET")) {
            headers.entrySet().stream()
                    .filter(e -> e.getKey().equalsIgnoreCase("Authorization"))
                    .forEach(e -> assertEquals("Bearer synthetic-token", e.getValue()));
            if (url.equals(BASE + "/cases?offset=0&limit=1"))
                return new Response(
                        200, "{\"offset\":0,\"totalCount\":0,\"count\":0,\"cases\":[]}");
            if (url.equals(BASE + "/destinations/" + SOURCE))
                return new Response(
                        200,
                        "{\"destinationId\":\""
                                + SOURCE
                                + "\",\"type\":\"C\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\",\"3.0.0\"]}");
            if (url.equals(BASE + "/destinations/" + TARGET))
                return new Response(
                        200,
                        "{\"destinationId\":\""
                                + TARGET
                                + "\",\"type\":\"A\",\"status\":\"active\",\"encryptionKid\":\"synthetic-encrypt\",\"metadataVersions\":[\""
                                + metadata
                                + "\"],\"publicServices\":"
                                + (offerService
                                        ? "[{\"identifier\":\""
                                                + SERVICE
                                                + "\",\"regions\":[\"DE000000000000\"],\"submissionSchemas\":[{\"schemaUri\":\""
                                                + SCHEMA
                                                + "\",\"mimeType\":\""
                                                + dataMimeType
                                                + "\"}]"
                                                + (allowReplies
                                                        ? ",\"replyChannels\":{\"fitConnect\":{\"processStandards\":[\""
                                                                + REPLY_SCHEMA
                                                                + "\"]}}"
                                                        : "")
                                                + "}]"
                                        : "[]")
                                + ",\"processMessages\":[{\"processModelId\":\"urn:test:process\",\"messageId\":\"request\",\"regions\":[\"DE000000000000\"],\"schemas\":[{\"schemaUri\":\""
                                + SCHEMA
                                + "\",\"mimeType\":\"application/json\"}]}]}");
            if (url.equals(BASE + "/destinations/" + TARGET + "/keys/synthetic-encrypt")) {
                var key = publicKey.deepCopy();
                if (omitCertificate) key.remove("x5c");
                return new Response(200, key.toString());
            }
            if (BASE.endsWith("v2")) {
                assertEquals(BASE + "/destinations/" + TARGET + "/limits", url);
                return new Response(
                        200,
                        "{\"attachments\":{\"submission\":{\"applicable\":" + limits() + "}}}");
            }
            assertEquals(BASE + "/limits/" + SOURCE + "/" + TARGET, url);
            return new Response(200, "{\"attachments\":{\"applicable\":" + limits() + "}}");
        }
        assertEquals(
                "Bearer synthetic-token",
                headers.entrySet().stream()
                        .filter(e -> e.getKey().equalsIgnoreCase("Authorization"))
                        .map(Map.Entry::getValue)
                        .findFirst()
                        .orElse(null));
        if (method.equals("POST")) {
            assertEquals(BASE + "/submissions", url);
            posts++;
            announce = JsonParser.parseString(body).getAsJsonObject();
            if (loseAnnouncement) throw new SessionException("resource_unavailable");
            return new Response(201, response());
        }
        assertEquals("PUT", method);
        if (url.contains("/attachments/")) {
            uploadAttempts++;
            assertTrue(
                    announce.getAsJsonArray("announcedAttachments").asList().stream()
                            .anyMatch(
                                    id ->
                                            url.equals(
                                                    BASE
                                                            + "/submissions/"
                                                            + SUBMISSION
                                                            + "/attachments/"
                                                            + id.getAsString())));
            if (failUpload) throw new SessionException("resource_unavailable");
            if (countOnly) {
                encryptedCharacters += body.length();
                byte[] wire =
                        body.getBytes(
                                StandardCharsets
                                        .UTF_8); // Account for the native HTTP byte allocation.
                maxUploadBytes = Math.max(maxUploadBytes, wire.length);
                if (wire.length > 8 * 1024 * 1024) throw new SessionException("invalid_submission");
                wireChecksum ^= Arrays.hashCode(wire);
            } else uploads.put(url, body);
            return new Response(204, "");
        }
        assertEquals(BASE + "/submissions/" + SUBMISSION, url);
        if (countOnly) wireChecksum ^= Arrays.hashCode(body.getBytes(StandardCharsets.UTF_8));
        else submitted = JsonParser.parseString(body).getAsJsonObject();
        return new Response(200, response());
    }

    String response() {
        var response = new JsonObject();
        response.addProperty("destinationId", TARGET.toString());
        response.addProperty("fromDestinationId", SOURCE.toString());
        response.addProperty("submissionId", SUBMISSION.toString());
        response.addProperty("caseId", CASE.toString());
        response.add("attachments", announce.get("announcedAttachments"));
        return response.toString();
    }

    String limits() {
        return "{\"maxNumber\":40,\"maxSizeIndividualBytes\":"
                + (countOnly ? 8388608 : 33554432)
                + ",\"maxSizeAggregateBytes\":"
                + (countOnly ? 134217728 : 67108864)
                + "}";
    }
}
