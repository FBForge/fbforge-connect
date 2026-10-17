package org.fitconnect.integration.host;

import com.google.gson.*;
import java.nio.file.Path;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/** One confirmed native reply attempt. Only SDK calls for the bound case may cross this gate. */
final class ReplyAccess implements ResourceExchange {
    record State(String attemptId, String status, String replyId, String caseId, String error) {}

    private final ApiVersion version;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final String base;
    private ReplyInput input;
    private ReplyRecipient recipient;
    private State state = new State(null, "idle", null, null, null);
    private long expires, operationExpires;
    private boolean writing, finalStarted, caseVerified, cleanupFailed;
    private String replyDestination, boundaryFailure;
    private Set<String> attachments = Set.of();
    private final Set<String> uploaded = new HashSet<>();

    ReplyAccess(ApiVersion version, ResourceExchange remote) {
        this(version, remote, () -> System.nanoTime() / 1_000_000);
    }

    ReplyAccess(ApiVersion version, ResourceExchange remote, LongSupplier clock) {
        this.version = Objects.requireNonNull(version);
        this.remote = Objects.requireNonNull(remote);
        this.clock = Objects.requireNonNull(clock);
        base = "https://test.fit-connect.fitko.dev/submission-api/" + version.wireValue();
    }

    State state() {
        return state;
    }

    long pendingBytes() {
        if (input == null) return 0;
        if (state.status().equals("prepared") && clock.getAsLong() >= expires) {
            input = null;
            recipient = null;
            return 0;
        }
        long bytes = input.dataLength();
        for (var item : input.attachments()) bytes += item.byteLength();
        return bytes;
    }

    State prepare(ReplyInput value, ReplyRecipient context) {
        if (cleanupFailed || Set.of("running", "uncertain").contains(state.status()))
            throw error("send_locked");
        if (context == null
                || value == null
                || version == ApiVersion.V2 && value.processMessage() != null)
            throw error("invalid_submission");
        context.check(value);
        input = value;
        recipient = context;
        expires = clock.getAsLong() + 60_000;
        writing = false;
        finalStarted = false;
        caseVerified = false;
        replyDestination = null;
        boundaryFailure = null;
        attachments = Set.of();
        uploaded.clear();
        state =
                new State(
                        UUID.randomUUID().toString(),
                        "prepared",
                        null,
                        value.caseId().toString(),
                        null);
        return state;
    }

    State execute(
            String attempt, AuthenticatedSession session, Path workspace, Runnable validateProof) {
        if (!state.status().equals("prepared") || !Objects.equals(state.attemptId(), attempt))
            throw error("send_locked");
        if (clock.getAsLong() >= expires || input == null) {
            release();
            state = outcome("failed", "confirmation_expired");
            return state;
        }
        if (session == null || workspace == null || validateProof == null)
            throw error("invalid_input");
        state = outcome("running", null);
        operationExpires = clock.getAsLong() + 150_000;
        try {
            validateProof.run();
            var current =
                    session.replyRecipient(
                            input.destinationId().toString(), input.submissionId().toString());
            if (!recipient.equals(current)) throw error("verification_failed");
            ReplyResult result = session.sendReply(input, workspace, this);
            if (boundaryFailure != null) throw error(boundaryFailure);
            if (!finalStarted
                    || !Objects.equals(state.replyId(), result.replyId().toString())
                    || !state.caseId().equals(result.caseId().toString())
                    || version == ApiVersion.V3
                            && !input.destinationId().equals(result.fromDestinationId()))
                throw error("invalid_resource");
            state = outcome("sent", null);
        } catch (Exception | LinkageError failure) {
            String code =
                    boundaryFailure != null
                            ? boundaryFailure
                            : failure instanceof SessionException known
                                    ? known.code()
                                    : "resource_unavailable";
            if (!Set.of(
                            "invalid_submission",
                            "verification_failed",
                            "endpoint_blocked",
                            "resource_denied",
                            "resource_missing",
                            "invalid_resource",
                            "content_limit")
                    .contains(code)) code = "resource_unavailable";
            state = outcome(writing ? "uncertain" : "failed", code);
        } finally {
            release();
        }
        return state;
    }

    private State outcome(String status, String code) {
        return new State(state.attemptId(), status, state.replyId(), state.caseId(), code);
    }

    private void release() {
        input = null;
        recipient = null;
    }

    void cancel(String attempt) {
        if (!state.status().equals("prepared") || !Objects.equals(state.attemptId(), attempt))
            throw error("send_locked");
        release();
        state = outcome("cancelled", null);
    }

    void invalidatePrepared() {
        if (state.status().equals("prepared")) {
            release();
            state = outcome("cancelled", null);
        }
    }

    void cleanupFailed() {
        cleanupFailed = true;
        state = outcome(state.status(), "content_cleanup_failed");
    }

    void close() {
        release();
        state = outcome("closed", null);
    }

    public String get(String endpoint, Map<String, String> headers) {
        return request("GET", endpoint, headers, null).body();
    }

    public Response request(
            String method, String endpoint, Map<String, String> headers, String body) {
        try {
            return guarded(method, endpoint, headers, body);
        } catch (SessionException failure) {
            if (state.status().equals("running")) boundaryFailure = failure.code();
            throw failure;
        }
    }

    private Response guarded(
            String method, String endpoint, Map<String, String> headers, String body) {
        if (!state.status().equals("running") || input == null) throw error("endpoint_blocked");
        if (boundaryFailure != null) throw error(boundaryFailure);
        if (method.equals("GET")) {
            if (body != null) throw error("endpoint_blocked");
            return read(endpoint, headers);
        }
        if (method.equals("POST")
                && endpoint.equals(base + "/replies")
                && !writing
                && caseVerified) {
            var announced = StrictJson.object(body, 65536);
            if (!state.caseId().equals(id(announced, "caseId"))
                    || version == ApiVersion.V3
                            && !input.destinationId()
                                    .toString()
                                    .equals(id(announced, "fromDestinationId")))
                throw error("endpoint_blocked");
            var process = announced.get("processMessage");
            if (input.processMessage() == null
                    ? process != null && !process.isJsonNull()
                    : process == null
                            || !process.isJsonObject()
                            || !input.processMessage()
                                    .processModelId()
                                    .equals(text(process.getAsJsonObject(), "processModelId"))
                            || !input.processMessage()
                                    .messageId()
                                    .equals(text(process.getAsJsonObject(), "messageId")))
                throw error("endpoint_blocked");
            var ids = new HashSet<String>();
            if (!announced.has("announcedAttachments")
                    || !announced.get("announcedAttachments").isJsonArray())
                throw error("invalid_resource");
            for (var item : announced.getAsJsonArray("announcedAttachments")) {
                if (!item.isJsonPrimitive()
                        || !item.getAsJsonPrimitive().isString()
                        || !ids.add(DestinationAccess.id(item.getAsString()))
                        || ids.size() > 512) throw error("invalid_resource");
            }
            attachments = Set.copyOf(ids);
            if (version == ApiVersion.V3) {
                var owned =
                        StrictJson.object(
                                dispatch(
                                                "GET",
                                                "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/"
                                                        + input.destinationId(),
                                                headers,
                                                null)
                                        .body(),
                                1024 * 1024);
                if (!input.destinationId().toString().equals(id(owned, "destinationId")))
                    throw error("resource_denied");
            }
            writing = true;
            Response response = dispatch(method, endpoint, headers, body);
            var created = StrictJson.object(response.body(), 1024 * 1024);
            checkReplyIdentity(created, false);
            state =
                    new State(
                            state.attemptId(),
                            "running",
                            id(created, "replyId"),
                            state.caseId(),
                            null);
            return response;
        }
        if (!method.equals("PUT") || state.replyId() == null || finalStarted)
            throw error("endpoint_blocked");
        String reply = base + "/replies/" + state.replyId();
        if (endpoint.startsWith(reply + "/attachments/")) {
            String id = endpoint.substring((reply + "/attachments/").length());
            if (!attachments.contains(id) || !uploaded.add(id)) throw error("endpoint_blocked");
        } else if (endpoint.equals(reply) && uploaded.equals(attachments)) finalStarted = true;
        else throw error("endpoint_blocked");
        Response response = dispatch(method, endpoint, headers, body);
        if (finalStarted) checkReplyIdentity(StrictJson.object(response.body(), 1024 * 1024), true);
        return response;
    }

    private void checkReplyIdentity(JsonObject value, boolean finalReply) {
        if (!state.caseId().equals(id(value, "caseId"))
                || finalReply && !state.replyId().equals(id(value, "replyId"))
                || version == ApiVersion.V3
                        && !input.destinationId().toString().equals(id(value, "fromDestinationId")))
            throw error("invalid_resource");
    }

    private Response read(String endpoint, Map<String, String> headers) {
        String own = base + "/destinations/" + input.destinationId();
        boolean caseRead = endpoint.equals(base + "/cases/" + state.caseId());
        boolean destination =
                endpoint.equals(own)
                        || replyDestination != null
                                && endpoint.equals(base + "/destinations/" + replyDestination);
        boolean limits =
                endpoint.equals(base + "/cases/" + state.caseId() + "/limits")
                                && version == ApiVersion.V2
                        || version == ApiVersion.V3
                                && replyDestination != null
                                && endpoint.equals(
                                        base
                                                + "/limits/"
                                                + input.destinationId()
                                                + "/"
                                                + replyDestination);
        boolean probe =
                version == ApiVersion.V3 && endpoint.equals(base + "/cases?offset=0&limit=1");
        if (!(caseRead || destination || limits || probe)) throw error("endpoint_blocked");
        Response response = dispatch("GET", endpoint, headers, null);
        var value = StrictJson.object(response.body(), 1024 * 1024);
        if (caseRead) {
            if (!state.caseId().equals(id(value, "caseId"))
                    || !input.destinationId().toString().equals(id(value, "destinationId")))
                throw error("invalid_resource");
            if (version == ApiVersion.V3) {
                String source = id(value, "fromDestinationId");
                if (recipient.replyDestinationId() != null
                                && !recipient.replyDestinationId().toString().equals(source)
                        || replyDestination != null && !replyDestination.equals(source))
                    throw error("invalid_resource");
                replyDestination = source;
            }
            caseVerified = true;
        }
        if (destination) {
            String expected =
                    endpoint.equals(own) ? input.destinationId().toString() : replyDestination;
            if (!expected.equals(id(value, "destinationId"))) throw error("invalid_resource");
        }
        return response;
    }

    private Response dispatch(
            String method, String endpoint, Map<String, String> headers, String body) {
        if (clock.getAsLong() >= operationExpires) throw error("resource_unavailable");
        if (!method.equals("GET")
                && (headers == null
                        || headers.entrySet().stream()
                                .noneMatch(
                                        entry ->
                                                entry.getKey().equalsIgnoreCase("Authorization")
                                                        && entry.getValue() != null
                                                        && entry.getValue().startsWith("Bearer ")
                                                        && entry.getValue().length() > 7)))
            throw error("resource_denied");
        Response response = remote.request(method, endpoint, headers, body);
        if (clock.getAsLong() >= operationExpires) throw error("resource_unavailable");
        if (response != null && Set.of(401, 403).contains(response.status()))
            throw error("resource_denied");
        if (response == null || response.status() < 200 || response.status() >= 300)
            throw error("resource_unavailable");
        return response;
    }

    private static String text(JsonObject value, String name) {
        var field = value.get(name);
        if (field == null || !field.isJsonPrimitive() || !field.getAsJsonPrimitive().isString())
            throw error("invalid_resource");
        return field.getAsString();
    }

    private static String id(JsonObject value, String name) {
        return DestinationAccess.id(text(value, name));
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
