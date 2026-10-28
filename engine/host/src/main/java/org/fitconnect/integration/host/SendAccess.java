package org.fitconnect.integration.host;

import com.google.gson.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/** One native confirmation and write attempt. It is not a general-purpose renderer HTTP proxy. */
final class SendAccess implements ResourceExchange {
    private java.util.function.BiConsumer<String, String> certificateVerifier =
            (key, purpose) -> {
                if (IntegrationEnvironment.current().requiresVpki())
                    throw error("vpki_certificate_required");
            };

    void certificateVerifier(java.util.function.BiConsumer<String, String> verifier) {
        certificateVerifier = verifier;
    }

    record Diagnostic(
            String step,
            String method,
            Integer httpStatus,
            String code,
            long durationMs,
            String problemType) {}

    record State(
            String attemptId,
            String status,
            String submissionId,
            String caseId,
            String error,
            List<Diagnostic> diagnostics) {
        State(String attemptId, String status, String submissionId, String caseId, String error) {
            this(attemptId, status, submissionId, caseId, error, List.of());
        }
    }

    private final ApiVersion version;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private final String base;
    private SubmissionInput input;
    private State state = new State(null, "idle", null, null, null);
    private long expires;
    private long operationExpires;
    private boolean writing, sourceVerified, finalStarted, keyVerified, cleanupFailed;
    private boolean announcementDeclined, uncertaintyAcknowledged;
    private String encryptionKid, boundaryFailure;
    private Set<String> attachments = Set.of();
    private final Set<String> uploaded = new HashSet<>();
    private final List<Diagnostic> diagnostics = new ArrayList<>();

    SendAccess(ApiVersion version, ResourceExchange remote) {
        this(version, remote, () -> System.nanoTime() / 1_000_000);
    }

    SendAccess(ApiVersion version, ResourceExchange remote, LongSupplier clock) {
        this.version = Objects.requireNonNull(version);
        this.remote = Objects.requireNonNull(remote);
        this.clock = Objects.requireNonNull(clock);
        base = IntegrationEnvironment.current().submissionApi() + "/" + version.wireValue();
    }

    State state() {
        return new State(
                state.attemptId(),
                state.status(),
                state.submissionId(),
                state.caseId(),
                state.error(),
                List.copyOf(diagnostics));
    }

    SubmissionInput pendingInput() {
        return input;
    }

    long pendingBytes() {
        if ("prepared".equals(state.status()) && clock.getAsLong() >= expires) input = null;
        return input == null ? 0 : input.totalBytes();
    }

    State prepare(SubmissionInput request) {
        if (cleanupFailed
                || "running".equals(state.status())
                || "uncertain".equals(state.status()) && !uncertaintyAcknowledged)
            throw error("send_locked");
        if (request == null
                || version == ApiVersion.V2
                        && request.replyOffer() != null
                        && !request.replyOffer().processMessages().isEmpty()
                || (version == ApiVersion.V2
                        && (request.fromDestinationId() != null
                                || request.processMessage() != null))
                || (version == ApiVersion.V3 && request.fromDestinationId() == null))
            throw error("invalid_submission");
        input = request;
        diagnostics.clear();
        expires = clock.getAsLong() + 60_000;
        writing = false;
        announcementDeclined = false;
        uncertaintyAcknowledged = false;
        sourceVerified = false;
        finalStarted = false;
        keyVerified = false;
        encryptionKid = null;
        boundaryFailure = null;
        attachments = Set.of();
        uploaded.clear();
        state = new State(UUID.randomUUID().toString(), "prepared", null, null, null);
        return state();
    }

    State execute(String attemptId, AuthenticatedSession session, Path workspace) {
        if (!"prepared".equals(state.status()) || !Objects.equals(state.attemptId(), attemptId))
            throw error("send_locked");
        if (clock.getAsLong() >= expires) {
            input = null;
            state = outcome("failed", "confirmation_expired");
            return state();
        }
        if (workspace == null || session == null) throw error("invalid_input");
        state = outcome("running", null);
        operationExpires = clock.getAsLong() + 150_000;
        try {
            SendResult result = session.send(input, workspace, UUID.fromString(attemptId));
            if (boundaryFailure != null) throw error(boundaryFailure);
            if (!finalStarted
                    || state.submissionId() == null
                    || !state.submissionId().equals(result.submissionId().toString())
                    || !state.caseId().equals(result.caseId().toString()))
                throw error("invalid_resource");
            state = outcome("sent", null);
        } catch (Exception | LinkageError failure) {
            String candidate =
                    boundaryFailure != null
                            ? boundaryFailure
                            : failure instanceof SessionException known
                                    ? known.code()
                                    : "resource_unavailable";
            if (diagnostics.isEmpty() || "ok".equals(diagnostics.getLast().code()))
                diagnostic("sdk", "LOCAL", null, candidate, 0);
            String code =
                    Set.of(
                                            "test_certificate_required",
                                            "vpki_certificate_required",
                                            "certificate_status_unknown",
                                            "invalid_submission",
                                            "data_format_invalid",
                                            "reply_metadata_required",
                                            "endpoint_blocked",
                                            "resource_denied",
                                            "resource_missing",
                                            "invalid_resource",
                                            "content_limit")
                                    .contains(candidate)
                            ? candidate
                            : "resource_unavailable";
            state = outcome(writing && !announcementDeclined ? "uncertain" : "failed", code);
        } finally {
            try {
                if (input.replyOffer() != null)
                    session.completeReplyChannel(
                            UUID.fromString(attemptId),
                            state.caseId() == null ? null : UUID.fromString(state.caseId()),
                            state.submissionId() == null
                                    ? null
                                    : UUID.fromString(state.submissionId()),
                            Set.of("sent", "uncertain").contains(state.status()));
            } finally {
                input = null;
            }
        }
        return state();
    }

    private State outcome(String status, String error) {
        return new State(state.attemptId(), status, state.submissionId(), state.caseId(), error);
    }

    void cleanupFailed() {
        cleanupFailed = true;
        state = outcome(state.status(), "content_cleanup_failed");
    }

    void cancel(String id) {
        if (!"prepared".equals(state.status()) || !Objects.equals(state.attemptId(), id))
            throw error("send_locked");
        input = null;
        state = outcome("cancelled", null);
    }

    /** Keep the unresolved outcome intact; only a new, separately confirmed attempt is unlocked. */
    void acknowledgeUncertainty(String id) {
        if (cleanupFailed
                || !"uncertain".equals(state.status())
                || !Objects.equals(state.attemptId(), id)) throw error("send_locked");
        uncertaintyAcknowledged = true;
    }

    void close() {
        input = null;
        state = outcome("closed", null);
    }

    public String get(String endpoint, Map<String, String> headers) {
        return remote.get(endpoint, headers);
    }

    @Override
    public Response request(
            String method, String endpoint, Map<String, String> headers, String body) {
        try {
            return guardedRequest(method, endpoint, headers, body);
        } catch (SessionException failure) {
            if ("running".equals(state.status())) boundaryFailure = failure.code();
            throw failure;
        }
    }

    private Response guardedRequest(
            String method, String endpoint, Map<String, String> headers, String body) {
        if (!"running".equals(state.status()) || input == null) throw error("endpoint_blocked");
        if (boundaryFailure != null) throw error(boundaryFailure);
        if ("GET".equals(method)) return read(endpoint, headers);
        if (!keyVerified) throw error("endpoint_blocked");
        if ("POST".equals(method) && endpoint.equals(base + "/submissions") && !writing) {
            if (version == ApiVersion.V3) verifySource(headers);
            JsonObject document = StrictJson.object(body, 64 * 1024);
            if (!input.destinationId().toString().equals(id(document, "destinationId")))
                throw error("endpoint_blocked");
            if (version == ApiVersion.V3
                    && !input.fromDestinationId()
                            .toString()
                            .equals(id(document, "fromDestinationId")))
                throw error("endpoint_blocked");
            if (!document.has("announcedAttachments")
                    || !document.get("announcedAttachments").isJsonArray())
                throw error("invalid_resource");
            var ids = new HashSet<String>();
            for (var value : document.getAsJsonArray("announcedAttachments")) {
                if (!value.isJsonPrimitive()
                        || !value.getAsJsonPrimitive().isString()
                        || !ids.add(DestinationAccess.id(value.getAsString()))
                        || ids.size() > 512) throw error("invalid_resource");
            }
            attachments = Set.copyOf(ids);
            writing = true; // Set before dispatch, including transport exceptions and malformed
            // replies.
            Response response = dispatch(method, endpoint, headers, body);
            var created = StrictJson.object(response.body(), 1024 * 1024);
            if (!input.destinationId().toString().equals(id(created, "destinationId"))
                    || (version == ApiVersion.V3
                            && !input.fromDestinationId()
                                    .toString()
                                    .equals(id(created, "fromDestinationId"))))
                throw error("invalid_resource");
            String submissionId = id(created, "submissionId"), caseId = id(created, "caseId");
            if (input.caseId() != null && !input.caseId().toString().equals(caseId))
                throw error("invalid_resource");
            state = new State(state.attemptId(), "running", submissionId, caseId, null);
            return response;
        }
        if (!"PUT".equals(method) || state.submissionId() == null || finalStarted)
            throw error("endpoint_blocked");
        String submission = base + "/submissions/" + state.submissionId();
        if (endpoint.startsWith(submission + "/attachments/")) {
            String id = endpoint.substring((submission + "/attachments/").length());
            if (!attachments.contains(id) || !uploaded.add(id)) throw error("endpoint_blocked");
        } else if (endpoint.equals(submission) && uploaded.equals(attachments)) {
            finalStarted = true;
        } else throw error("endpoint_blocked");
        Response response = dispatch(method, endpoint, headers, body);
        if (finalStarted) {
            var result = StrictJson.object(response.body(), 1024 * 1024);
            if (!state.submissionId().equals(id(result, "submissionId"))
                    || !state.caseId().equals(id(result, "caseId"))
                    || !input.destinationId().toString().equals(id(result, "destinationId"))
                    || (version == ApiVersion.V3
                            && !input.fromDestinationId()
                                    .toString()
                                    .equals(id(result, "fromDestinationId"))))
                throw error("invalid_resource");
        }
        return response;
    }

    private Response read(String endpoint, Map<String, String> headers) {
        String target = base + "/destinations/" + input.destinationId();
        boolean destination =
                endpoint.equals(target)
                        || (version == ApiVersion.V3
                                && endpoint.equals(
                                        base + "/destinations/" + input.fromDestinationId()));
        boolean key =
                encryptionKid != null
                        && endpoint.equals(target + "/keys/" + segment(encryptionKid));
        boolean limits =
                endpoint.equals(
                        version == ApiVersion.V2
                                ? target + "/limits"
                                : base
                                        + "/limits/"
                                        + input.fromDestinationId()
                                        + "/"
                                        + input.destinationId());
        boolean credentialProbe =
                version == ApiVersion.V3 && endpoint.equals(base + "/cases?offset=0&limit=1");
        if (!(destination || key || limits || credentialProbe)) throw error("endpoint_blocked");
        Response response = dispatch("GET", endpoint, headers, null);
        JsonObject document = StrictJson.object(response.body(), 1024 * 1024);
        if (destination) {
            String expected =
                    endpoint.equals(target)
                            ? input.destinationId().toString()
                            : input.fromDestinationId().toString();
            if (!expected.equals(id(document, "destinationId"))) throw error("invalid_resource");
        }
        if (version == ApiVersion.V3
                && input.replyOffer() != null
                && endpoint.equals(base + "/destinations/" + input.fromDestinationId()))
            ReplyMetadataVersions.require(
                    document, !input.replyOffer().processMessages().isEmpty());
        if (endpoint.equals(target)) {
            if (!"active".equals(text(document, "status"))) throw error("invalid_submission");
            String kid = text(document, "encryptionKid");
            if (kid.isBlank()
                    || kid.length() > 512
                    || (encryptionKid != null && !encryptionKid.equals(kid)))
                throw error("invalid_resource");
            encryptionKid = kid;
        }
        if (key) {
            if (!encryptionKid.equals(text(document, "kid"))) throw error("invalid_resource");
            try {
                TestCertificatePolicy.validate(
                        document,
                        TestCertificatePolicy.Purpose.ENCRYPTION,
                        Instant.now(),
                        certificateVerifier);
            } catch (TestCertificatePolicy.Rejected rejected) {
                throw error(rejected.getMessage());
            }
            keyVerified = true;
        }
        return response;
    }

    private void verifySource(Map<String, String> headers) {
        if (sourceVerified) return;
        if (headers == null
                || headers.entrySet().stream()
                        .noneMatch(
                                e ->
                                        e.getKey().equalsIgnoreCase("Authorization")
                                                && e.getValue() != null
                                                && e.getValue().startsWith("Bearer ")))
            throw error("resource_denied");
        Response response =
                dispatch(
                        "GET",
                        IntegrationEnvironment.current().destinationApi()
                                + "/v3/destinations/"
                                + input.fromDestinationId(),
                        headers,
                        null);
        if (!input.fromDestinationId()
                .toString()
                .equals(id(StrictJson.object(response.body(), 1024 * 1024), "destinationId")))
            throw error("resource_denied");
        sourceVerified = true;
    }

    private Response dispatch(
            String method, String endpoint, Map<String, String> headers, String body) {
        long started = System.nanoTime();
        Integer status = null;
        try {
            if (clock.getAsLong() >= operationExpires) throw error("resource_unavailable");
            Response response = remote.request(method, endpoint, headers, body);
            if (response != null) status = response.status();
            if (status != null && (status == 401 || status == 403)) throw error("resource_denied");
            if (status == null || status < 200 || status >= 300)
                throw error("resource_unavailable");
            diagnostic(step(method, endpoint), method, status, "ok", elapsed(started));
            return response;
        } catch (RuntimeException failure) {
            String code =
                    failure instanceof SessionException known
                            ? known.code()
                            : "resource_unavailable";
            if (failure instanceof SessionException known && known.httpStatus() != null)
                status = known.httpStatus();
            // A definite authorization rejection of the initial announcement created no submission.
            // Later failures and missing/ambiguous responses retain the conservative outcome.
            if ("POST".equals(method)
                    && endpoint.equals(base + "/submissions")
                    && state.submissionId() == null
                    && (Objects.equals(status, 401) || Objects.equals(status, 403)))
                announcementDeclined = true;
            diagnostic(
                    step(method, endpoint),
                    method,
                    status,
                    code,
                    elapsed(started),
                    failure instanceof SessionException known ? known.problemType() : null);
            throw failure;
        }
    }

    private static long elapsed(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    private void diagnostic(
            String step, String method, Integer status, String code, long duration) {
        diagnostic(step, method, status, code, duration, null);
    }

    private void diagnostic(
            String step,
            String method,
            Integer status,
            String code,
            long duration,
            String problemType) {
        if (diagnostics.size() == 32) diagnostics.removeFirst();
        diagnostics.add(new Diagnostic(step, method, status, code, duration, problemType));
    }

    private String step(String method, String endpoint) {
        if (endpoint.startsWith(IntegrationEnvironment.current().destinationApi() + "/"))
            return "source_access";
        if (endpoint.contains("/keys/")) return "recipient_key";
        if (endpoint.contains("/limits")) return "limits";
        if (endpoint.contains("/destinations/")) return "destination";
        if (endpoint.contains("/cases?")) return "credentials";
        if (method.equals("POST")) return "announce";
        return endpoint.contains("/attachments/") ? "attachment" : "finalize";
    }

    private static String text(JsonObject value, String name) {
        var element = value.get(name);
        if (element == null
                || !element.isJsonPrimitive()
                || !element.getAsJsonPrimitive().isString()) throw error("invalid_resource");
        return element.getAsString();
    }

    private static String id(JsonObject value, String name) {
        return DestinationAccess.id(text(value, name));
    }

    private static String segment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A")
                .replace("%7E", "~");
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
