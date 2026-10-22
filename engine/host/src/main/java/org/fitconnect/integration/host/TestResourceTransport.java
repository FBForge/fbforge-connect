package org.fitconnect.integration.host;

import java.io.InputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.fitconnect.integration.contract.*;

/** TEST reads and a separate attempt-gated sender transport. No renderer-selected HTTP URLs. */
final class TestResourceTransport implements AutoCloseable {
    private enum ReadProfile {
        DIRECTORY,
        PROCESS_SEARCH,
        RECEIVE,
        REPLY_RECEIVE,
        EVENTS,
        REPLY_EVENTS
    }

    private static final int MAX_BYTES = 1024 * 1024;
    private static final String UUID =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private HttpClient http;
    private final SendHttpTransport sender = new SendHttpTransport();
    private final ScheduledExecutorService deadlines =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().name("test-resource-deadline").daemon(true).factory());

    ResourceExchange forVersion(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                return TestResourceTransport.this.get(version, endpoint, headers);
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.request(version, method, endpoint, headers, body);
            }
        };
    }

    ResourceExchange forProcessSearch() {
        return (endpoint, headers) ->
                get(ApiVersion.V3, endpoint, headers, ReadProfile.PROCESS_SEARCH);
    }

    ReceiveAccess forReceive(ApiVersion version, String destinationId, String submissionId) {
        return new ReceiveAccess(
                version,
                destinationId,
                submissionId,
                (endpoint, headers) -> get(version, endpoint, headers, ReadProfile.RECEIVE));
    }

    ReceiveAccess forReplyReceive(ApiVersion version, String caseId, String replyId) {
        return ReceiveAccess.forReply(
                version,
                caseId,
                replyId,
                (endpoint, headers) -> get(version, endpoint, headers, ReadProfile.REPLY_RECEIVE));
    }

    /** Only a current ReplyAccess gate may use this narrow reply HTTP profile. */
    ResourceExchange forReply(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                throw new SessionException("endpoint_blocked");
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.requestReply(version, method, endpoint, headers, body);
            }
        };
    }

    ResourceExchange forDestinationLifecycle(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                throw new SessionException("endpoint_blocked");
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.requestDestinationLifecycle(version, method, endpoint, headers, body);
            }
        };
    }

    ResourceExchange forDestinationManagement(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                throw new SessionException("endpoint_blocked");
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.requestDestination(version, method, endpoint, headers, body);
            }
        };
    }

    EventLogAccess forEvents(ApiVersion version, String caseId, String submissionId) {
        return new EventLogAccess(
                version,
                caseId,
                submissionId,
                (endpoint, headers) -> get(version, endpoint, headers, ReadProfile.EVENTS));
    }

    EventLogAccess forCaseEvents(ApiVersion version, String caseId) {
        return EventLogAccess.forCase(
                version,
                caseId,
                (endpoint, headers) -> get(version, endpoint, headers, ReadProfile.EVENTS));
    }

    EventLogAccess forReplyEvents(ApiVersion version, String caseId, String replyId) {
        return new EventLogAccess(
                version,
                caseId,
                replyId,
                (endpoint, headers) -> get(version, endpoint, headers, ReadProfile.REPLY_EVENTS),
                true);
    }

    /**
     * ReceiptAccess must supply the confirmed case/token binding before this native HTTP profile is
     * used.
     */
    ResourceExchange forReplyReceipt(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                return TestResourceTransport.this.get(
                        version, endpoint, headers, ReadProfile.REPLY_RECEIVE);
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.requestReplyReceipt(version, method, endpoint, headers, body);
            }
        };
    }

    ResourceExchange forReceipt(ApiVersion version) {
        return new ResourceExchange() {
            public String get(String endpoint, Map<String, String> headers) {
                throw new SessionException("endpoint_blocked");
            }

            public Response request(
                    String method, String endpoint, Map<String, String> headers, String body) {
                return sender.requestReceipt(version, method, endpoint, headers, body);
            }
        };
    }

    static URI allowed(ApiVersion version, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            String prefix = "/" + version.wireValue() + "/destinations";
            if (!"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawFragment() != null
                    || uri.getRawPath().contains("%")) throw new IllegalArgumentException();
            boolean directory =
                    uri.getRawPath()
                            .matches("/destination-api" + prefix + "(?:/" + UUID + "(?:/keys)?)?");
            boolean publicDetail =
                    uri.getRawPath().matches("/submission-api" + prefix + "/" + UUID);
            String submissions = "/submission-api/" + version.wireValue() + "/submissions";
            boolean pickup = uri.getRawPath().equals(submissions);
            boolean replies =
                    uri.getRawPath().equals("/submission-api/" + version.wireValue() + "/replies");
            boolean submission = uri.getRawPath().matches(submissions + "/" + UUID);
            if (!directory && !publicDetail && !pickup && !submission && !replies)
                throw new IllegalArgumentException();
            if ((pickup || replies) && uri.getRawQuery() == null)
                throw new IllegalArgumentException();
            if (uri.getRawQuery() != null) {
                if (!pickup
                        && !replies
                        && (!directory
                                || !(uri.getRawPath().endsWith("/keys")
                                        || uri.getRawPath().endsWith("/destinations"))))
                    throw new IllegalArgumentException();
                var params = new HashMap<String, String>();
                for (String pair : uri.getRawQuery().split("&", -1)) {
                    String[] parts = pair.split("=", -1);
                    if (parts.length != 2
                            || !(pickup
                                            ? Set.of("destinationId", "offset", "limit")
                                            : Set.of("offset", "limit"))
                                    .contains(parts[0])
                            || params.put(parts[0], parts[1]) != null)
                        throw new IllegalArgumentException();
                }
                if (!params.keySet()
                        .equals(
                                pickup
                                        ? Set.of("destinationId", "offset", "limit")
                                        : Set.of("offset", "limit")))
                    throw new IllegalArgumentException();
                if (pickup) DestinationAccess.id(params.get("destinationId"));
                if (!params.get("limit").matches("[0-9]{1,5}")
                        || !params.get("offset").matches("[0-9]{1,5}")
                        || Integer.parseInt(params.get("limit")) < 1
                        || Integer.parseInt(params.get("limit")) > 100
                        || Integer.parseInt(params.get("offset")) > 10000)
                    throw new IllegalArgumentException();
            }
            return uri;
        } catch (Exception e) {
            throw new SessionException("endpoint_blocked");
        }
    }

    static int maximumBytes(URI uri) {
        return uri.getPath().matches("/submission-api/v[23]/submissions/" + UUID)
                ? 46 * 1024 * 1024
                : MAX_BYTES;
    }

    private String get(ApiVersion version, String endpoint, Map<String, String> headers) {
        return get(version, endpoint, headers, ReadProfile.DIRECTORY);
    }

    private String get(
            ApiVersion version, String endpoint, Map<String, String> headers, ReadProfile profile) {
        boolean receiving =
                profile != ReadProfile.DIRECTORY && profile != ReadProfile.PROCESS_SEARCH;
        URI uri =
                switch (profile) {
                    case DIRECTORY -> allowed(version, endpoint);
                    case PROCESS_SEARCH -> ProcessDiscovery.allowed(endpoint, headers);
                    case RECEIVE -> ReceiveAccess.allowedTransport(version, endpoint);
                    case REPLY_RECEIVE -> ReceiveAccess.allowedReplyTransport(version, endpoint);
                    case EVENTS -> EventLogAccess.allowedTransport(version, endpoint);
                    case REPLY_EVENTS -> EventLogAccess.allowedTransport(version, endpoint, true);
                };
        try {
            if (headers == null || headers.size() > 8)
                throw new SessionException("endpoint_blocked");
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET();
            for (var entry : headers.entrySet()) {
                if (!Set.of(
                                        "authorization",
                                        "accept",
                                        "accept-charset",
                                        "content-type",
                                        "user-agent")
                                .contains(entry.getKey().toLowerCase(Locale.ROOT))
                        || entry.getValue() == null
                        || entry.getValue().length() > 16384)
                    throw new SessionException("endpoint_blocked");
                request.header(entry.getKey(), entry.getValue());
            }
            if (http == null)
                http =
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .connectTimeout(Duration.ofSeconds(5))
                                .build();
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                int status = response.statusCode();
                if (status >= 300 && status < 400) throw new SessionException("endpoint_blocked");
                if (status == 401 || status == 403) throw new SessionException("resource_denied");
                if (status == 404) throw new SessionException("resource_missing");
                if (status != 200) throw new SessionException("resource_unavailable");
                var timeout =
                        deadlines.schedule(
                                () -> {
                                    try {
                                        body.close();
                                    } catch (Exception ignored) {
                                    }
                                },
                                10,
                                TimeUnit.SECONDS);
                try {
                    int maximum = receiving ? ReceiveAccess.maximumBytes(uri) : maximumBytes(uri);
                    byte[] bytes = body.readNBytes(maximum + 1);
                    if (bytes.length > maximum) throw new SessionException("invalid_resource");
                    // A detail can contain a large ASCII JWE. Avoid a second full UTF-16 validation
                    // buffer.
                    try (var reader =
                            new java.io.InputStreamReader(
                                    new java.io.ByteArrayInputStream(bytes),
                                    StandardCharsets.UTF_8.newDecoder())) {
                        char[] buffer = new char[4096];
                        while (reader.read(buffer) != -1) {}
                    }
                    String text = new String(bytes, StandardCharsets.UTF_8);
                    if (receiving
                            && uri.getPath()
                                    .matches(
                                            "/submission-api/v[23]/(?:submissions|replies)/"
                                                    + UUID
                                                    + "/attachments/"
                                                    + UUID))
                        return text; // Opaque authenticated JWE. Only the SDK opens its content.
                    var json = StrictJson.object(text, maximum);
                    if (receiving && uri.getPath().contains("/keys/")) rejectPrivateKey(json);
                    if (receiving && uri.getPath().endsWith("/.well-known/jwks.json")) {
                        if (!json.has("keys") || !json.get("keys").isJsonArray())
                            throw new SessionException("invalid_resource");
                        for (var key : json.getAsJsonArray("keys")) {
                            if (!key.isJsonObject()) throw new SessionException("invalid_resource");
                            rejectPrivateKey(key.getAsJsonObject());
                        }
                    }
                    if (uri.getPath().endsWith("/keys")
                            && json.has("keys")
                            && json.get("keys").isJsonArray()) {
                        for (var key : json.getAsJsonArray("keys")) {
                            if (!key.isJsonObject()
                                    || Set.of("d", "p", "q", "dp", "dq", "qi", "oth", "k").stream()
                                            .anyMatch(key.getAsJsonObject()::has))
                                throw new SessionException("invalid_resource");
                        }
                    }
                    return text;
                } finally {
                    timeout.cancel(false);
                }
            }
        } catch (SessionException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SessionException("resource_unavailable");
        } catch (Exception e) {
            throw new SessionException("resource_unavailable");
        }
    }

    private static void rejectPrivateKey(com.google.gson.JsonObject key) {
        if (Set.of("d", "p", "q", "dp", "dq", "qi", "oth", "k").stream().anyMatch(key::has))
            throw new SessionException("invalid_resource");
    }

    public void close() {
        deadlines.shutdownNow();
        if (http != null) http.close();
        sender.close();
    }
}
