package org.fitconnect.integration.v2;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.fitko.fitconnect.api.domain.model.destination.PublicDestination;
import dev.fitko.fitconnect.api.services.http.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;
import org.fitconnect.integration.contract.*;

/** SDK3 serialization with native transport and no metadata 1.x fallback. */
final class SenderTransport implements HttpClient {
    private static final int MAX_ENCRYPTED_BYTES = 46 * 1024 * 1024;
    private final TokenExchange tokens;
    private final ResourceExchange resources;
    private final ObjectMapper mapper =
            new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .registerModule(new JavaTimeModule());

    SenderTransport(TokenExchange tokens, ResourceExchange resources) {
        this.tokens = tokens;
        this.resources = resources;
    }

    private <P, R> HttpResponse<R> request(
            String method, String url, Map<String, String> headers, P payload, Class<R> type) {
        try {
            String body;
            if (payload == null) body = null;
            else if (payload instanceof String text) body = text;
            else if (payload instanceof InputStream stream) {
                byte[] bytes = stream.readNBytes(MAX_ENCRYPTED_BYTES + 1);
                if (bytes.length > MAX_ENCRYPTED_BYTES) throw new SessionException("content_limit");
                body =
                        StandardCharsets.UTF_8
                                .newDecoder()
                                .decode(ByteBuffer.wrap(bytes))
                                .toString();
            } else body = mapper.writeValueAsString(payload);
            ResourceExchange.Response response;
            if (TestTokenTransport.ENDPOINT.equals(url)) {
                if (!"POST".equals(method) || !(payload instanceof String))
                    throw new SessionException("endpoint_blocked");
                response = new ResourceExchange.Response(200, tokens.post(url, body));
            } else response = resources.request(method, url, headers, body);
            if (response.status() < 200 || response.status() > 299)
                throw new SessionException("resource_unavailable");
            R value;
            if (type == Void.class) value = null;
            else if (type == String.class) value = type.cast(response.body());
            else value = mapper.readValue(response.body(), type);
            if (value instanceof PublicDestination destination) {
                if (destination.getMetadataVersions() == null)
                    throw new SessionException("invalid_submission");
                var writable =
                        destination.getMetadataVersions().stream()
                                .filter(v -> Set.of("2.0.0", "2.1.0").contains(v))
                                .collect(Collectors.toSet());
                if (writable.isEmpty()) throw new SessionException("invalid_submission");
                // SDK3 otherwise falls back to the highest advertised version, including 1.x.
                destination.setMetadataVersions(writable);
            }
            return new HttpResponse<>(response.status(), value);
        } catch (SessionException e) {
            throw e;
        } catch (Exception e) {
            throw new SessionException("resource_unavailable");
        }
    }

    public <P, R> HttpResponse<R> post(String u, Map<String, String> h, P p, Class<R> t) {
        return request("POST", u, h, p, t);
    }

    public <R> HttpResponse<R> get(String u, Map<String, String> h, Class<R> t) {
        return request("GET", u, h, null, t);
    }

    public <P, R> HttpResponse<R> put(String u, Map<String, String> h, P p, Class<R> t) {
        return request("PUT", u, h, p, t);
    }

    public <P, R> HttpResponse<R> patch(String u, Map<String, String> h, P p, Class<R> t) {
        throw new SessionException("endpoint_blocked");
    }

    public HttpResponse<Void> delete(String u, Map<String, String> h) {
        throw new SessionException("endpoint_blocked");
    }
}
