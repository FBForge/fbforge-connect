package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates send operations. SessionState owns lifetime and cleanup. */
final class SessionSend {
    private final SessionState state;

    SessionSend(SessionState state) {
        this.state = state;
    }

    void discardPendingChannel(Entry entry, String attemptId) {
        if (attemptId == null) return;
        this.state.registry.withSession(
                entry.key().version(),
                entry.session(),
                session -> {
                    if (session.replyChannels().stream()
                            .anyMatch(
                                    item ->
                                            item.attemptId().toString().equals(attemptId)
                                                    && item.status().equals("pending")))
                        session.completeReplyChannel(UUID.fromString(attemptId), null, null, false);
                    return null;
                });
    }

    Data<?> prepareSend(ApiVersion version, String id, String document) {
        Entry entry = this.state.find(version, id);
        long reserved =
                this.state.entries.values().stream()
                        .mapToLong(
                                other ->
                                        other.replySender().pendingBytes()
                                                + (other == entry
                                                        ? 0
                                                        : other.sender().pendingBytes()))
                        .sum();
        var draft =
                SubmissionDraft.resolve(
                        document,
                        this.state.content,
                        entry.id(),
                        ContentStore.TOTAL_BYTES - reserved);
        discardPendingChannel(entry, entry.sender().state().attemptId());
        var attempt = entry.sender().prepare(draft.input());
        if (draft.input().replyOffer() != null) {
            try {
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            session.prepareReplyChannel(
                                    UUID.fromString(attempt.attemptId()),
                                    draft.input(),
                                    this.state.content.workspace(id));
                            return null;
                        });
            } catch (RuntimeException failure) {
                entry.sender().cancel(attempt.attemptId());
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new Prepared(attempt, draft.summary()));
    }

    Data<?> send(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = this.state.find(version, id);
        if (command.equals("execute_send")) {
            if (entry.sender().pendingInput() == null
                    || !Objects.equals(attemptId, entry.sender().state().attemptId()))
                throw new SessionException("send_locked");
            String recordId =
                    this.state.cases.outgoing(
                            this.state.caseScopes.get(id), entry.sender().pendingInput());
            this.state.registry.withSession(
                    version,
                    entry.session(),
                    session ->
                            entry.sender()
                                    .execute(attemptId, session, this.state.content.workspace(id)));
            var outcome = entry.sender().state();
            this.state.cases.outcome(
                    recordId, outcome.status(), outcome.caseId(), outcome.submissionId(), null);
            try {
                this.state.content.clearWorkspace(id);
            } catch (SessionException failure) {
                entry.sender().cleanupFailed();
            }
        } else if (command.equals("cancel_send")) {
            entry.sender().cancel(attemptId);
            discardPendingChannel(entry, attemptId);
        } else if (command.equals("acknowledge_send_uncertainty")) {
            entry.sender().acknowledgeUncertainty(attemptId);
        } else if (!command.equals("send_state")) throw new SessionException("invalid_input");
        if (Set.of("failed", "cancelled").contains(entry.sender().state().status()))
            discardPendingChannel(entry, entry.sender().state().attemptId());
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                entry.sender().state());
    }
}
