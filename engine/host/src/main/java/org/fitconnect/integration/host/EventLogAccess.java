package org.fitconnect.integration.host;

import org.fitconnect.integration.contract.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.LongSupplier;

/** Bounded SDK event reads independent of content availability. Does not grant receive or write authority. */
final class EventLogAccess implements EventLogSource, AutoCloseable {
    private final ApiVersion api;
    private final String casePath, submissionPath, submissionId;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final long deadline;
    private int requests;
    private long bytes;
    private boolean closed, terminalPage;
    private String eventPath;
    private int total = -1, nextOffset;
    private final List<String> tokens = new ArrayList<>();
    EventLogAccess(ApiVersion api, String caseId, String submissionId, ResourceExchange remote) {
        this(api, caseId, submissionId, remote, () -> System.nanoTime() / 1_000_000);
    }
    EventLogAccess(ApiVersion api, String caseId, String submissionId, ResourceExchange remote, LongSupplier clock) {
        this.api = Objects.requireNonNull(api); this.remote = Objects.requireNonNull(remote); this.clock = Objects.requireNonNull(clock);
        this.submissionId = DestinationAccess.id(submissionId);
        String prefix = "/submission-api/" + api.wireValue();
        casePath = prefix + "/cases/" + DestinationAccess.id(caseId) + "/events";
        submissionPath = prefix + "/submissions/" + DestinationAccess.id(submissionId) + "/events";
        deadline = clock.getAsLong() + 150000;
    }
    @Override public String get(String endpoint, Map<String,String> headers) {
        try {
            if (closed) throw error("endpoint_blocked");
            if (clock.getAsLong() >= deadline) throw error("resource_unavailable");
            URI uri = allowedTransport(api, endpoint);
            boolean trust = trust(uri);
            if (uri.getRawQuery() != null) for (String pair : uri.getRawQuery().split("&")) {
                if (pair.startsWith("submissionId=") && !pair.equals("submissionId=" + submissionId)) throw error("endpoint_blocked");
            }
            if (!trust && !Set.of(casePath, submissionPath).contains(uri.getRawPath())) throw error("endpoint_blocked");
            var safe = ReceiveAccess.safeHeaders(headers, trust);
            if (!trust && safe.entrySet().stream().noneMatch(item -> item.getKey().equalsIgnoreCase("authorization")
                    && item.getValue().startsWith("Bearer ") && !item.getValue().substring(7).isBlank())) throw error("endpoint_blocked");
            if (++requests > 256) throw error("content_limit");
            String result = remote.get(endpoint, safe);
            if (result == null || result.length() > ReceiveAccess.maximumBytes(uri)) throw error("invalid_resource");
            int size = result.getBytes(StandardCharsets.UTF_8).length;
            if (size > ReceiveAccess.maximumBytes(uri) || (bytes += size) > 16L * 1024 * 1024) throw error("content_limit");
            if (clock.getAsLong() >= deadline) throw error("resource_unavailable");
            var document = StrictJson.object(result, ReceiveAccess.maximumBytes(uri));
            if (!trust) capturePage(uri, document);
            if (trust && uri.getRawPath().contains("/keys/")) {
                String expected = URLDecoder.decode(uri.getRawPath().substring(uri.getRawPath().lastIndexOf('/') + 1), StandardCharsets.UTF_8);
                if (!document.has("kid") || !document.get("kid").isJsonPrimitive() || !document.get("kid").getAsJsonPrimitive().isString()
                        || !expected.equals(document.get("kid").getAsString())) throw error("invalid_resource");
            }
            return result;
        } catch (SessionException failure) { close(); throw failure;
        } catch (Exception failure) { close(); throw error("invalid_resource"); }
    }
    private void capturePage(URI uri, com.google.gson.JsonObject page) throws Exception {
        var query = new HashMap<String,String>();
        for (String pair : uri.getRawQuery().split("&")) { String[] parts = pair.split("=", -1); query.put(parts[0], parts[1]); }
        int offset = number(page, "offset"), count = number(page, "count"), available = number(page, "totalCount");
        var values = page.get("eventLog");
        if (values == null || !values.isJsonArray() || values.getAsJsonArray().size() != count || offset != nextOffset
                || offset != Integer.parseInt(query.get("offset")) || count > Integer.parseInt(query.get("limit"))
                || available > 1000 || offset + count > available || count == 0 && offset < available
                || terminalPage || total >= 0 && (available != total || nextOffset == total && count != 0)
                || eventPath != null && !eventPath.equals(uri.getRawPath())) throw error("invalid_resource");
        eventPath = uri.getRawPath(); total = available;
        for (var value : values.getAsJsonArray()) {
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw error("invalid_resource");
            String wire = value.getAsString();
            if (wire.length() > 65536 || !wire.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) throw error("invalid_resource");
            String[] parts = wire.split("\\.");
            for (int i = 0; i < 2; i++) {
                String json = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(Base64.getUrlDecoder().decode(parts[i]))).toString();
                StrictJson.object(json, i == 0 ? 16384 : 65536);
            }
            tokens.add(wire);
        }
        nextOffset += count; terminalPage = count == 0;
    }
    private static int number(com.google.gson.JsonObject page, String field) {
        var value = page.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber() || !value.getAsString().matches("[0-9]{1,5}")) throw error("invalid_resource");
        return value.getAsInt();
    }
    @Override public List<String> completeEventTokens() {
        if (closed || total < 0 || nextOffset != total) throw error("invalid_resource");
        return List.copyOf(tokens);
    }
    static URI allowedTransport(ApiVersion api, String endpoint) {
        URI uri = ReceiveAccess.allowedTransport(api, endpoint);
        if (!trust(uri) && !uri.getRawPath().endsWith("/events")) throw error("endpoint_blocked");
        return uri;
    }
    private static boolean trust(URI uri) {
        return uri.getRawPath().equals("/submission-api/.well-known/jwks.json") || uri.getRawPath().contains("/destinations/") && uri.getRawPath().contains("/keys/");
    }
    @Override public Response request(String method, String endpoint, Map<String,String> headers, String body) {
        if (!"GET".equals(method) || body != null) { close(); throw error("endpoint_blocked"); }
        return new Response(200, get(endpoint, headers));
    }
    @Override public void close() { closed = true; tokens.clear(); }
    private static SessionException error(String code) { return new SessionException(code); }
}
