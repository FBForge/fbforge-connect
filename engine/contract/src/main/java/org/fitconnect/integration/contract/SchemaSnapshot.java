package org.fitconnect.integration.contract;

import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * Optional schema resources and bounded validation locations captured during verification.
 * Diagnostics describe schema constraints and do not include received field values.
 */
public record SchemaSnapshot(String schemaUri, String document) {
    public SchemaSnapshot {
        try {
            if (schemaUri == null
                    || schemaUri.length() > 4096
                    || !URI.create(schemaUri).isAbsolute()
                    || document != null
                            && document.getBytes(StandardCharsets.UTF_8).length > 24 * 1024 * 1024)
                throw new IllegalArgumentException();
        } catch (Exception failure) {
            throw new SessionException("invalid_resource");
        }
    }

    @Override
    public String toString() {
        return "SchemaSnapshot[document omitted]";
    }
}
