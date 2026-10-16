package org.fitconnect.integration.host;

import org.fitconnect.integration.contract.*;
import java.nio.file.Path;
import java.util.*;
import java.util.function.LongSupplier;

/** One explicitly confirmed reply receipt. Reads are narrow; a dispatched PUT is never retried. */
final class ReplyReceiptAccess implements ResourceExchange, AutoCloseable {
    record State(String attemptId, String status, String caseId, String replyId, String action, String eventId, String error) {}
    private final ApiVersion api;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final Set<UUID> completed = new HashSet<>();
    private PreparedReplyReceipt prepared;
    private State state = new State(null, "idle", null, null, null, null, null);
    private long expires, deadline;
    private boolean writing, closed;
    private int reads;
    private String boundaryFailure;

    ReplyReceiptAccess(ApiVersion api, ResourceExchange remote) { this(api, remote, () -> System.nanoTime() / 1_000_000); }
    ReplyReceiptAccess(ApiVersion api, ResourceExchange remote, LongSupplier clock) {
        this.api = Objects.requireNonNull(api); this.remote = Objects.requireNonNull(remote); this.clock = Objects.requireNonNull(clock);
    }
    State prepare(PreparedReplyReceipt value) {
        requireOpen();
        if (Set.of("running", "uncertain").contains(state.status()) || value != null && completed.contains(value.request().replyId())) throw error("send_locked");
        if (value == null) throw error("invalid_input");
        if (completed.size() >= 1024) throw error("content_limit");
        prepared = value; expires = clock.getAsLong() + 60_000;
        writing = false; boundaryFailure = null; reads = 0;
        var request = value.request();
        state = new State(UUID.randomUUID().toString(), "prepared", request.caseId().toString(), request.replyId().toString(), request.action(), null, null);
        return state;
    }
    State state() {
        if (state.status().equals("prepared") && clock.getAsLong() >= expires) { prepared = null; state = outcome("failed", null, "confirmation_expired"); }
        return state;
    }
    State execute(String attemptId, AuthenticatedSession session, Path workspace, Runnable revalidate) {
        requireOpen(); requirePrepared(attemptId);
        if (clock.getAsLong() >= expires) { prepared = null; state = outcome("failed", null, "confirmation_expired"); return state; }
        state = outcome("running", null, null); deadline = clock.getAsLong() + 150_000;
        try {
            revalidate.run();
            UUID event = session.sendReplyReceipt(prepared, this, workspace);
            if (boundaryFailure != null) throw error(boundaryFailure);
            if (!writing || event == null) throw error("verification_failed");
            state = outcome("confirmed", event.toString(), null);
        } catch (Exception | LinkageError failure) {
            String code = boundaryFailure != null ? boundaryFailure : failure instanceof SessionException known ? known.code() : "resource_unavailable";
            state = outcome(writing ? "uncertain" : "failed", null, code);
        } finally {
            if (writing) completed.add(prepared.request().replyId());
            prepared = null;
        }
        return state;
    }
    void cancel(String attemptId) { requireOpen(); requirePrepared(attemptId); prepared = null; state = outcome("cancelled", null, null); }
    void invalidate() { if (state.status().equals("prepared")) { prepared = null; state = outcome("cancelled", null, null); } }
    private void requirePrepared(String id) {
        if (!state.status().equals("prepared") || !Objects.equals(state.attemptId(), id)) throw error("send_locked");
    }
    @Override public String get(String endpoint, Map<String,String> headers) {
        return request("GET", endpoint, headers, null).body();
    }
    @Override public Response request(String method, String endpoint, Map<String,String> headers, String body) {
        try {
            requireOpen();
            if (!state.status().equals("running") || prepared == null || boundaryFailure != null || clock.getAsLong() >= deadline) throw error("endpoint_blocked");
            boolean read = method.equals("GET"), trust = endpoint.equals("https://test.fit-connect.fitko.dev/submission-api/.well-known/jwks.json");
            String detail = "https://test.fit-connect.fitko.dev/submission-api/" + api.wireValue() + "/replies/" + prepared.request().replyId();
            if (read) {
                if (body != null || !(trust || endpoint.equals(detail)) || ++reads > 8) throw error("endpoint_blocked");
            } else if (!method.equals("PUT") || writing || !endpoint.equals(detail + "/" + prepared.request().action())
                    || body == null || !StrictJson.object(body, 65536).equals(StrictJson.object(prepared.body(), 65536))) throw error("endpoint_blocked");
            var safe = ReceiveAccess.safeHeaders(headers, trust);
            if (!trust && safe.entrySet().stream().noneMatch(item -> item.getKey().equalsIgnoreCase("authorization")
                    && item.getValue().startsWith("Bearer ") && !item.getValue().substring(7).isBlank())) throw error("endpoint_blocked");
            if (!read && safe.entrySet().stream().noneMatch(item -> item.getKey().equalsIgnoreCase("content-type") && item.getValue().equalsIgnoreCase("application/json"))) throw error("endpoint_blocked");
            if (!read) writing = true;
            Response result = read ? new Response(200, remote.get(endpoint, safe)) : remote.request(method, endpoint, safe, body);
            if (clock.getAsLong() >= deadline || result == null || result.status() < 200 || result.status() >= 300 || result.body() == null
                    || result.body().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > (read ? 1024 * 1024 : 65536)) throw error("invalid_resource");
            if (read) StrictJson.object(result.body(), 1024 * 1024);
            return result;
        } catch (Exception failure) {
            String code = failure instanceof SessionException known ? known.code() : "resource_unavailable";
            if (state.status().equals("running") && boundaryFailure == null) boundaryFailure = code;
            throw error(code);
        }
    }
    private State outcome(String status, String event, String failure) {
        return new State(state.attemptId(), status, state.caseId(), state.replyId(), state.action(), event, failure);
    }
    private void requireOpen() { if (closed) throw error("session_missing"); }
    @Override public void close() { prepared = null; completed.clear(); closed = true; }
    private static SessionException error(String code) { return new SessionException(code); }
}
