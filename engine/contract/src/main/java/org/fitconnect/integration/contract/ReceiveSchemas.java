package org.fitconnect.integration.contract;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Explicit, bounded in-memory schemas. The SDK cannot turn a schema reference into a network
 * request.
 */
public final class ReceiveSchemas {
    private final Map<String, String> documents;

    public ReceiveSchemas(Map<String, String> source) {
        if (source == null || source.size() > 33) throw new SessionException("invalid_input");
        long total = 0;
        for (var item : source.entrySet()) {
            if (SchemaSources.CONSENT.equals(item.getKey())) {
                if (!"true".equals(item.getValue())) throw new SessionException("invalid_input");
                continue;
            }
            try {
                var uri = URI.create(item.getKey());
                if (!uri.isAbsolute()
                        || item.getKey().length() > 4096
                        || "test.fit-connect.fitko.dev".equalsIgnoreCase(uri.getHost())
                        || item.getValue() == null
                        || item.getValue().length() > 2 * 1024 * 1024)
                    throw new IllegalArgumentException();
                int size = item.getValue().getBytes(StandardCharsets.UTF_8).length;
                if (size > 2 * 1024 * 1024) throw new IllegalArgumentException();
                total += size;
                if (total > 16 * 1024 * 1024) throw new IllegalArgumentException();
            } catch (Exception failure) {
                throw new SessionException("invalid_input");
            }
        }
        documents = Map.copyOf(source);
    }

    public String get(String uri) {
        return documents.get(uri);
    }
}
