package org.fitconnect.integration.contract;

import java.io.InputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;

/** Fixed TEST OAuth transport. It cannot fetch schemas, destinations or caller-selected URLs. */
public final class TestTokenTransport implements TokenExchange, AutoCloseable {
    public static final String ENDPOINT = "https://auth-testing.fit-connect.fitko.dev/token";
    private static final int MAX_BYTES = 65536;
    private HttpClient http;
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().name("oauth-read-deadline").daemon(true).factory());

    @Override public String post(String endpoint, String formBody) {
        if (!ENDPOINT.equals(endpoint)) throw new SessionException("endpoint_blocked");
        if (formBody == null || formBody.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new SessionException("invalid_credentials");
        if (http == null) http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(5)).build();
        var request = HttpRequest.newBuilder(URI.create(ENDPOINT)).timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8)).build();
        try {
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() >= 300 && response.statusCode() < 400)
                    throw new SessionException("endpoint_blocked");
                if (response.statusCode() == 400 || response.statusCode() == 401 || response.statusCode() == 403)
                    throw new SessionException("authentication_failed");
                if (response.statusCode() != 200) throw new SessionException("auth_unavailable");
                var timeout = deadlines.schedule(() -> {
                    try { body.close(); } catch (Exception ignored) { /* No raw transport logging. */ }
                }, 10, TimeUnit.SECONDS);
                try {
                    byte[] bytes = body.readNBytes(MAX_BYTES + 1);
                    if (bytes.length > MAX_BYTES) throw new SessionException("auth_unavailable");
                    return StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
                } finally { timeout.cancel(false); }
            }
        } catch (SessionException e) { throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SessionException("auth_unavailable");
        } catch (Exception e) { throw new SessionException("auth_unavailable"); }
    }
    @Override public void close() { deadlines.shutdownNow(); if (http != null) http.close(); }
}
