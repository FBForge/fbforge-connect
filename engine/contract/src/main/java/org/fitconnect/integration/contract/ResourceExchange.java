package org.fitconnect.integration.contract;

import java.util.Map;

/** Native-only TEST transport seam. Mutations require an explicit implementation. */
@FunctionalInterface
public interface ResourceExchange {
    String get(String endpoint, Map<String, String> headers);

    record Response(int status, String body) {}

    default Response request(String method, String endpoint, Map<String, String> headers, String body) {
        if ("GET".equals(method)) return new Response(200, get(endpoint, headers));
        throw new SessionException("endpoint_blocked");
    }
}
