package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.services.http.HttpClient;
import dev.fitko.fitconnect.api.services.http.HttpResponse;
import dev.fitko.fitconnect.core.validation.xml.XRepoSchemaLoader;
import org.fitconnect.integration.contract.SessionException;
import java.io.*;
import java.net.URI;
import java.util.*;
import java.util.function.Function;

/** The SDK's XÖV archive loader, with credential-free, bounded public transport. */
final class SdkXmlSchemas implements HttpClient {
    private final String endpoint;
    private final Function<String,byte[]> download;
    private SdkXmlSchemas(String identifier, Function<String,byte[]> download) {
        endpoint = "https://www.xrepository.de/api/version_standard/" + identifier + "/xmlschema";
        this.download = download;
    }
    static Map<String,byte[]> load(String identifier) { return load(identifier, PublicSchemaHttp::archive); }
    static Map<String,byte[]> load(String identifier, Function<String,byte[]> download) {
        try {
            String id = org.fitconnect.integration.contract.SchemaSources.documentUri(identifier);
            var files = new XRepoSchemaLoader(new SdkXmlSchemas(id, download)).loadSchemas(URI.create(id));
            if (files.isEmpty()) throw new SessionException("schema_archive_invalid");
            return files;
        }
        catch (SessionException failure) { throw failure;
        } catch (RuntimeException failure) { throw new SessionException("schema_archive_invalid"); }
    }
    public <R> HttpResponse<R> get(String url, Map<String,String> headers, Class<R> type) {
        if (!endpoint.equals(url) || type != InputStream.class || !Map.of("Accept", "application/zip").equals(headers))
            throw new SessionException("endpoint_blocked");
        return new HttpResponse<>(200, type.cast(new ByteArrayInputStream(download.apply(url))));
    }
    public <P,R> HttpResponse<R> post(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> put(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public <P,R> HttpResponse<R> patch(String u, Map<String,String> h, P p, Class<R> t) { throw blocked(); }
    public HttpResponse<Void> delete(String u, Map<String,String> h) { throw blocked(); }
    private static SessionException blocked() { return new SessionException("endpoint_blocked"); }
}
