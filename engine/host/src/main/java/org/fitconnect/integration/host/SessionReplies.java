package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates replies operations. SessionState owns lifetime and cleanup. */
final class SessionReplies {
    private final SessionState state;

    SessionReplies(SessionState state) {
        this.state = state;
    }

    ReplyRecipient replyRecipient(Entry entry, ReceiveStore.Summary proof) {
        var recipient =
                this.state.registry.withSession(
                        entry.key().version(),
                        entry.session(),
                        session ->
                                session.replyRecipient(
                                        proof.destinationId(), proof.submissionId()));
        if (!recipient.caseId().toString().equals(proof.caseId()))
            throw new SessionException("verification_failed");
        return recipient;
    }

    Data<?> replyTarget(ApiVersion version, String id, String proofId, int offset) {
        Entry entry = this.state.find(version, id);
        var proof = this.state.received.state(version, id, proofId);
        var recipient = replyRecipient(entry, proof);
        var schemas = recipient.schemas();
        if (offset < 0 || offset > schemas.size() || offset % 2 != 0)
            throw new SessionException("invalid_input");
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new ReplyTarget(
                        proofId,
                        proof.destinationId(),
                        proof.submissionId(),
                        proof.caseId(),
                        recipient.replyDestinationId() == null
                                ? null
                                : recipient.replyDestinationId().toString(),
                        offset,
                        schemas.size(),
                        schemas.subList(offset, Math.min(offset + 2, schemas.size())).stream()
                                .map(
                                        schema ->
                                                new ReplySchema(
                                                        schema.schemaUri().toString(),
                                                        schema.mimeType()))
                                .toList(),
                        recipient.processMessages()));
    }

    Map<String, String> replyLocalSchema(String owner, String document) {
        var request = StrictJson.object(document, 24 * 1024);
        var handle = request.get("schemaContentId");
        if (handle == null || handle.isJsonNull()) return Map.of();
        if (!handle.isJsonPrimitive() || !handle.getAsJsonPrimitive().isString())
            throw new SessionException("invalid_input");
        String id = DestinationAccess.id(handle.getAsString());
        if (this.state.content.length(owner, id) > 2 * 1024 * 1024)
            throw new SessionException("content_limit");
        byte[] bytes = this.state.content.read(owner, id);
        try {
            String source =
                    java.nio.charset.StandardCharsets.UTF_8
                            .newDecoder()
                            .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                            .decode(java.nio.ByteBuffer.wrap(bytes))
                            .toString();
            var schema = StrictJson.object(source, 2 * 1024 * 1024);
            String localUri;
            try {
                var schemaId = schema.get("$id");
                if (schemaId == null
                        || !schemaId.isJsonPrimitive()
                        || !schemaId.getAsJsonPrimitive().isString())
                    throw new IllegalArgumentException();
                localUri = SchemaSources.documentUri(schemaId.getAsString());
            } catch (Exception invalidId) {
                throw new SessionException("schema_id_mismatch");
            }
            if (!localUri.equals(SchemaSources.documentUri(request.get("schemaUri").getAsString())))
                throw new SessionException("schema_id_mismatch");
            return Map.of(schema.get("$id").getAsString(), source);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_input");
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    Data<?> replySchema(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String document,
            String schemaId,
            int offset) {
        Entry entry = this.state.find(version, id);
        var proof = this.state.received.state(version, id, proofId);
        Object result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            if (command.equals("load_reply_schema")) {
                                var schema =
                                        this.state.replySchemas.computeIfAbsent(
                                                id, ignored -> new SendSchemas());
                                schema.clear();
                                return schema.loadReply(
                                        session,
                                        replyRecipient(entry, proof),
                                        proofId,
                                        document,
                                        replyLocalSchema(id, document));
                            }
                            var schemas = this.state.replySchemas.get(id);
                            if (!command.equals("read_reply_schema") || schemas == null)
                                throw new SessionException("invalid_resource");
                            return schemas.readReply(proofId, schemaId, offset);
                        });
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), result);
    }

    Data<?> prepareReply(ApiVersion version, String id, String document) {
        Entry entry = this.state.find(version, id);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        var proof = this.state.received.state(version, id, ReplyDraft.proofId(document));
        var recipient = replyRecipient(entry, proof);
        long reserved =
                this.state.entries.values().stream()
                        .mapToLong(
                                other ->
                                        other.sender().pendingBytes()
                                                + (other == entry
                                                        ? 0
                                                        : other.replySender().pendingBytes()))
                        .sum();
        var draft =
                ReplyDraft.resolve(
                        document,
                        proof,
                        this.state.content,
                        id,
                        ContentStore.TOTAL_BYTES - reserved);
        recipient.check(draft.input());
        var schemas = this.state.replySchemas.get(id);
        if (schemas == null) throw new SessionException("schema_required");
        this.state.registry.withSession(
                version,
                entry.session(),
                session -> {
                    schemas.checkReply(
                            session, proof.proofId(), draft.summary().schemaId(), draft.input());
                    return null;
                });
        try {
            if (this.state.scanners.containsKey(id))
                this.state.scanners.get(id).scan(draft.input());
        } catch (SessionException failure) {
            if (entry.replySender().state().status().equals("prepared"))
                entry.replySender().cancel(entry.replySender().state().attemptId());
            this.state.pendingReplies.remove(id);
            throw failure;
        }
        var attempt = entry.replySender().prepare(draft.input(), recipient);
        this.state.pendingReplies.put(id, draft.summary());
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new PreparedReply(
                        attempt,
                        draft.summary(),
                        this.state.scanners.containsKey(id) ? "passed" : "not_configured"));
    }

    Data<?> replySend(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = this.state.find(version, id);
        if (command.equals("execute_reply")) {
            var pending = this.state.pendingReplies.get(id);
            if (pending == null
                    || entry.replySender().pendingInput() == null
                    || !Objects.equals(attemptId, entry.replySender().state().attemptId()))
                throw new SessionException("send_locked");
            try {
                if (this.state.scanners.containsKey(id))
                    this.state.scanners.get(id).scan(entry.replySender().pendingInput());
            } catch (SessionException failure) {
                entry.replySender().cancel(attemptId);
                this.state.pendingReplies.remove(id);
                throw failure;
            }
            String recordId =
                    this.state.cases.outgoing(
                            this.state.caseScopes.get(id), entry.replySender().pendingInput());
            try {
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                entry.replySender()
                                        .execute(
                                                attemptId,
                                                session,
                                                this.state.content.workspace(id),
                                                () -> {
                                                    var proof =
                                                            this.state.received.state(
                                                                    version, id, pending.proofId());
                                                    if (!proof.destinationId()
                                                                    .equals(pending.destinationId())
                                                            || !proof.submissionId()
                                                                    .equals(pending.submissionId())
                                                            || !proof.caseId()
                                                                    .equals(pending.caseId()))
                                                        throw new SessionException(
                                                                "verification_failed");
                                                }));
            } finally {
                var outcome = entry.replySender().state();
                this.state.cases.outcome(
                        recordId,
                        outcome.status(),
                        pending.caseId(),
                        pending.submissionId(),
                        outcome.replyId());
                try {
                    this.state.content.clearWorkspace(id);
                } catch (RuntimeException failure) {
                    this.state.receiveCleanupFailed.add(id);
                    entry.replySender().cleanupFailed();
                    entry.sender().cleanupFailed();
                    this.state.receiveFlow.invalidateReceived(entry);
                }
            }
        } else if (command.equals("cancel_reply")) entry.replySender().cancel(attemptId);
        else if (!command.equals("reply_state")) throw new SessionException("invalid_input");
        var state = entry.replySender().state();
        if (!state.status().equals("prepared")) this.state.pendingReplies.remove(id);
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), state);
    }
}
