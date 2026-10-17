package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.http.api.*;
import java.util.Map;
import java.util.Objects;
import org.fitconnect.integration.contract.*;

/** Only the SDK's serialized case-event POST may cross the host's one-shot receipt gate. */
final class ReceiptTransport implements HttpService {
    private final ResourceExchange authorized;

    ReceiptTransport(ResourceExchange authorized) {
        this.authorized = Objects.requireNonNull(authorized);
    }

    public <P, R> HttpResponse<R> post(
            String url, Map<String, String> headers, P payload, Class<R> type) {
        if (!(payload instanceof String body) || type != Void.class)
            throw new SessionException("endpoint_blocked");
        var result = authorized.request("POST", url, headers, body);
        if (result == null
                || result.status() < 200
                || result.status() >= 300
                || !"".equals(result.body())) throw new SessionException("invalid_resource");
        return new HttpResponse<>(result.status(), null);
    }

    public <R> HttpResponse<R> get(String u, Map<String, String> h, Class<R> t) {
        throw new SessionException("endpoint_blocked");
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
