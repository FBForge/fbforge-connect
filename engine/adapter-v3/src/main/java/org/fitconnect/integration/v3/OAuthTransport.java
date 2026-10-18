package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.http.api.*;
import java.util.Map;
import java.util.Set;
import org.fitconnect.integration.contract.*;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

final class OAuthTransport implements HttpService {
    private final TokenExchange exchange;
    private final ResourceExchange resources;
    private final JsonMapper mapper =
            JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    OAuthTransport(TokenExchange exchange, ResourceExchange resources) {
        this.exchange = exchange;
        this.resources = resources;
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
            for (String field :
                    Set.of(
                            "secret",
                            "clientSecret",
                            "client_secret",
                            "accessToken",
                            "access_token",
                            "refreshToken",
                            "refresh_token")) object.remove(field);
        }
        if (node.isContainer()) for (JsonNode child : node) redactSecrets(child);
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

    public <R> HttpResponse<R> get(String u, Map<String, String> h, Class<R> t) {
        String body = resources.get(u, h);
        try {
            return new HttpResponse<>(200, mapper.readValue(body, t));
        } catch (Exception e) {
            throw new SessionException("resource_unavailable");
        }
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
