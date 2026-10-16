package org.fitconnect.integration.host;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import java.util.*;

/** Private, bounded native persistence protocol. No Tauri command forwards these documents to the renderer. */
final class SessionArchives {
    record Item(int offset, int total, SessionKeyArchive item) {
        @Override public String toString() { return "Item[private archive omitted]"; }
    }
    static Item export(AuthenticatedSession session, int offset) {
        var items = session.archiveKeys();
        if (items.size() > 48 || offset < 0 || offset > items.size()) throw new SessionException("invalid_input");
        return new Item(offset, items.size(), offset == items.size() ? null : items.get(offset));
    }
    static SessionKeyArchive parse(String document) {
        try {
            var value = StrictJson.object(document, 32768);
            if (!value.keySet().equals(Set.of("destinationKey", "replyChannel", "expectedCase", "privateJwk", "schemaUri", "mimeType")))
                throw new IllegalArgumentException();
            return new Gson().fromJson(value, SessionKeyArchive.class);
        } catch (Exception failure) { throw new SessionException("invalid_input"); }
    }
    private SessionArchives() {}
}
