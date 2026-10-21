package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates content operations. SessionState owns lifetime and cleanup. */
final class SessionContent {
    private final SessionState state;

    SessionContent(SessionState state) {
        this.state = state;
    }

    Data<?> content(
            ApiVersion version,
            String id,
            String command,
            String contentId,
            long totalBytes,
            long byteOffset,
            String chunk) {
        Entry entry = this.state.find(version, id);
        Object data =
                switch (command) {
                    case "begin_content" -> this.state.content.begin(entry.id(), totalBytes);
                    case "append_content" ->
                            this.state.content.append(entry.id(), contentId, byteOffset, chunk);
                    case "discard_content" -> this.state.content.discard(entry.id(), contentId);
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), entry.id(), "TEST", data);
    }

    Data<?> sendSchema(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            String document,
            String schemaId,
            int offset) {
        Entry entry = this.state.find(version, id);
        Object data =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "load_send_destination" ->
                                            SendSchemas.destination(session, destinationId);
                                    case "load_send_schema" ->
                                            this.state
                                                    .sendSchemas
                                                    .computeIfAbsent(
                                                            id, ignored -> new SendSchemas())
                                                    .load(session, destinationId, document);
                                    case "validate_send_data" ->
                                            SendDataValidation.validate(
                                                    session,
                                                    destinationId,
                                                    document,
                                                    this.state.content,
                                                    id);
                                    case "read_send_schema" -> {
                                        var schemas = this.state.sendSchemas.get(id);
                                        if (schemas == null)
                                            throw new SessionException("invalid_resource");
                                        yield schemas.read(schemaId, offset);
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    Data<?> exportSessionItem(ApiVersion version, String id, int offset) {
        var entry = this.state.find(version, id);
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                this.state
                                        .archives
                                        .computeIfAbsent(id, ignored -> new SessionArchives())
                                        .export(session, this.state.localKeys.get(id), offset)));
    }

    Data<?> restoreSessionItem(ApiVersion version, String id, String document) {
        var entry = this.state.find(version, id);
        var item = SessionArchives.parse(document);
        this.state.registry.withSession(
                version,
                entry.session(),
                session -> {
                    if (item.generatedKey() != null)
                        this.state
                                .localKeys
                                .computeIfAbsent(id, ignored -> new LocalTestKeys())
                                .restore(session, item);
                    else if (item.destinationKey() != null) {
                        var key = item.destinationKey();
                        entry.destinations().load(session, key.destinationId());
                        entry.destinations()
                                .importKey(
                                        session,
                                        key.destinationId(),
                                        key.purpose(),
                                        item.privateJwk());
                        if (!session.loadedKeys().contains(key))
                            throw new SessionException("key_rejected");
                    } else session.restoreReplyKey(item, this.state.content.workspace(id));
                    return null;
                });
        return new Data<>(version.wireValue(), id, "TEST", Map.of("restored", true));
    }
}
