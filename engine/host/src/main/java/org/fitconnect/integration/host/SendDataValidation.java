package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Read-only validation of the exact session-owned data against a destination-advertised schema. */
final class SendDataValidation {
    record Result(String schemaUri, String mimeType, int dataBytes, boolean valid) {}

    static Result validate(
            AuthenticatedSession session,
            String destinationId,
            String document,
            ContentStore content,
            String owner) {
        var request = StrictJson.object(document, 24 * 1024);
        if (!request.keySet()
                .equals(
                        Set.of(
                                "serviceIdentifier",
                                "schemaUri",
                                "processModelId",
                                "messageId",
                                "allowExternalSchemas",
                                "mimeType",
                                "contentId",
                                "schemas"))) throw new SessionException("invalid_input");
        String mime = string(request, "mimeType"),
                uri = string(request, "schemaUri"),
                handle = DestinationAccess.id(string(request, "contentId"));
        if (!Set.of("application/json", "application/xml").contains(mime))
            throw new SessionException("invalid_input");
        if (content.length(owner, handle) < 1
                || content.length(owner, handle) > ContentStore.FILE_BYTES)
            throw new SessionException("content_limit");
        var schemaRequest = new JsonObject();
        for (String key :
                List.of(
                        "serviceIdentifier",
                        "schemaUri",
                        "processModelId",
                        "messageId",
                        "allowExternalSchemas",
                        "mimeType")) schemaRequest.add(key, request.get(key));
        var references = new JsonObject();
        references.add("schemas", request.get("schemas"));
        var local = ReceiveRequest.resolve(references.toString(), content, owner);
        for (var entry : local.entrySet()) {
            if (!entry.getValue().stripLeading().startsWith("{")) continue;
            var schema = StrictJson.object(entry.getValue(), 2 * 1024 * 1024);
            if (schema.has("$id")
                    && !SchemaSources.documentUri(string(schema, "$id"))
                            .equals(SchemaSources.documentUri(entry.getKey())))
                throw new SessionException("schema_id_mismatch");
        }
        var schemas = new SendSchemas();
        byte[] bytes = null;
        try {
            schemas.load(
                    session, DestinationAccess.id(destinationId), schemaRequest.toString(), local);
            bytes = content.read(owner, handle);
            if (!session.validateDraft(schemas.snapshot(), mime, bytes))
                throw new SessionException("data_schema_invalid");
            return new Result(uri, mime, bytes.length, true);
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
            schemas.clear();
        }
    }

    private static String string(JsonObject value, String key) {
        var field = value.get(key);
        if (field == null || !field.isJsonPrimitive() || !field.getAsJsonPrimitive().isString())
            throw new SessionException("invalid_input");
        return field.getAsString();
    }
}
