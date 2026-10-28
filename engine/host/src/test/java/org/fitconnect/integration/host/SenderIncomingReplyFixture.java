package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

final class SenderIncomingReplyFixture extends SenderTestSupport implements ResourceExchange {
    final ApiVersion api;
    final UUID replyId = UUID.fromString("66666666-6666-4666-8666-666666666666"),
            attachmentId = UUID.fromString("77777777-7777-4777-8777-777777777777");
    final JsonObject key;
    final byte[] data, attachment = "Testantwort".getBytes(StandardCharsets.UTF_8), metadata;
    final boolean metadata3;
    final String encryptedData,
            encryptedMetadata,
            encryptedAttachment,
            otherSchemaMetadata,
            otherMimeMetadata;
    String attack = "";
    JsonObject sdkReply;
    Map<String, String> sdkUploads;
    JsonObject replyReceiptPayload;

    SenderIncomingReplyFixture(ApiVersion api, JsonObject key, String mime, boolean metadata3)
            throws Exception {
        this.api = api;
        this.key = key;
        this.metadata3 = metadata3;
        data =
                (mime.equals("application/xml")
                                ? "<antwort><vorname>Erika</vorname></antwort>"
                                : "{\"vorname\":\"Erika\"}")
                        .getBytes(StandardCharsets.UTF_8);
        metadata = metadata(REPLY_SCHEMA.toString(), mime);
        encryptedData = seal(data);
        encryptedMetadata = seal(metadata);
        encryptedAttachment = seal(attachment);
        otherSchemaMetadata = seal(metadata("urn:test:other", mime));
        otherMimeMetadata =
                seal(
                        metadata(
                                REPLY_SCHEMA.toString(),
                                mime.equals("application/json")
                                        ? "application/xml"
                                        : "application/json"));
    }

    byte[] metadata(String schema, String mime) throws Exception {
        return ("{\"$schema\":\"https://schema.fitko.de/fit-connect/metadata/"
                        + (metadata3 ? "3.0.0" : "2.0.0")
                        + "/metadata.schema.json\",\"contentStructure\":{\"data\":{\"hash\":{\"type\":\"sha512\",\"content\":\""
                        + digest(data)
                        + "\"},\"submissionSchema\":{\"schemaUri\":\""
                        + schema
                        + "\",\"mimeType\":\""
                        + mime
                        + "\"}},\"attachments\":[{\"attachmentId\":\""
                        + attachmentId
                        + "\",\"hash\":{\"type\":\"sha512\",\"content\":\""
                        + digest(attachment)
                        + "\"},\"purpose\":\"form\",\"filename\":\"Antwort.txt\",\"description\":\"Synthetische Antwortanlage\",\"mimeType\":\"text/plain\"}]}}")
                .getBytes(StandardCharsets.UTF_8);
    }

    Map<String, String> schemas() {
        return Map.of(
                REPLY_SCHEMA.toString(),
                new String(data, StandardCharsets.UTF_8).startsWith("<")
                        ? "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"antwort\"><xs:complexType><xs:sequence><xs:element name=\"vorname\" type=\"xs:string\"/></xs:sequence></xs:complexType></xs:element></xs:schema>"
                        : "{\"type\":\"object\",\"required\":[\"vorname\"]}",
                "urn:test:other",
                "{\"type\":\"object\"}");
    }

    static String digest(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(bytes));
    }

    static String tag(String wire) {
        return wire.substring(wire.lastIndexOf('.') + 1);
    }

    String seal(byte[] bytes) throws Exception {
        var header = new JsonObject();
        header.addProperty("alg", "RSA-OAEP-256");
        header.addProperty("enc", "A256GCM");
        header.addProperty("kid", key.get("kid").getAsString());
        String protectedHeader =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(header.toString().getBytes(StandardCharsets.UTF_8));
        byte[] aesKey = new byte[32], iv = new byte[12];
        var random = new SecureRandom();
        random.nextBytes(aesKey);
        random.nextBytes(iv);
        var aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(
                Cipher.ENCRYPT_MODE,
                new SecretKeySpec(aesKey, "AES"),
                new GCMParameterSpec(128, iv));
        aes.updateAAD(protectedHeader.getBytes(StandardCharsets.US_ASCII));
        byte[] sealed = aes.doFinal(bytes);
        var rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(
                Cipher.ENCRYPT_MODE,
                KeyFactory.getInstance("RSA")
                        .generatePublic(
                                new RSAPublicKeySpec(
                                        new BigInteger(
                                                1,
                                                Base64.getUrlDecoder()
                                                        .decode(key.get("n").getAsString())),
                                        new BigInteger(
                                                1,
                                                Base64.getUrlDecoder()
                                                        .decode(key.get("e").getAsString())))),
                new OAEPParameterSpec(
                        "SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        var b64 = Base64.getUrlEncoder().withoutPadding();
        return protectedHeader
                + "."
                + b64.encodeToString(rsa.doFinal(aesKey))
                + "."
                + b64.encodeToString(iv)
                + "."
                + b64.encodeToString(Arrays.copyOf(sealed, sealed.length - 16))
                + "."
                + b64.encodeToString(Arrays.copyOfRange(sealed, sealed.length - 16, sealed.length));
    }

    public String get(String url, Map<String, String> headers) {
        try {
            var base = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue();
            if (sdkReply != null && url.endsWith("/replies/" + replyId)) return sdkReply.toString();
            if (sdkUploads != null && url.contains("/attachments/"))
                return sdkUploads.get(url.substring(url.lastIndexOf('/') + 1));
            String meta =
                    sdkReply != null
                            ? sdkReply.get("encryptedMetadata").getAsString()
                            : attack.equals("schema")
                                    ? otherSchemaMetadata
                                    : attack.equals("mime") ? otherMimeMetadata : encryptedMetadata;
            if (url.endsWith("/replies/" + replyId)) {
                var envelope = new JsonObject();
                envelope.addProperty("replyId", replyId.toString());
                envelope.addProperty("caseId", CASE.toString());
                envelope.addProperty("fromDestinationId", TARGET.toString());
                var ids = new JsonArray();
                ids.add(attachmentId.toString());
                envelope.add("attachments", ids);
                envelope.addProperty(
                        "encryptedMetadata",
                        attack.equals("kid")
                                ? meta.replace(
                                        meta.substring(0, meta.indexOf('.')),
                                        Base64.getUrlEncoder()
                                                .withoutPadding()
                                                .encodeToString(
                                                        "{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\",\"kid\":\"unknown\"}"
                                                                .getBytes(StandardCharsets.UTF_8)))
                                : meta);
                String wire = encryptedData;
                if (attack.equals("ciphertext")) {
                    var parts = wire.split("\\.");
                    parts[3] = (parts[3].startsWith("A") ? "B" : "A") + parts[3].substring(1);
                    wire = String.join(".", parts);
                }
                envelope.addProperty("encryptedData", wire);
                return envelope.toString();
            }
            if (url.endsWith("/attachments/" + attachmentId)) return encryptedAttachment;
            if (java.net.URI.create(url).getPath().endsWith("/events")) {
                var tags = new JsonObject();
                tags.addProperty("metadata", tag(meta));
                tags.addProperty(
                        "data",
                        tag(
                                sdkReply == null
                                        ? encryptedData
                                        : sdkReply.get("encryptedData").getAsString()));
                var at = new JsonObject();
                if (sdkUploads == null)
                    at.addProperty(
                            attachmentId.toString(),
                            attack.equals("attachment-tag") ? "wrong" : tag(encryptedAttachment));
                else sdkUploads.forEach((id, wire) -> at.addProperty(id, tag(wire)));
                tags.add("attachments", at);
                var list = new JsonArray();
                list.add(event("create-reply", null));
                String jwt = event("submit-reply", tags);
                if (attack.equals("event-signature")) {
                    var parts = jwt.split("\\.");
                    parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
                    jwt = String.join(".", parts);
                }
                list.add(jwt);
                if (attack.equals("duplicate-submit")) list.add(event("submit-reply", tags));
                return "{\"offset\":0,\"count\":"
                        + list.size()
                        + ",\"totalCount\":"
                        + list.size()
                        + ",\"eventLog\":"
                        + list
                        + "}";
            }
            if (url.equals(base + "/cases/" + CASE))
                return "{\"caseId\":\""
                        + CASE
                        + "\",\"destinationId\":\""
                        + TARGET
                        + "\",\"fromDestinationId\":\""
                        + SOURCE
                        + "\"}";
            if (url.startsWith(base + "/destinations/"))
                return "{\"destinationId\":\""
                        + url.substring(url.lastIndexOf('/') + 1)
                        + "\",\"type\":\"A\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\"]}";
            if (url.endsWith("/.well-known/jwks.json")) {
                var server = publicKey.deepCopy();
                server.addProperty("kid", "synthetic-server");
                server.addProperty("alg", "PS512");
                server.addProperty("use", "sig");
                var ops = new JsonArray();
                ops.add("verify");
                server.add("key_ops", ops);
                return "{\"keys\":[" + server + "]}";
            }
            throw new AssertionError("Unexpected reply receive URL: " + url);
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
    }

    String event(String name, JsonObject tags) throws Exception {
        var claims = new JsonObject();
        claims.addProperty(
                "$schema",
                "https://schema.fitko.de/fit-connect/set-payload/1.2.2/set-payload.schema.json");
        claims.addProperty("iss", "https://test.fit-connect.fitko.dev/submission-api");
        claims.addProperty("jti", UUID.randomUUID().toString());
        claims.addProperty("iat", java.time.Instant.now().getEpochSecond() - 1);
        claims.addProperty(
                "sub", "reply:" + (attack.equals("event-subject") ? UUID.randomUUID() : replyId));
        claims.addProperty(
                "txn", "case:" + (attack.equals("event-case") ? UUID.randomUUID() : CASE));
        var events = new JsonObject();
        var body = replyReceiptPayload == null ? new JsonObject() : replyReceiptPayload.deepCopy();
        if (tags != null) body.add("authenticationTags", tags);
        events.add("https://schema.fitko.de/fit-connect/events/" + name, body);
        claims.add("events", events);
        var b64 = Base64.getUrlEncoder().withoutPadding();
        String payload =
                b64.encodeToString(
                                "{\"alg\":\"PS512\",\"kid\":\"synthetic-server\",\"typ\":\"secevent+jwt\"}"
                                        .getBytes(StandardCharsets.UTF_8))
                        + "."
                        + b64.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
        var signature = Signature.getInstance("RSASSA-PSS");
        signature.setParameter(
                new PSSParameterSpec("SHA-512", "MGF1", MGF1ParameterSpec.SHA512, 64, 1));
        signature.initSign(privateKey);
        signature.update(payload.getBytes(StandardCharsets.US_ASCII));
        return payload + "." + b64.encodeToString(signature.sign());
    }
}
