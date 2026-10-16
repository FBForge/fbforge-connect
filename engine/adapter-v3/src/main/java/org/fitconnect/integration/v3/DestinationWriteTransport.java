package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.http.api.*;
import org.fitconnect.integration.contract.*;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;

/** Only the host's confirmed one-shot destination gate may dispatch destination mutations. */
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
    private <P,R> HttpResponse<R> write(String method, String url, Map<String,String> headers, P payload, Class<R> type) {
        try {
            var response = authorized.request(method, url, headers, json.writeValueAsString(payload));
            if (response == null || response.status() < 200 || response.status() >= 300) throw new SessionException("resource_unavailable");
            if (type == Void.class) return new HttpResponse<>(response.status(), null);
            return new HttpResponse<>(response.status(), json.readValue(response.body(), type));
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("invalid_resource"); }
    }
    public <R> HttpResponse<R> get(String u, Map<String,String> h, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { return write("POST", u, h, p, t); }
    public <P,R> HttpResponse<R> put(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) {
        var response = authorized.request("DELETE", u, h, null);
        if (response == null || response.status() != 204) throw new SessionException("invalid_resource");
        return new HttpResponse<>(204, null);
    }
    private static SessionException blocked() { return new SessionException("endpoint_blocked"); }
}
