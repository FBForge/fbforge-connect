package org.fitconnect.integration.host;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Native-only, sequential backup transfer. Private records never become a renderer response. */
final class DestinationBackupSource {
    record Part(int offset, int total, JsonObject item) {
        @Override
        public String toString() {
            return "DestinationBackupPart[material omitted]";
        }
    }

    private List<JsonObject> snapshot;
    private String destination;
    private int next;
    private long expires;

    Part read(AuthenticatedSession session, LocalTestKeys generated, String id, int offset) {
        id = DestinationAccess.id(id);
        if (offset == 0) {
            clear();
            var detail = StrictJson.object(session.ownDestination(id), 44000);
            if (!id.equals(DestinationConfiguration.text(detail.get("destinationId"), 36)))
                throw new SessionException("invalid_resource");
            var parts = new ArrayList<JsonObject>();
            parts.add(part("configuration", detail));
            int count = -1;
            var seen = new HashSet<String>();
            for (int position = 0; ; ) {
                var page =
                        StrictJson.object(
                                session.ownDestinationKeys(id, position, 50), 1024 * 1024);
                int total = page.get("totalCount").getAsInt();
                var keys = page.getAsJsonArray("keys");
                if (total < 0
                        || total > 128
                        || count != -1 && count != total
                        || page.get("offset").getAsInt() != position
                        || keys.size() > 50
                        || page.get("count").getAsInt() != keys.size()
                        || position + keys.size() > total
                        || keys.isEmpty() && position != total)
                    throw new SessionException("invalid_resource");
                count = total;
                for (var value : keys) {
                    var key = value.getAsJsonObject();
                    if (!seen.add(DestinationConfiguration.text(key.get("kid"), 512)))
                        throw new SessionException("invalid_resource");
                    parts.add(part("public_key", key));
                }
                position += keys.size();
                if (position == total) break;
            }
            if (!detail.equals(StrictJson.object(session.ownDestination(id), 44000)))
                throw new SessionException("destination_conflict");
            var archive = new ArrayList<>(session.archiveKeys());
            if (generated != null) archive.addAll(generated.archive());
            if (archive.size() > 176) throw new SessionException("content_limit");
            for (var key : archive) {
                boolean matching =
                        key.destinationKey() != null
                                ? id.equals(key.destinationKey().destinationId())
                                : key.generatedKey() != null
                                        && key.generatedKey().destinationId() != null
                                        && id.equals(key.generatedKey().destinationId().toString());
                if (matching)
                    parts.add(part("private_key", new Gson().toJsonTree(key).getAsJsonObject()));
            }
            snapshot = List.copyOf(parts);
            destination = id;
            expires = System.nanoTime() + 120_000_000_000L;
        }
        if (snapshot == null
                || !id.equals(destination)
                || offset != next
                || System.nanoTime() >= expires
                || offset > snapshot.size()) {
            clear();
            throw new SessionException("invalid_resource");
        }
        var result =
                new Part(
                        offset,
                        snapshot.size(),
                        offset == snapshot.size() ? null : snapshot.get(offset));
        if (result.item() == null) clear();
        else next++;
        return result;
    }

    private static JsonObject part(String kind, JsonObject value) {
        var part = new JsonObject();
        part.addProperty("kind", kind);
        part.add("value", value.deepCopy());
        if (part.toString().getBytes(StandardCharsets.UTF_8).length > 56000)
            throw new SessionException("content_limit");
        return part;
    }

    void clear() {
        snapshot = null;
        destination = null;
        next = 0;
        expires = 0;
    }
}
