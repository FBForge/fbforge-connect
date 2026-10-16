package org.fitconnect.integration.host;

import org.fitconnect.integration.contract.*;
import java.util.*;
import java.util.function.LongSupplier;

/** Fixed sequence shared by destination creation and key rotation. Each write is consumed before dispatch. */
final class DestinationWriteAccess implements ResourceExchange {
    record Mutation(String method, String endpoint, String document) {}
    private final ResourceExchange remote;
    private final List<Mutation> mutations;
    private final LongSupplier clock;
    private final long deadline;
    private int next, acknowledged;
    private SessionException failure;
    DestinationWriteAccess(ResourceExchange remote, List<Mutation> mutations, LongSupplier clock) {
        this(remote, mutations, clock, Long.MAX_VALUE);
    }
    DestinationWriteAccess(ResourceExchange remote, List<Mutation> mutations, LongSupplier clock, long operationDeadline) {
        this.remote = Objects.requireNonNull(remote); this.mutations = List.copyOf(mutations); this.clock = clock;
        if (mutations.isEmpty() || mutations.size() > 3) throw error("invalid_input");
        deadline = Math.min(clock.getAsLong() + 150000, operationDeadline);
    }
    static boolean definitelyDeclined(Throwable cause) {
        return cause instanceof SessionException known && known.httpStatus() != null
                && Set.of(400, 401, 403, 404, 405, 413, 415, 422, 429).contains(known.httpStatus());
    }
    boolean declinedWrite() { return failure != null && definitelyDeclined(failure); }
    int acknowledged() { return acknowledged; }
    boolean dispatched() { return next > 0; }
    void complete() {
        if (failure != null) throw failure;
        if (next != mutations.size()) throw error("invalid_resource");
    }
    @Override public String get(String endpoint, Map<String,String> headers) { return request("GET", endpoint, headers, null).body(); }
    @Override public Response request(String method, String endpoint, Map<String,String> headers, String document) {
        try {
            if (failure != null || next >= mutations.size() || clock.getAsLong() >= deadline) throw error("endpoint_blocked");
            SendHttpTransport.allowedDestinationLifecycle(ApiVersion.V3, method, endpoint);
            var expected = mutations.get(next);
            if (!expected.method().equals(method) || !expected.endpoint().equals(endpoint)
                    || (expected.document() == null ? document != null : document == null
                    || !StrictJson.object(expected.document(), 65536).equals(StrictJson.object(document, 65536)))) throw error("endpoint_blocked");
            var safe = ReceiveAccess.safeHeaders(headers, false);
            if (safe.entrySet().stream().noneMatch(item -> item.getKey().equalsIgnoreCase("authorization")
                    && item.getValue().startsWith("Bearer ") && !item.getValue().substring(7).isBlank())) throw error("endpoint_blocked");
            if (!method.equals("DELETE") && safe.entrySet().stream().noneMatch(item -> item.getKey().equalsIgnoreCase("content-type")
                    && item.getValue().equalsIgnoreCase("application/json"))) throw error("endpoint_blocked");
            next++;
            var result = remote.request(method, endpoint, safe, document);
            if (result != null && (result.status() < 200 || result.status() >= 300))
                throw new SessionException(result.status() == 401 || result.status() == 403 ? "resource_denied" : "resource_unavailable", result.status());
            if (clock.getAsLong() >= deadline || result == null || result.body() == null
                    || result.body().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 65536) throw error("invalid_resource");
            acknowledged++; return result;
        } catch (Exception cause) {
            if (failure == null) failure = cause instanceof SessionException known ? known : error("resource_unavailable");
            throw failure;
        }
    }
    private static SessionException error(String code) { return new SessionException(code); }
}
