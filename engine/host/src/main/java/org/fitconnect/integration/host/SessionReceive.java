package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates receive operations. SessionState owns lifetime and cleanup. */
final class SessionReceive {
    private final SessionState state;

    SessionReceive(SessionState state) {
        this.state = state;
    }

    Data<?> replyChannels(ApiVersion version, String id) {
        Entry entry = this.state.find(version, id);
        var channels =
                this.state.registry.withSession(
                        version, entry.session(), session -> List.copyOf(session.replyChannels()));
        if (channels.size() > 32) throw new SessionException("invalid_resource");
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new ReplyChannels(channels));
    }

    Data<?> replies(ApiVersion version, String id, int offset) {
        Entry entry = this.state.find(version, id);
        if (offset < 0 || offset > 10000 || offset % 20 != 0)
            throw new SessionException("invalid_input");
        var page =
                this.state.registry.withSession(
                        version, entry.session(), session -> session.replies(offset, 20));
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), page);
    }

    Data<?> lookup(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            String submissionId,
            int offset) {
        Entry entry = this.state.find(version, id);
        this.state.eventLogs.clearOwner(id);
        invalidateReceived(entry);
        String destination = DestinationAccess.id(destinationId);
        Object data =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            if (command.equals("list_submissions")) {
                                if (offset < 0 || offset > 10000 || offset % 20 != 0)
                                    throw new SessionException("invalid_input");
                                var page = session.submissions(destination, offset, 20);
                                if (page.submissions().stream()
                                        .anyMatch(
                                                item ->
                                                        !item.destinationId()
                                                                .toString()
                                                                .equals(destination)))
                                    throw new SessionException("invalid_resource");
                                return page;
                            }
                            if (!command.equals("load_submission"))
                                throw new SessionException("invalid_input");
                            String submission = DestinationAccess.id(submissionId);
                            var detail = session.submission(submission);
                            if (!detail.submissionId().toString().equals(submission)
                                    || !detail.destinationId().toString().equals(destination))
                                throw new SessionException("invalid_resource");
                            this.state.cases.notice(this.state.caseScopes.get(id), detail);
                            return detail;
                        });
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), data);
    }

    Data<?> verify(
            ApiVersion version,
            String id,
            String destinationId,
            String submissionId,
            String document) {
        Entry entry = this.state.find(version, id);
        this.state.eventLogs.clearOwner(id);
        // Only one SDK/plaintext snapshot may remain active across all API/role sessions.
        clearReceiveSnapshots();
        String destination = DestinationAccess.id(destinationId),
                submission = DestinationAccess.id(submissionId);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, this.state.content, id);
        ReceivedContent result;
        try {
            result =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                entry.destinations().refreshKeys(session, destination);
                                if (session.loadedKeys().stream()
                                        .noneMatch(
                                                key ->
                                                        key.destinationId().equals(destination)
                                                                && key.purpose().equals("decrypt")))
                                    throw new SessionException("key_missing");
                                try (var read =
                                        this.state.resourceTransport == null
                                                ? new ReceiveAccess(
                                                        version,
                                                        destination,
                                                        submission,
                                                        this.state.resources.apply(version))
                                                : this.state.resourceTransport.forReceive(
                                                        version, destination, submission)) {
                                    return session.receive(
                                            destination,
                                            submission,
                                            read,
                                            this.state.content.workspace(id),
                                            schemas);
                                }
                            });
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        try {
            var summary =
                    this.state.received.publish(
                            version,
                            id,
                            UUID.fromString(destination),
                            UUID.fromString(submission),
                            result);
            // Validate the requested destination/submission binding before retaining a local copy.
            this.state.cases.receive(this.state.caseScopes.get(id), result);
            return new Data<>(
                    version.wireValue(), id, IntegrationEnvironment.current().name(), summary);
        } catch (RuntimeException failure) {
            invalidateReceived(entry);
            throw failure;
        }
    }

    void clearReceiveSnapshots() {
        this.state.received.clear();
        this.state.receivedReplies.clear();
        for (Entry other : this.state.entries.values())
            this.state.registry.withSession(
                    other.key().version(),
                    other.session(),
                    session -> {
                        invalidateReceipt(other);
                        invalidateReply(other);
                        session.discardReceived();
                        return null;
                    });
    }

    Data<?> verifyReply(
            ApiVersion version, String id, String caseValue, String replyValue, String document) {
        Entry entry = this.state.find(version, id);
        this.state.eventLogs.clearOwner(id);
        clearReceiveSnapshots();
        String caseId = DestinationAccess.id(caseValue), replyId = DestinationAccess.id(replyValue);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, this.state.content, id);
        ReceivedReplyContent result;
        try {
            result =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var read =
                                        this.state.resourceTransport == null
                                                ? ReceiveAccess.forReply(
                                                        version,
                                                        caseId,
                                                        replyId,
                                                        this.state.resources.apply(version))
                                                : this.state.resourceTransport.forReplyReceive(
                                                        version, caseId, replyId)) {
                                    return session.receiveReply(
                                            UUID.fromString(caseId),
                                            UUID.fromString(replyId),
                                            read,
                                            this.state.content.workspace(id),
                                            schemas);
                                }
                            });
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        try {
            return new Data<>(
                    version.wireValue(),
                    id,
                    IntegrationEnvironment.current().name(),
                    publishReplyCase(version, id, caseId, replyId, result));
        } catch (RuntimeException failure) {
            invalidateReceived(entry);
            throw failure;
        }
    }

    ReplyReceiveStore.Summary publishReplyCase(
            ApiVersion version,
            String id,
            String caseId,
            String replyId,
            ReceivedReplyContent result) {
        var summary =
                this.state.receivedReplies.publish(
                        version, id, UUID.fromString(caseId), UUID.fromString(replyId), result);
        this.state.cases.receive(this.state.caseScopes.get(id), result);
        return summary;
    }

    Data<?> bindCases(ApiVersion version, String id, String profileId) {
        var entry = this.state.find(version, id);
        this.state.caseScopes.put(
                id,
                version.wireValue()
                        + "/"
                        + entry.key().role().wireValue()
                        + "/profile/"
                        + DestinationAccess.id(profileId));
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                Map.of("bound", true));
    }

    Data<?> caseWorkspace(ApiVersion version, String id, String document) {
        this.state.find(version, id);
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                this.state.cases.resource(this.state.caseScopes.get(id), document));
    }

    Data<?> receivedReply(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        this.state.find(version, id);
        Object result =
                switch (command) {
                    case "read_received_reply_schema" ->
                            this.state.receivedReplies.schema(version, id, proofId, offset);
                    case "list_received_reply_contents" ->
                            this.state.receivedReplies.parts(version, id, proofId, offset);
                    case "read_received_reply_content" ->
                            this.state.receivedReplies.read(
                                    version, id, proofId, contentId, offset);
                    case "discard_received_reply" -> {
                        this.state.receiptsFlow.entryReplyReceiptInvalidate(version, id);
                        this.state.receivedReplies.discard(version, id, proofId);
                        yield Map.of("proofId", proofId);
                    }
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), result);
    }

    Data<?> received(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        Entry entry = this.state.find(version, id);
        Object data =
                switch (command) {
                    case "read_received_schema" ->
                            this.state.received.schema(version, id, proofId, offset);
                    case "list_received_contents" ->
                            this.state.received.parts(version, id, proofId, offset);
                    case "read_received_content" ->
                            this.state.received.read(version, id, proofId, contentId, offset);
                    case "discard_received" -> {
                        this.state.received.discard(version, id, proofId);
                        invalidateReceipt(entry);
                        invalidateReply(entry);
                        this.state.registry.withSession(
                                version,
                                entry.session(),
                                session -> {
                                    session.discardReceived();
                                    return null;
                                });
                        yield Map.of("proofId", proofId);
                    }
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), data);
    }

    void invalidateReceived(Entry entry) {
        invalidateReceipt(entry);
        invalidateReply(entry);
        this.state.received.clearOwner(entry.id());
        this.state.receivedReplies.clearOwner(entry.id());
        this.state.registry.withSession(
                entry.key().version(),
                entry.session(),
                session -> {
                    session.discardReceived();
                    return null;
                });
    }

    void invalidateReceipt(Entry entry) {
        entry.receipts().invalidate();
        this.state.pendingReceipts.remove(entry.id());
        entry.replyReceipts().invalidate();
        this.state.pendingReplyReceipts.remove(entry.id());
    }

    void invalidateReply(Entry entry) {
        var schema = this.state.replySchemas.remove(entry.id());
        if (schema != null) schema.clear();
        entry.replySender().invalidatePrepared();
        this.state.pendingReplies.remove(entry.id());
    }
}
