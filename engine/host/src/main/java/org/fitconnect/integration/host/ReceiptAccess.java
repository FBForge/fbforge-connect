package org.fitconnect.integration.host;

import java.util.*;
import java.util.function.*;
import org.fitconnect.integration.contract.*;

/**
 * One expiring native confirmation. Only its exact SDK token may be posted once to the bound TEST
 * case.
 */
final class ReceiptAccess implements ResourceExchange, AutoCloseable {
    record State(
            String attemptId,
            String status,
            String action,
            String destinationId,
            String submissionId,
            String caseId,
            String signingKid,
            String error) {}

    private final ApiVersion api;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final Set<UUID> completed = new HashSet<>();
    private SignedReceipt receipt;
    private State state = new State(null, "idle", null, null, null, null, null, null);
    private long expires, deadline;
    private boolean writing, acknowledged, closed;
    private String boundaryFailure;

    ReceiptAccess(ApiVersion api, ResourceExchange remote) {
        this(api, remote, () -> System.nanoTime() / 1_000_000);
    }

    ReceiptAccess(ApiVersion api, ResourceExchange remote, LongSupplier clock) {
        this.api = Objects.requireNonNull(api);
        this.remote = Objects.requireNonNull(remote);
        this.clock = Objects.requireNonNull(clock);
    }

    State prepare(SignedReceipt value) {
        requireOpen();
        if (Set.of("running", "uncertain").contains(state.status())
                || value != null && completed.contains(value.submissionId()))
            throw error("send_locked");
        if (value == null) throw error("invalid_input");
        if (completed.size() >= 1024) throw error("content_limit");
        receipt = value;
        writing = false;
        acknowledged = false;
        boundaryFailure = null;
        expires = clock.getAsLong() + 60_000;
        state =
                new State(
                        UUID.randomUUID().toString(),
                        "prepared",
                        value.action(),
                        value.destinationId().toString(),
                        value.submissionId().toString(),
                        value.caseId().toString(),
                        value.signingKid(),
                        null);
        return state;
    }

    State state() {
        if (state.status().equals("prepared") && clock.getAsLong() >= expires) {
            receipt = null;
            state = outcome("failed", "confirmation_expired");
        }
        return state;
    }

    State execute(String attemptId, BiConsumer<SignedReceipt, ResourceExchange> writer) {
        requireOpen();
        requirePrepared(attemptId);
        if (clock.getAsLong() >= expires) {
            receipt = null;
            state = outcome("failed", "confirmation_expired");
            return state;
        }
        if (writer == null) throw error("invalid_input");
        state = outcome("running", null);
        deadline = clock.getAsLong() + 150_000;
        try {
            writer.accept(receipt, this);
            if (boundaryFailure != null) throw error(boundaryFailure);
            if (!acknowledged) throw error("invalid_resource");
            state = outcome("confirmed", null);
        } catch (Exception | LinkageError failure) {
            String code =
                    boundaryFailure != null
                            ? boundaryFailure
                            : failure instanceof SessionException known
                                    ? known.code()
                                    : "resource_unavailable";
            state = outcome(writing ? "uncertain" : "failed", code);
        } finally {
            if (writing) completed.add(receipt.submissionId());
            receipt = null;
        }
        return state;
    }

    void cancel(String id) {
        requireOpen();
        requirePrepared(id);
        receipt = null;
        state = outcome("cancelled", null);
    }

    void invalidate() {
        if (state.status().equals("prepared")) {
            receipt = null;
            state = outcome("cancelled", null);
        }
    }

    private void requirePrepared(String id) {
        if (!state.status().equals("prepared") || !Objects.equals(state.attemptId(), id))
            throw error("send_locked");
    }

    @Override
    public String get(String url, Map<String, String> headers) {
        return request("GET", url, headers, null).body();
    }

    @Override
    public synchronized Response request(
            String method, String url, Map<String, String> headers, String body) {
        try {
            requireOpen();
            if (!state.status().equals("running")
                    || receipt == null
                    || boundaryFailure != null
                    || writing
                    || clock.getAsLong() >= deadline
                    || !"POST".equals(method)
                    || !url().equals(url)
                    || !receipt.jwt().equals(body)) throw error("endpoint_blocked");
            var names = new HashSet<String>();
            if (headers == null || headers.size() > 8) throw error("endpoint_blocked");
            for (var item : headers.entrySet()) {
                String name = item.getKey() == null ? "" : item.getKey().toLowerCase(Locale.ROOT),
                        value = item.getValue();
                if (!Set.of(
                                        "authorization",
                                        "content-type",
                                        "accept",
                                        "accept-charset",
                                        "user-agent")
                                .contains(name)
                        || !names.add(name)
                        || value == null
                        || value.length() > 16384
                        || value.chars().anyMatch(c -> c < 32 || c == 127))
                    throw error("endpoint_blocked");
                if (name.equals("content-type") && !value.equalsIgnoreCase("application/jose"))
                    throw error("endpoint_blocked");
                if (name.equals("authorization")
                        && (!value.startsWith("Bearer ") || value.substring(7).isBlank()))
                    throw error("endpoint_blocked");
            }
            if (!names.containsAll(Set.of("authorization", "content-type")))
                throw error("endpoint_blocked");
            writing =
                    true; // Consume before dispatch: loss of the acknowledgement must never permit
            // a resend.
            Response response = remote.request(method, url, Map.copyOf(headers), body);
            if (clock.getAsLong() >= deadline
                    || response == null
                    || response.status() < 200
                    || response.status() >= 300
                    || response.body() == null
                    || !response.body().isEmpty()) throw error("invalid_resource");
            acknowledged = true;
            return response;
        } catch (SessionException failure) {
            if (state.status().equals("running") && boundaryFailure == null)
                boundaryFailure = failure.code();
            throw failure;
        } catch (Exception failure) {
            if (state.status().equals("running") && boundaryFailure == null)
                boundaryFailure = "resource_unavailable";
            throw error("resource_unavailable");
        }
    }

    private String url() {
        return "https://test.fit-connect.fitko.dev/submission-api/"
                + api.wireValue()
                + "/cases/"
                + receipt.caseId()
                + "/events";
    }

    private State outcome(String status, String failure) {
        return new State(
                state.attemptId(),
                status,
                state.action(),
                state.destinationId(),
                state.submissionId(),
                state.caseId(),
                state.signingKid(),
                failure);
    }

    private void requireOpen() {
        if (closed) throw error("session_missing");
    }

    @Override
    public void close() {
        receipt = null;
        completed.clear();
        closed = true;
        state = outcome("closed", null);
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
