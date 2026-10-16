package org.fitconnect.integration.host;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** One bounded public schema per native session. Only a destination-advertised URI may be loaded. */
final class SendSchemas {
    record Destination(String destinationId, String detailsJson) {}
    record Page(String schemaId, String schemaUri, int totalBytes, int byteOffset, String chunk) {}
    private String id, uri;
    private byte[] bytes;

    static Destination destination(AuthenticatedSession session, String destinationId) {
        String id = DestinationAccess.id(destinationId);
        var value = StrictJson.object(session.destination(id), 24 * 1024);
        if (!value.has("destinationId") || !id.equals(value.get("destinationId").getAsString())) throw invalid();
        return new Destination(id, value.toString());
    }

    Page load(AuthenticatedSession session, String destinationId, String document) {
        clear();
        try {
            var request = StrictJson.object(document, 24 * 1024);
            if (!request.keySet().equals(Set.of("serviceIdentifier", "schemaUri", "processModelId", "messageId", "allowExternalSchemas"))) throw invalid();
            if (!request.get("allowExternalSchemas").isJsonPrimitive() || !request.get("allowExternalSchemas").getAsJsonPrimitive().isBoolean() || !request.get("allowExternalSchemas").getAsBoolean()) throw new SessionException("schema_consent_required");
            String selected = string(request, "schemaUri"), service = string(request, "serviceIdentifier");
            String model = string(request, "processModelId"), message = string(request, "messageId");
            var root = StrictJson.object(destination(session, destinationId).detailsJson(), 24 * 1024);
            boolean allowed = false;
            String collection = model.isEmpty() ? "publicServices" : "processMessages";
            if (root.has(collection)) for (var item : root.getAsJsonArray(collection)) {
                var offer = item.getAsJsonObject();
                boolean matches = model.isEmpty() ? service.equals(string(offer, "identifier"))
                        : model.equals(string(offer, "processModelId")) && message.equals(string(offer, "messageId"));
                if (matches && offer.has(model.isEmpty() ? "submissionSchemas" : "schemas"))
                    for (var schema : offer.getAsJsonArray(model.isEmpty() ? "submissionSchemas" : "schemas"))
                        if (selected.equals(string(schema.getAsJsonObject(), "schemaUri"))) allowed = true;
            }
            if (!allowed) throw invalid();
            byte[] loaded = session.publicSchema(selected).getBytes(StandardCharsets.UTF_8);
            if (loaded.length == 0 || loaded.length > 24 * 1024 * 1024) throw new SessionException("content_limit");
            bytes = loaded; uri = selected; id = UUID.randomUUID().toString();
            return read(id, 0);
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw invalid(); }
    }
    Page read(String schemaId, int offset) {
        if (bytes == null || !Objects.equals(id, schemaId) || offset < 0 || offset > bytes.length) throw invalid();
        return new Page(id, uri, bytes.length, offset,
                Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes, offset, Math.min(offset + 12 * 1024, bytes.length))));
    }
    void clear() { if (bytes != null) Arrays.fill(bytes, (byte) 0); bytes = null; uri = null; id = null; }
    private static String string(JsonObject object, String name) {
        var value = object.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString() || value.getAsString().length() > 4096) throw invalid();
        return value.getAsString();
    }
    private static SessionException invalid() { return new SessionException("invalid_input"); }
}
