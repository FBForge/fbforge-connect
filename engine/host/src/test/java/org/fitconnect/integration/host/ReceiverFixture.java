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

final class ReceiverFixture extends ReceiverTestSupport implements ResourceExchange {
    static final String ATT = "44444444-4444-4444-8444-444444444444";
    static final String SCHEMA = "https://example.invalid/fachdaten.schema.json";
    static final String SERVICE = "urn:de:fim:leika:leistung:99008001014002";
    final ApiVersion api;
    final byte[] data, metadata;
    final String encryptedData, encryptedMetadata, encryptedAttachment, events;

    ReceiverFixture(ApiVersion api, boolean compressed, boolean wrongHash) throws Exception {
        this(api, compressed, wrongHash, s -> s);
    }

    ReceiverFixture(
            ApiVersion api,
            boolean compressed,
            boolean wrongHash,
            java.util.function.UnaryOperator<String> rewrite)
            throws Exception {
        this(api, compressed, wrongHash, rewrite, compressed ? "Erika".repeat(220001) : "Erika");
    }

    ReceiverFixture(
            ApiVersion api,
            boolean compressed,
            boolean wrongHash,
            java.util.function.UnaryOperator<String> rewrite,
            String givenName)
            throws Exception {
        this.api = api;
        data =
                (givenName.startsWith("<") ? givenName : "{\"vorname\":\"" + givenName + "\"}")
                        .getBytes(StandardCharsets.UTF_8);
        metadata =
                rewrite.apply(
                                "{\n  \"$schema\":\"https://schema.fitko.de/fit-connect/metadata/2.0.0/metadata.schema.json\",\n"
                                        + "\"contentStructure\":{\"data\":{\"hash\":{\"type\":\"sha512\",\"content\":\""
                                        + (wrongHash ? "0".repeat(128) : hash(data))
                                        + "\"},\"submissionSchema\":{\"schemaUri\":\""
                                        + SCHEMA
                                        + "\",\"mimeType\":\"application/json\"}},\"attachments\":[{\"attachmentId\":\""
                                        + ATT
                                        + "\",\"hash\":{\"type\":\"sha512\",\"content\":\""
                                        + hash("Testanlage".getBytes(StandardCharsets.UTF_8))
                                        + "\"},\"purpose\":\"form\",\"filename\":\"Anlage.txt\",\"description\":\"Synthetische Beschreibung\",\"mimeType\":\"text/plain\"}]}}")
                        .getBytes(StandardCharsets.UTF_8);
        encryptedData =
                encrypt(
                        data,
                        compressed,
                        givenName.startsWith("<") ? "application/xml" : "application/json");
        encryptedMetadata = encrypt(metadata, compressed);
        encryptedAttachment =
                encrypt("Testanlage".getBytes(StandardCharsets.UTF_8), compressed, "text/plain");
        var tags = new JsonObject();
        tags.addProperty("data", encryptedData.split("\\.")[4]);
        tags.addProperty("metadata", encryptedMetadata.split("\\.")[4]);
        var attachments = new JsonObject();
        attachments.addProperty(ATT, encryptedAttachment.split("\\.")[4]);
        tags.add("attachments", attachments);
        events = eventPage(tags);
    }

    Map<String, String> schemas() {
        return Map.of(
                SCHEMA,
                "{\"type\":\"object\",\"required\":[\"vorname\"],\"properties\":{\"vorname\":{\"type\":\"string\"}},\"additionalProperties\":false}");
    }

    public String get(String url, Map<String, String> headers) {
        String base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
        if (url.equals(base + "/submissions/" + SUB)) {
            var result = new JsonObject();
            result.addProperty("destinationId", DEST);
            result.addProperty("submissionId", SUB);
            result.addProperty("caseId", CASE);
            var ids = new JsonArray();
            ids.add(ATT);
            result.add("attachments", ids);
            result.addProperty("encryptedData", encryptedData);
            result.addProperty("encryptedMetadata", encryptedMetadata);
            var service = new JsonObject();
            service.addProperty("identifier", SERVICE);
            service.addProperty("name", "Synthetischer Antrag");
            result.add("publicService", service);
            result.addProperty("region", "DE000000000000");
            return result.toString();
        }
        if (url.contains("/events?")) return events;
        if (url.equals(base + "/submissions/" + SUB + "/attachments/" + ATT))
            return encryptedAttachment;
        if (url.equals("https://test.fit-connect.fitko.dev/submission-api/.well-known/jwks.json")) {
            assertTrue(
                    headers.keySet().stream().noneMatch(n -> n.equalsIgnoreCase("Authorization")));
            var key = JsonParser.parseString(registration).getAsJsonObject();
            key.addProperty("kid", "synthetic-server");
            key.addProperty("alg", "PS512");
            key.addProperty("use", "sig");
            var ops = new JsonArray();
            ops.add("verify");
            key.add("key_ops", ops);
            var set = new JsonObject();
            var keys = new JsonArray();
            keys.add(key);
            set.add("keys", keys);
            return set.toString();
        }
        if (url.equals(base + "/destinations/" + DEST))
            return "{\"destinationId\":\""
                    + DEST
                    + "\",\"type\":\"A\",\"status\":\"active\",\"encryptionKid\":\"synthetic-decrypt\",\"metadataVersions\":[\"2.0.0\",\"3.0.0\"],\"publicServices\":[{\"identifier\":\""
                    + SERVICE
                    + "\",\"regions\":[\"DE000000000000\"],\"submissionSchemas\":[{\"schemaUri\":\""
                    + SCHEMA
                    + "\",\"mimeType\":\"application/json\"}]}]}";
        throw new AssertionError("Unexpected receiver resource: " + url);
    }
}
