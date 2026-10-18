package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Private, bounded native persistence protocol. No Tauri command forwards these documents to the
 * renderer.
 */
final class SessionArchives {
    record Item(int offset, int total, SessionKeyArchive item) {
        @Override
        public String toString() {
            return "Item[private archive omitted]";
        }
    }

    private List<SessionKeyArchive> snapshot;
    private int next;
    private long expires;

    Item export(AuthenticatedSession session, LocalTestKeys generated, int offset) {
        if (offset == 0) {
            clear();
            var items = new ArrayList<>(session.archiveKeys());
            if (generated != null) items.addAll(generated.archive());
            if (items.size() > 176) throw new SessionException("content_limit");
            snapshot = List.copyOf(items);
            expires = System.nanoTime() + 120_000_000_000L;
        }
        if (snapshot == null
                || offset != next
                || offset > snapshot.size()
                || System.nanoTime() >= expires) {
            clear();
            throw new SessionException("invalid_resource");
        }
        var result =
                new Item(
                        offset,
                        snapshot.size(),
                        offset == snapshot.size() ? null : snapshot.get(offset));
        if (result.item() == null) clear();
        else next++;
        return result;
    }

    void clear() {
        snapshot = null;
        next = 0;
        expires = 0;
    }

    static SessionKeyArchive parse(String document) {
        try {
            var value = StrictJson.object(document, 56000);
            var fields =
                    new HashSet<>(
                            Set.of(
                                    "destinationKey",
                                    "replyChannel",
                                    "expectedCase",
                                    "privateJwk",
                                    "schemaUri",
                                    "mimeType"));
            // Read the first profile format as well; new snapshots explicitly include generatedKey.
            if (value.has("generatedKey")) fields.add("generatedKey");
            if (value.has("replyMessages")) fields.add("replyMessages");
            if (!value.keySet().equals(fields)) throw new IllegalArgumentException();
            return new Gson().fromJson(value, SessionKeyArchive.class);
        } catch (Exception failure) {
            throw new SessionException("invalid_input");
        }
    }
}
