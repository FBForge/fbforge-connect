package org.fitconnect.integration.v2;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.fitko.fitconnect.api.services.http.*;
import org.fitconnect.integration.contract.*;
import java.util.Map;

/** SDK reads with independent credential-free, bounded public schema loading. */
final class ReceiverTransport implements HttpClient {
    private final ResourceExchange read;
    private final ReceiveSchemas schemas;
    final SchemaValidation validation;
    private boolean schemaFailed;
    String schemaFailureCode = "schema_unavailable";
    void failed(SessionException failure) { schemaFailed = true; schemaFailureCode = failure.code(); }
    boolean schemaFailed() { return schemaFailed; }
    private final ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            .registerModule(new JavaTimeModule());
    ReceiverTransport(ResourceExchange read, Map<String,String> schemas) { this.read = read; this.schemas = new ReceiveSchemas(schemas); this.validation = new SchemaValidation(schemas, "true".equals(schemas.get(SchemaSources.CONSENT))); }
    String localSchema(String uri) {
        String local = schemas.get(uri);
        try { return local == null ? null : SchemaSafety.check(local); }
        catch (SessionException failure) { failed(failure); throw failure; }
    }
    public <R> HttpResponse<R> get(String url, Map<String,String> headers, Class<R> type) {
        try {
            String body;
            if (type == String.class && headers.isEmpty() && schemas.get(url) != null) body = localSchema(url);
            else {
                if (!url.startsWith("https://test.fit-connect.fitko.dev/submission-api/")) {
                    if (type != String.class || !headers.isEmpty()) throw new SessionException("endpoint_blocked");
                    try { body = validation.sources.document(url); }
                    catch (SessionException failure) { failed(failure); throw failure; }
                } else body = read.get(url, headers);
            }
            return new HttpResponse<>(200, type == String.class ? type.cast(body) : mapper.readValue(body, type));
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("invalid_resource"); }
    }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> put(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> patch(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) { throw blocked(); }
    private static SessionException blocked() { return new SessionException("endpoint_blocked"); }
}
