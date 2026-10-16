package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.services.http.*;
import dev.fitko.fitconnect.api.domain.model.reply.*;
import org.fitconnect.integration.contract.*;
import java.util.*;

/** Read-only SDK validation plus the one host-authorized reply receipt PUT. */
final class ReplyReceiptTransport implements HttpClient {
    static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();
    private final ResourceExchange authorized;
    private final ReceiverTransport reader;
    ReplyReceiptTransport(ResourceExchange authorized) {
        this.authorized = Objects.requireNonNull(authorized); reader = new ReceiverTransport(authorized, Map.of());
    }
    public <R> HttpResponse<R> get(String url, Map<String,String> headers, Class<R> type) { return reader.get(url, headers, type); }
    public <P,R> HttpResponse<R> put(String url, Map<String,String> headers, P payload, Class<R> type) {
        try {
            if (type != String.class || !(payload instanceof AcceptReply || payload instanceof RejectReply)) throw new SessionException("endpoint_blocked");
            var result = authorized.request("PUT", url, headers, JSON.writeValueAsString(payload));
            if (result == null || result.status() < 200 || result.status() >= 300 || result.body() == null || result.body().length() > 65536)
                throw new SessionException("invalid_resource");
            return new HttpResponse<>(result.status(), type.cast(result.body()));
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("resource_unavailable"); }
    }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { throw new SessionException("endpoint_blocked"); }
    public <P,R> HttpResponse<R> patch(String u, Map<String,String> h, P p, Class<R> t) { throw new SessionException("endpoint_blocked"); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) { throw new SessionException("endpoint_blocked"); }
}
