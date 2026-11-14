package org.fitconnect.integration.host;

import java.nio.charset.StandardCharsets;

/** Bounded optional display labels; never used as resource identities. */
final class CaseDisplay {
    static String title(byte[] metadata, String fallback) {
        try {
            var json =
                    StrictJson.object(
                            new String(metadata, StandardCharsets.UTF_8), 2 * 1024 * 1024);
            if (json.has("subject")
                    && json.get("subject").isJsonPrimitive()
                    && json.get("subject").getAsJsonPrimitive().isString()) {
                String value = json.get("subject").getAsString();
                if (!value.isBlank()
                        && value.length() <= 256
                        && value.chars().noneMatch(Character::isISOControl)) return value;
            }
        } catch (RuntimeException ignored) {
            /* Optional display label only. */
        }
        return fallback;
    }
}
