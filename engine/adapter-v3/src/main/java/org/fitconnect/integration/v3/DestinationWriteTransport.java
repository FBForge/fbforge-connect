package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.http.api.*;
import org.fitconnect.integration.contract.*;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;

/** Only the host's confirmed one-shot destination gate may dispatch a PATCH. */
final class DestinationWriteTransport implements HttpService {
    private final ResourceExchange authorized;
    private final JsonMapper json = JsonMapper.builder().disable(tools.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    DestinationWriteTransport(ResourceExchange authorized) { this.authorized = authorized; }
    public <P,R> HttpResponse<R> patch(String url, Map<String,String> headers, P payload, Class<R> type) {
        try {
            var response = authorized.request("PATCH", url, headers, json.writeValueAsString(payload));
            if (response.status() != 200) throw new SessionException("resource_unavailable", response.status());
            return new HttpResponse<>(response.status(), json.readValue(response.body(), type));
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("invalid_resource"); }
    }
    public <R> HttpResponse<R> get(String u, Map<String,String> h, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> put(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) { throw blocked(); }
    private static SessionException blocked() { return new SessionException("endpoint_blocked"); }
}
