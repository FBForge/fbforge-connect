package org.fitconnect.integration.v2;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.fitko.fitconnect.api.services.http.*;
import java.util.Map;
import java.util.Set;
import org.fitconnect.integration.contract.*;

/** SDK serialization stays in this adapter, while the shared transport enforces TEST-only HTTP. */
final class OAuthTransport implements HttpClient {
    private final TokenExchange exchange;
    private final ResourceExchange resources;
    private final ObjectMapper mapper =
            new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    OAuthTransport(TokenExchange exchange, ResourceExchange resources) {
        this.exchange = exchange;
        this.resources = resources;
    }

    public <P, R> HttpResponse<R> post(
            String url, Map<String, String> headers, P payload, Class<R> type) {
        if (!(payload instanceof String body)) throw new SessionException("authentication_failed");
        String response = exchange.post(url, body);
        try {
            return new HttpResponse<>(200, mapper.readValue(response, type));
        } catch (Exception e) {
            throw new SessionException("authentication_failed");
        }
    }

    public <R> HttpResponse<R> get(String url, Map<String, String> headers, Class<R> type) {
        String response = resources.get(url, headers);
        try {
            return new HttpResponse<>(200, mapper.readValue(response, type));
        } catch (Exception e) {
            throw new SessionException("resource_unavailable");
        }
    }

    String json(Object value) {
        try {
            JsonNode tree = mapper.valueToTree(value);
            redactSecrets(tree);
            return mapper.writeValueAsString(tree);
        } catch (Exception e) {
            throw new SessionException("resource_unavailable");
        }
    }

    private static void redactSecrets(JsonNode node) {
        if (node.isObject()) {
            ObjectNode object = (ObjectNode) node;
            object.remove(
                    Set.of(
                            "secret",
                            "clientSecret",
                            "client_secret",
                            "accessToken",
                            "access_token",
                            "refreshToken",
                            "refresh_token"));
            object.elements().forEachRemaining(OAuthTransport::redactSecrets);
        } else if (node.isArray()) node.elements().forEachRemaining(OAuthTransport::redactSecrets);
    }

    public <P, R> HttpResponse<R> put(String u, Map<String, String> h, P p, Class<R> t) {
        throw new SessionException("endpoint_blocked");
    }

    public <P, R> HttpResponse<R> patch(String u, Map<String, String> h, P p, Class<R> t) {
        throw new SessionException("endpoint_blocked");
    }

    public HttpResponse<Void> delete(String u, Map<String, String> h) {
        throw new SessionException("endpoint_blocked");
    }
}
