package org.fitconnect.integration.host;

import com.google.gson.*;
import com.google.gson.stream.*;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import org.fitconnect.integration.contract.SessionException;

/** Bounded JSON documents with no ambiguous duplicate members, including nested JWK fields. */
final class StrictJson {
    static JsonObject object(String text, int maxBytes) {
        try {
            if (text == null || text.getBytes(StandardCharsets.UTF_8).length > maxBytes) throw new IllegalArgumentException();
            var reader = new JsonReader(new StringReader(text));
            reader.setStrictness(Strictness.STRICT);
            JsonElement value = read(reader, 0, new int[]{10000});
            if (!value.isJsonObject() || reader.peek() != JsonToken.END_DOCUMENT) throw new IllegalArgumentException();
            return value.getAsJsonObject();
        } catch (Exception e) { throw new SessionException("invalid_resource"); }
    }
    private static JsonElement read(JsonReader reader, int depth, int[] remaining) throws Exception {
        if (depth > 32 || --remaining[0] < 0) throw new IllegalArgumentException();
        return switch (reader.peek()) {
            case BEGIN_OBJECT -> {
                reader.beginObject(); var result = new JsonObject(); var names = new HashSet<String>();
                while (reader.hasNext()) {
                    String name = reader.nextName();
                    if (!names.add(name)) throw new IllegalArgumentException();
                    result.add(name, read(reader, depth + 1, remaining));
                }
                reader.endObject(); yield result;
            }
            case BEGIN_ARRAY -> {
                reader.beginArray(); var result = new JsonArray();
                while (reader.hasNext()) result.add(read(reader, depth + 1, remaining));
                reader.endArray(); yield result;
            }
            case STRING -> new JsonPrimitive(reader.nextString());
            case NUMBER -> JsonParser.parseString(reader.nextString());
            case BOOLEAN -> new JsonPrimitive(reader.nextBoolean());
            case NULL -> { reader.nextNull(); yield JsonNull.INSTANCE; }
            default -> throw new IllegalArgumentException();
        };
    }
}
