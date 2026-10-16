package org.fitconnect.integration.host;

import com.google.gson.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Schema identifiers map only to complete files staged by this native session, never to paths or
 * network fetches.
 */
final class ReceiveRequest {
    private record Reference(String uri, String contentId) {}

    static Map<String, String> resolve(String document, ContentStore content, String owner) {
        try {
            var root = StrictJson.object(document, 24 * 1024);
            if (!(root.keySet().equals(Set.of("schemas"))
                            || root.keySet().equals(Set.of("schemas", "allowExternalSchemas")))
                    || !root.get("schemas").isJsonArray()) throw invalid();
            var rows = root.getAsJsonArray("schemas");
            if (rows.size() > 32) throw invalid();
            var references = new ArrayList<Reference>();
            var seen = new HashSet<String>();
            long total = 0;
            for (var row : rows) {
                var item = row.getAsJsonObject();
                if (!item.keySet().equals(Set.of("uri", "contentId"))) throw invalid();
                String uri = text(item, "uri"), id = DestinationAccess.id(text(item, "contentId"));
                if (SchemaSources.CONSENT.equals(uri)) throw invalid();
                // Validate identifiers before reading any file-sized byte array.
                new ReceiveSchemas(Map.of(uri, ""));
                if (!seen.add(uri)) throw invalid();
                long size = content.length(owner, id);
                if (size > 2 * 1024 * 1024 || (total += size) > 16 * 1024 * 1024)
                    throw new SessionException("content_limit");
                references.add(new Reference(uri, id));
            }
            var result = new LinkedHashMap<String, String>();
            for (var reference : references) {
                byte[] bytes = content.read(owner, reference.contentId());
                try {
                    String source =
                            StandardCharsets.UTF_8
                                    .newDecoder()
                                    .onMalformedInput(CodingErrorAction.REPORT)
                                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                                    .decode(ByteBuffer.wrap(bytes))
                                    .toString();
                    result.put(reference.uri(), source);
                } finally {
                    Arrays.fill(bytes, (byte) 0);
                }
            }
            if (root.has("allowExternalSchemas")) {
                var allowed = root.get("allowExternalSchemas");
                if (!allowed.isJsonPrimitive() || !allowed.getAsJsonPrimitive().isBoolean())
                    throw invalid();
                if (allowed.getAsBoolean()) result.put(SchemaSources.CONSENT, "true");
            }
            new ReceiveSchemas(result);
            return Map.copyOf(result);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw invalid();
        }
    }

    private static String text(JsonObject item, String name) {
        var value = item.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw invalid();
        return value.getAsString();
    }

    private static SessionException invalid() {
        return new SessionException("invalid_input");
    }
}
