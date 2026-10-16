package org.fitconnect.integration.v3;

import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import dev.fitko.fitconnect.core.http.api.*;
import org.fitconnect.integration.contract.*;
import java.util.Map;

/** SDK reads with independent credential-free, bounded public schema loading. */
final class ReceiverTransport implements HttpService {
    private final ResourceExchange read;
    private final ReceiveSchemas schemas;
    final SchemaValidation validation;
    private boolean schemaFailed;
    // SDK key validation may catch a failed read and try again. Keep the original bounded host error.
    private SessionException readFailure;
    SessionException readFailure() { return readFailure; }
    String schemaFailureCode = "schema_unavailable";
    void failed(SessionException failure) { schemaFailed = true; schemaFailureCode = failure.code(); }
    boolean schemaFailed() { return schemaFailed; }
    private final JsonMapper mapper = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
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
        } catch (SessionException failure) {
            if (readFailure == null) readFailure = failure;
            throw failure;
        } catch (Exception failure) {
            if (readFailure == null) readFailure = new SessionException("invalid_resource");
            throw readFailure;
        }
    }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> put(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> patch(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) { throw blocked(); }
    private static SessionException blocked() { return new SessionException("endpoint_blocked"); }
}
