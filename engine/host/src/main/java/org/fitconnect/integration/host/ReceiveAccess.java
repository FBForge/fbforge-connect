package org.fitconnect.integration.host;

import com.google.gson.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/**
 * One bounded, read-only SDK receive. Server trust keys remain separate from client test-key
 * policy.
 */
final class ReceiveAccess implements ReplySource, AutoCloseable {
    private static final String ROOT = IntegrationEnvironment.current().submissionApi();
    private static final String UUID =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private static final int DETAIL_BYTES = 46 * 1024 * 1024;
    private final ApiVersion version;
    private final String destination, submission, base;
    private final String collection, expectedCase;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final long deadline;
    private String caseId;
    private Set<String> attachments = Set.of();
    private Set<String> participants = Set.of();
    private final Map<UUID, String> attachmentTags = new HashMap<>();
    private String metadataTag, dataTag;
    private byte[] envelopeDigest;
    private boolean closed;
    private int requests;
    private long bytes;

    ReceiveAccess(
            ApiVersion version, String destination, String submission, ResourceExchange remote) {
        this(version, destination, submission, remote, () -> System.nanoTime() / 1_000_000);
    }

    ReceiveAccess(
            ApiVersion version,
            String destination,
            String submission,
            ResourceExchange remote,
            LongSupplier clock) {
        this(
                version,
                DestinationAccess.id(destination),
                submission,
                null,
                "submissions",
                remote,
                clock);
    }

    static ReceiveAccess forReply(
            ApiVersion version, String caseId, String replyId, ResourceExchange remote) {
        return forReply(version, caseId, replyId, remote, () -> System.nanoTime() / 1_000_000);
    }

    static ReceiveAccess forReply(
            ApiVersion version,
            String caseId,
            String replyId,
            ResourceExchange remote,
            LongSupplier clock) {
        return new ReceiveAccess(
                version, null, replyId, DestinationAccess.id(caseId), "replies", remote, clock);
    }

    private ReceiveAccess(
            ApiVersion version,
            String destination,
            String submission,
            String expectedCase,
            String collection,
            ResourceExchange remote,
            LongSupplier clock) {
        this.version = Objects.requireNonNull(version);
        this.destination = destination == null ? null : DestinationAccess.id(destination);
        this.submission = DestinationAccess.id(submission);
        this.collection = collection;
        this.expectedCase = expectedCase;
        this.remote = Objects.requireNonNull(remote);
        this.clock = Objects.requireNonNull(clock);
        deadline = clock.getAsLong() + 150_000;
        base = ROOT + "/" + version.wireValue();
    }

    @Override
    public String get(String endpoint, Map<String, String> headers) {
        if (closed) throw error("endpoint_blocked");
        try {
            if (clock.getAsLong() >= deadline) throw error("resource_unavailable");
            URI uri = allowedTransport(version, endpoint, collection);
            String path = uri.getRawPath(), target = "/submission-api/" + version.wireValue();
            boolean trust =
                    path.equals("/submission-api/.well-known/jwks.json")
                            || path.startsWith(target + "/destinations/")
                                    && path.contains("/keys/");
            boolean detail = endpoint.equals(base + "/" + collection + "/" + submission);
            boolean destinationRead =
                    destination != null && endpoint.equals(base + "/destinations/" + destination)
                            || participants.stream()
                                    .anyMatch(id -> endpoint.equals(base + "/destinations/" + id));
            boolean caseRead =
                    collection.equals("replies")
                            && caseId != null
                            && endpoint.equals(base + "/cases/" + caseId);
            boolean credentialProbe = endpoint.equals(base + "/cases?offset=0&limit=1");
            boolean attachment =
                    caseId != null
                            && attachments.stream()
                                    .anyMatch(
                                            id ->
                                                    endpoint.equals(
                                                            base
                                                                    + "/"
                                                                    + collection
                                                                    + "/"
                                                                    + submission
                                                                    + "/attachments/"
                                                                    + id));
            boolean events =
                    caseId != null
                            && (path.equals(
                                            target
                                                    + "/"
                                                    + collection
                                                    + "/"
                                                    + submission
                                                    + "/events")
                                    || path.equals(target + "/cases/" + caseId + "/events"));
            if (!(trust
                    || detail
                    || destinationRead
                    || caseRead
                    || credentialProbe
                    || attachment
                    || events)) throw error("endpoint_blocked");
            Map<String, String> query = query(uri);
            if (query.containsKey("submissionId") && !submission.equals(query.get("submissionId")))
                throw error("endpoint_blocked");
            if (query.containsKey("replyId") && !submission.equals(query.get("replyId")))
                throw error("endpoint_blocked");
            if (++requests > 1024) throw error("content_limit");
            String body = remote.get(endpoint, safeHeaders(headers, trust));
            if (body == null || body.length() > maximumBytes(uri)) throw error("invalid_resource");
            byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
            if (encoded.length > maximumBytes(uri)
                    || (bytes += encoded.length) > 128L * 1024 * 1024) throw error("content_limit");
            if (clock.getAsLong() >= deadline) throw error("resource_unavailable");
            if (attachment) {
                checkedJwe(body);
                if (collection.equals("replies")) {
                    UUID id = java.util.UUID.fromString(path.substring(path.lastIndexOf('/') + 1));
                    String tag = tag(body), previous = attachmentTags.putIfAbsent(id, tag);
                    if (previous != null && !previous.equals(tag)) throw error("invalid_resource");
                }
            }
            if (detail) bindEnvelope(body, encoded);
            if (caseRead) bindCase(body);
            if (destinationRead
                    && !endpoint.equals(
                            base
                                    + "/destinations/"
                                    + id(StrictJson.object(body, 1024 * 1024), "destinationId")))
                throw error("invalid_resource");
            if (trust && path.contains("/keys/")) {
                String expected =
                        URLDecoder.decode(
                                path.substring(path.lastIndexOf('/') + 1), StandardCharsets.UTF_8);
                var document = StrictJson.object(body, 1024 * 1024);
                var kid = document.get("kid");
                if (kid == null
                        || !kid.isJsonPrimitive()
                        || !kid.getAsJsonPrimitive().isString()
                        || !expected.equals(kid.getAsString())) throw error("invalid_resource");
            }
            return body;
        } catch (SessionException failure) {
            close(); // No failed or mismatched snapshot can authorize a later SDK read.
            throw failure;
        } catch (Exception failure) {
            close();
            throw error("invalid_resource");
        }
    }

    @Override
    public Response request(
            String method, String endpoint, Map<String, String> headers, String body) {
        if (!"GET".equals(method) || body != null) {
            close();
            throw error("endpoint_blocked");
        }
        return new Response(200, get(endpoint, headers));
    }

    private void bindEnvelope(String body, byte[] encoded) throws Exception {
        var document = StrictJson.object(body, DETAIL_BYTES);
        boolean reply = collection.equals("replies");
        if ((!reply && !destination.equals(id(document, "destinationId")))
                || !submission.equals(id(document, reply ? "replyId" : "submissionId")))
            throw error("invalid_resource");
        checkedJwe(text(document, "encryptedMetadata"));
        if (document.has("encryptedData") && !document.get("encryptedData").isJsonNull()) {
            String data = text(document, "encryptedData");
            if (!data.isBlank()) checkedJwe(data);
        }
        String nextCase = id(document, "caseId");
        if (expectedCase != null && !expectedCase.equals(nextCase)) throw error("invalid_resource");
        if (!document.has("attachments") || !document.get("attachments").isJsonArray())
            throw error("invalid_resource");
        var ids = new HashSet<String>();
        for (JsonElement element : document.getAsJsonArray("attachments")) {
            if (!element.isJsonPrimitive()
                    || !element.getAsJsonPrimitive().isString()
                    || !ids.add(DestinationAccess.id(element.getAsString()))
                    || ids.size() > 512) throw error("invalid_resource");
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(encoded);
        if (envelopeDigest != null && !MessageDigest.isEqual(envelopeDigest, digest))
            throw error("invalid_resource");
        envelopeDigest = digest;
        caseId = nextCase;
        attachments = Set.copyOf(ids);
        if (reply) {
            metadataTag = tag(text(document, "encryptedMetadata"));
            dataTag =
                    document.has("encryptedData")
                                    && !document.get("encryptedData").isJsonNull()
                                    && !text(document, "encryptedData").isBlank()
                            ? tag(text(document, "encryptedData"))
                            : null;
        }
    }

    private void bindCase(String body) {
        var document = StrictJson.object(body, 1024 * 1024);
        if (!caseId.equals(id(document, "caseId"))) throw error("invalid_resource");
        var ids = new HashSet<String>();
        ids.add(id(document, "destinationId"));
        if (document.has("fromDestinationId") && !document.get("fromDestinationId").isJsonNull())
            ids.add(id(document, "fromDestinationId"));
        if (!participants.isEmpty() && !participants.equals(ids)) throw error("invalid_resource");
        participants = Set.copyOf(ids);
    }

    public void verifyAuthenticationTags(
            UUID expectedCaseId,
            UUID replyId,
            String metadata,
            String data,
            Map<UUID, String> expectedAttachments) {
        try {
            var tags = expectedAttachments == null ? Map.<UUID, String>of() : expectedAttachments;
            if (closed
                    || !collection.equals("replies")
                    || envelopeDigest == null
                    || clock.getAsLong() >= deadline
                    || !Objects.equals(caseId, Objects.toString(expectedCaseId, null))
                    || !submission.equals(Objects.toString(replyId, null))
                    || !Objects.equals(metadataTag, metadata)
                    || !Objects.equals(dataTag, data)
                    || !tags.equals(attachmentTags)
                    || !attachments.equals(
                            attachmentTags.keySet().stream()
                                    .map(java.util.UUID::toString)
                                    .collect(java.util.stream.Collectors.toSet())))
                throw error("verification_failed");
        } catch (RuntimeException failure) {
            close();
            throw failure;
        }
    }

    private static String tag(String wire) {
        return wire.substring(wire.lastIndexOf('.') + 1);
    }

    static URI allowedTransport(ApiVersion version, String endpoint) {
        return allowedTransport(version, endpoint, "submissions");
    }

    static URI allowedReplyTransport(ApiVersion version, String endpoint) {
        return allowedTransport(version, endpoint, "replies");
    }

    private static URI allowedTransport(ApiVersion version, String endpoint, String collection) {
        try {
            URI uri = URI.create(endpoint);
            if (!"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawFragment() != null) throw error("endpoint_blocked");
            String path = uri.getRawPath(), prefix = "/submission-api/" + version.wireValue();
            boolean trust = path.equals("/submission-api/.well-known/jwks.json");
            boolean destination = path.matches(prefix + "/destinations/" + UUID);
            boolean key =
                    path.matches(
                            prefix + "/destinations/" + UUID + "/keys/[A-Za-z0-9._~%+\\-]{1,1536}");
            if (key) {
                String raw = path.substring(path.lastIndexOf('/') + 1);
                String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
                if (decoded.isBlank()
                        || decoded.length() > 512
                        || Set.of(".", "..").contains(decoded)
                        || decoded.chars()
                                .anyMatch(
                                        c ->
                                                c < 32 || c == 127 || c == '/' || c == '\\'
                                                        || c == '%'))
                    throw error("endpoint_blocked");
            }
            boolean detail = path.matches(prefix + "/" + collection + "/" + UUID);
            boolean attachment =
                    path.matches(prefix + "/" + collection + "/" + UUID + "/attachments/" + UUID);
            boolean event =
                    path.matches(prefix + "/(?:" + collection + "|cases)/" + UUID + "/events");
            boolean caseRead =
                    collection.equals("replies") && path.matches(prefix + "/cases/" + UUID);
            boolean probe = path.equals(prefix + "/cases");
            if (!(trust
                    || destination
                    || key
                    || detail
                    || attachment
                    || event
                    || probe
                    || caseRead)) throw error("endpoint_blocked");
            Map<String, String> query = query(uri);
            if (event || probe) {
                String entityQuery = collection.equals("replies") ? "replyId" : "submissionId";
                var allowed =
                        path.contains("/cases/")
                                ? Set.of("offset", "limit", entityQuery)
                                : Set.of("offset", "limit");
                if (!allowed.containsAll(query.keySet())
                        || !query.keySet().containsAll(Set.of("offset", "limit")))
                    throw error("endpoint_blocked");
                if (!query.get("offset").matches("[0-9]{1,5}")
                        || Integer.parseInt(query.get("offset")) > 10000
                        || !query.get("limit").matches("[0-9]{1,3}")
                        || Integer.parseInt(query.get("limit")) < 1
                        || Integer.parseInt(query.get("limit")) > 100)
                    throw error("endpoint_blocked");
                if (query.containsKey("submissionId"))
                    DestinationAccess.id(query.get("submissionId"));
                if (query.containsKey("replyId")) DestinationAccess.id(query.get("replyId"));
                if (probe && !(query.equals(Map.of("offset", "0", "limit", "1"))))
                    throw error("endpoint_blocked");
            } else if (uri.getRawQuery() != null) throw error("endpoint_blocked");
            return uri;
        } catch (Exception failure) {
            throw error("endpoint_blocked");
        }
    }

    static int maximumBytes(URI uri) {
        if (uri.getRawPath().endsWith("/events")) return 4 * 1024 * 1024;
        return uri.getRawPath()
                        .matches(
                                "/submission-api/v[23]/(?:submissions|replies)/"
                                        + UUID
                                        + "(?:/attachments/"
                                        + UUID
                                        + ")?")
                ? DETAIL_BYTES
                : 1024 * 1024;
    }

    private static Map<String, String> query(URI uri) {
        var values = new HashMap<String, String>();
        if (uri.getRawQuery() != null)
            for (String pair : uri.getRawQuery().split("&", -1)) {
                String[] parts = pair.split("=", -1);
                if (parts.length != 2 || values.put(parts[0], parts[1]) != null)
                    throw error("endpoint_blocked");
            }
        return values;
    }

    static Map<String, String> safeHeaders(Map<String, String> headers, boolean publicRead) {
        if (headers == null || headers.size() > 8) throw error("endpoint_blocked");
        var result = new HashMap<String, String>();
        var seen = new HashSet<String>();
        for (var item : headers.entrySet()) {
            String name = item.getKey().toLowerCase(Locale.ROOT);
            if (!Set.of("authorization", "accept", "accept-charset", "content-type", "user-agent")
                            .contains(name)
                    || !seen.add(name)
                    || item.getValue() == null
                    || item.getValue().length() > 16384
                    || item.getValue().chars().anyMatch(c -> c < 32 || c == 127))
                throw error("endpoint_blocked");
            if (!(publicRead && name.equals("authorization")))
                result.put(item.getKey(), item.getValue());
        }
        return Map.copyOf(result);
    }

    private static String id(JsonObject document, String field) {
        return DestinationAccess.id(text(document, field));
    }

    private static String text(JsonObject document, String field) {
        var value = document.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw error("invalid_resource");
        return value.getAsString();
    }

    private static void checkedJwe(String wire) {
        try {
            int dot = wire.indexOf('.');
            if (dot < 1 || dot > 16384 || wire.chars().filter(c -> c == '.').count() != 4)
                throw error("invalid_resource");
            byte[] bytes = Base64.getUrlDecoder().decode(wire.substring(0, dot));
            String protectedHeader =
                    StandardCharsets.UTF_8
                            .newDecoder()
                            .decode(java.nio.ByteBuffer.wrap(bytes))
                            .toString();
            var header = StrictJson.object(protectedHeader, 16384);
            if (!"RSA-OAEP-256".equals(text(header, "alg"))
                    || !"A256GCM".equals(text(header, "enc"))
                    || text(header, "kid").isBlank()
                    || text(header, "kid").length() > 512
                    || header.has("crit")
                    || header.has("zip") && !"DEF".equals(text(header, "zip")))
                throw error("invalid_resource");
        } catch (Exception failure) {
            throw error("invalid_resource");
        }
    }

    public void close() {
        closed = true;
        caseId = null;
        attachments = Set.of();
        participants = Set.of();
        attachmentTags.clear();
        metadataTag = null;
        dataTag = null;
        envelopeDigest = null;
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
