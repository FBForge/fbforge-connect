package org.fitconnect.integration.host;

import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.fitconnect.integration.contract.*;

/**
 * Separate fixed environment-bound sender and receipt profiles. Host gates bind calls to one
 * approved attempt.
 */
final class SendHttpTransport implements AutoCloseable {
    private static final String UUID =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    private enum ResponseKind {
        JSON,
        EMPTY,
        SIGNED_TOKEN,
        OPTIONAL_JSON
    }

    private HttpClient http;

    SendHttpTransport() {}

    SendHttpTransport(HttpClient http) {
        this.http = Objects.requireNonNull(http);
    }

    private final ScheduledExecutorService deadlines =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().name("test-send-deadline").daemon(true).factory());

    static URI allowed(ApiVersion version, String method, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            if (!"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawFragment() != null) throw new IllegalArgumentException();
            String path = uri.getRawPath(), prefix = "/submission-api/" + version.wireValue();
            boolean accepted =
                    switch (method) {
                        case "GET" ->
                                path.matches(
                                                prefix
                                                        + "/destinations/"
                                                        + UUID
                                                        + "(?:/keys/[A-Za-z0-9._~%+-]{1,1536}|/limits)?")
                                        || (version == ApiVersion.V3
                                                && (path.matches(
                                                                prefix
                                                                        + "/limits/"
                                                                        + UUID
                                                                        + "/"
                                                                        + UUID)
                                                        || path.equals(prefix + "/cases")
                                                        || path.matches(
                                                                "/destination-api/v3/destinations/"
                                                                        + UUID)));
                        case "POST" -> path.equals(prefix + "/submissions");
                        case "PUT" ->
                                path.matches(
                                        prefix
                                                + "/submissions/"
                                                + UUID
                                                + "(?:/attachments/"
                                                + UUID
                                                + ")?");
                        default -> false;
                    };
            if (!accepted) throw new IllegalArgumentException();
            if (path.equals(prefix + "/cases")) {
                if (!"offset=0&limit=1".equals(uri.getRawQuery()))
                    throw new IllegalArgumentException();
            } else if (uri.getRawQuery() != null) throw new IllegalArgumentException();
            return uri;
        } catch (Exception e) {
            throw new SessionException("endpoint_blocked");
        }
    }

    static URI allowedReceipt(ApiVersion version, String method, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            if (!"POST".equals(method)
                    || !"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawQuery() != null
                    || uri.getRawFragment() != null
                    || !uri.getRawPath()
                            .matches(
                                    "/submission-api/"
                                            + version.wireValue()
                                            + "/cases/"
                                            + UUID
                                            + "/events")) throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    ResourceExchange.Response requestReceipt(
            ApiVersion version,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        URI uri = allowedReceipt(version, method, endpoint);
        if (body == null
                || body.length() > 65536
                || !body.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))
            throw new SessionException("invalid_submission");
        var names = new HashSet<String>();
        if (headers == null || headers.size() > 8) throw new SessionException("endpoint_blocked");
        for (var entry : headers.entrySet()) {
            String name = entry.getKey() == null ? "" : entry.getKey().toLowerCase(Locale.ROOT),
                    value = entry.getValue();
            if (!names.add(name)
                    || value == null
                    || value.length() > 16384
                    || value.chars().anyMatch(c -> c < 32 || c == 127)
                    || name.equals("authorization")
                            && (!value.startsWith("Bearer ") || value.substring(7).isBlank())
                    || name.equals("content-type") && !value.equalsIgnoreCase("application/jose"))
                throw new SessionException("endpoint_blocked");
        }
        if (!names.containsAll(Set.of("authorization", "content-type")))
            throw new SessionException("endpoint_blocked");
        return exchange(uri, method, headers, body, ResponseKind.EMPTY);
    }

    ResourceExchange.Response request(
            ApiVersion version,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        return exchange(
                allowed(version, method, endpoint), method, headers, body, ResponseKind.JSON);
    }

    static URI allowedReply(ApiVersion version, String method, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            String path = uri.getRawPath(), prefix = "/submission-api/" + version.wireValue();
            if (!"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawFragment() != null
                    || path.contains("%")) throw new IllegalArgumentException();
            boolean accepted =
                    switch (method) {
                        case "GET" ->
                                path.matches(
                                                prefix
                                                        + "/cases/"
                                                        + UUID
                                                        + (version == ApiVersion.V2
                                                                ? "(?:/limits)?"
                                                                : ""))
                                        || path.matches(prefix + "/destinations/" + UUID)
                                        || version == ApiVersion.V3
                                                && (path.matches(
                                                                prefix
                                                                        + "/limits/"
                                                                        + UUID
                                                                        + "/"
                                                                        + UUID)
                                                        || path.matches(
                                                                "/destination-api/v3/destinations/"
                                                                        + UUID)
                                                        || path.equals(prefix + "/cases"));
                        case "POST" -> path.equals(prefix + "/replies");
                        case "PUT" ->
                                path.matches(
                                        prefix
                                                + "/replies/"
                                                + UUID
                                                + "(?:/attachments/"
                                                + UUID
                                                + ")?");
                        default -> false;
                    };
            if (!accepted
                    || (path.equals(prefix + "/cases")
                            ? !"offset=0&limit=1".equals(uri.getRawQuery())
                            : uri.getRawQuery() != null)) throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    ResourceExchange.Response requestReply(
            ApiVersion version,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        return exchange(
                allowedReply(version, method, endpoint), method, headers, body, ResponseKind.JSON);
    }

    static URI allowedDestination(ApiVersion version, String method, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            if (version != ApiVersion.V3
                    || !"PATCH".equals(method)
                    || !"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawQuery() != null
                    || uri.getRawFragment() != null
                    || !uri.getRawPath().matches("/destination-api/v3/destinations/" + UUID))
                throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    ResourceExchange.Response requestDestination(
            ApiVersion version,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        return exchange(
                allowedDestination(version, method, endpoint),
                method,
                headers,
                body,
                ResponseKind.JSON);
    }

    static URI allowedReplyReceipt(ApiVersion api, String method, String endpoint) {
        try {
            var uri = URI.create(endpoint);
            if (!"PUT".equals(method)
                    || !"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawQuery() != null
                    || uri.getRawFragment() != null
                    || !uri.getRawPath()
                            .matches(
                                    "/submission-api/"
                                            + api.wireValue()
                                            + "/replies/"
                                            + UUID
                                            + "/(?:accept|reject)"))
                throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    ResourceExchange.Response requestReplyReceipt(
            ApiVersion api,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        StrictJson.object(body, 65536);
        return exchange(
                allowedReplyReceipt(api, method, endpoint),
                method,
                headers,
                body,
                ResponseKind.SIGNED_TOKEN);
    }

    static URI allowedDestinationLifecycle(ApiVersion api, String method, String endpoint) {
        try {
            var uri = URI.create(endpoint);
            if (api != ApiVersion.V3
                    || !"https".equals(uri.getScheme())
                    || !IntegrationEnvironment.current().gatewayHost().equals(uri.getRawAuthority())
                    || uri.getRawQuery() != null
                    || uri.getRawFragment() != null) throw new IllegalArgumentException();
            String root = "/destination-api/v3/destinations", path = uri.getRawPath();
            boolean allowed =
                    switch (method) {
                        case "POST" ->
                                path.equals(root) || path.matches(root + "/" + UUID + "/keys");
                        case "PATCH", "DELETE" -> path.matches(root + "/" + UUID);
                        default -> false;
                    };
            if (!allowed) throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    ResourceExchange.Response requestDestinationLifecycle(
            ApiVersion api,
            String method,
            String endpoint,
            Map<String, String> headers,
            String body) {
        var uri = allowedDestinationLifecycle(api, method, endpoint);
        return exchange(
                uri,
                method,
                headers,
                body,
                method.equals("DELETE")
                        ? ResponseKind.EMPTY
                        : uri.getRawPath().endsWith("/keys")
                                ? ResponseKind.OPTIONAL_JSON
                                : ResponseKind.JSON);
    }

    private ResourceExchange.Response exchange(
            URI uri, String method, Map<String, String> headers, String body, ResponseKind format) {
        Integer receivedStatus = null;
        try {
            if (headers == null || headers.size() > 8)
                throw new SessionException("endpoint_blocked");
            byte[] bytes = body == null ? null : body.getBytes(StandardCharsets.UTF_8);
            int maximum = "POST".equals(method) ? 65536 : 46 * 1024 * 1024;
            boolean bodyless = "GET".equals(method) || "DELETE".equals(method);
            if ((bodyless && bytes != null)
                    || (!bodyless && bytes == null)
                    || (bytes != null && bytes.length > maximum))
                throw new SessionException("invalid_submission");
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60));
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
            request.method(
                    method,
                    bytes == null
                            ? HttpRequest.BodyPublishers.noBody()
                            : HttpRequest.BodyPublishers.ofByteArray(bytes));
            if (http == null)
                http =
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .connectTimeout(Duration.ofSeconds(5))
                                .build();
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var stream = response.body()) {
                int status = response.statusCode();
                receivedStatus = status;
                var timeout =
                        deadlines.schedule(
                                () -> {
                                    try {
                                        stream.close();
                                    } catch (Exception ignored) {
                                    }
                                },
                                10,
                                TimeUnit.SECONDS);
                try {
                    if (status < 200 || status >= 300) {
                        String code =
                                status >= 300 && status < 400
                                        ? "endpoint_blocked"
                                        : status == 401 || status == 403
                                                ? "resource_denied"
                                                : status == 404
                                                        ? "resource_missing"
                                                        : "resource_unavailable";
                        throw new SessionException(code, status, problemType(stream));
                    }
                    byte[] result =
                            stream.readNBytes(
                                    format == ResponseKind.EMPTY
                                            ? 1
                                            : format == ResponseKind.SIGNED_TOKEN
                                                    ? 65537
                                                    : 1024 * 1024 + 1);
                    if (result.length > (format == ResponseKind.SIGNED_TOKEN ? 65536 : 1024 * 1024))
                        throw new SessionException("invalid_resource");
                    String text =
                            StandardCharsets.UTF_8
                                    .newDecoder()
                                    .decode(ByteBuffer.wrap(result))
                                    .toString();
                    if (format == ResponseKind.EMPTY || status == 204) {
                        if (result.length != 0) throw new SessionException("invalid_resource");
                    } else if (format == ResponseKind.SIGNED_TOKEN) {
                        if (!text.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))
                            throw new SessionException("invalid_resource");
                    } else if (format != ResponseKind.OPTIONAL_JSON || !text.isEmpty())
                        StrictJson.object(text, 1024 * 1024);
                    return new ResourceExchange.Response(status, text);
                } finally {
                    timeout.cancel(false);
                }
            }
        } catch (SessionException e) {
            throw e.httpStatus() == null && receivedStatus != null
                    ? new SessionException(e.code(), receivedStatus)
                    : e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SessionException("resource_unavailable", receivedStatus);
        } catch (Exception e) {
            throw new SessionException("resource_unavailable", receivedStatus);
        }
    }

    private static String problemType(java.io.InputStream stream) {
        try {
            byte[] bytes = stream.readNBytes(16 * 1024 + 1);
            if (bytes.length > 16 * 1024) return null;
            var root = StrictJson.object(new String(bytes, StandardCharsets.UTF_8), 16 * 1024);
            var value = root.get("type");
            return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()
                    ? value.getAsString()
                    : null;
        } catch (Exception failure) {
            return null;
        }
    }

    public void close() {
        deadlines.shutdownNow();
        if (http != null) http.close();
    }
}
