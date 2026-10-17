package org.fitconnect.integration.contract;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Closed, versioned examples shared with the frontend. No network resolver or official FIM/XÖV
 * claim.
 */
public final class DemoSchemas {
    public static final String APPLICATION = "urn:fit-connect:test-client:demo:application:1";
    public static final String REPLY = "urn:fit-connect:test-client:demo:reply:1";
    private static final Map<String, String> DOCUMENTS =
            Map.of(APPLICATION, read("application"), REPLY, read("reply"));

    public static boolean contains(String uri) {
        return DOCUMENTS.containsKey(uri);
    }

    public static String document(String uri) {
        return DOCUMENTS.get(uri);
    }

    private static String read(String name) {
        try (var input = DemoSchemas.class.getResourceAsStream("demo/" + name + ".schema.json")) {
            if (input == null) throw new IllegalStateException("Bundled demo schema missing");
            byte[] bytes = input.readNBytes(32769);
            if (bytes.length > 32768)
                throw new IllegalStateException("Bundled demo schema too large");
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Bundled demo schema unavailable", failure);
        }
    }

    private DemoSchemas() {}
}
