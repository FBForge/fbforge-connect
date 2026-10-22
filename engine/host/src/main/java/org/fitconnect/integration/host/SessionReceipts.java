package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates receipts operations. SessionState owns lifetime and cleanup. */
final class SessionReceipts {
    private final SessionState state;

    SessionReceipts(SessionState state) {
        this.state = state;
    }

    void entryReplyReceiptInvalidate(ApiVersion version, String id) {
        this.state.find(version, id).replyReceipts().invalidate();
        this.state.pendingReplyReceipts.remove(id);
    }

    Data<?> prepareReplyReceipt(ApiVersion version, String id, ReplyReceiptDraft draft) {
        var entry = this.state.find(version, id);
        entryReplyReceiptInvalidate(version, id);
        var evidence = replyReceiptEvidence(entry, draft);
        var prepared =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> session.prepareReplyReceipt(draft.request(), evidence));
        var state = entry.replyReceipts().prepare(prepared);
        this.state.pendingReplyReceipts.put(id, draft);
        var request = draft.request();
        this.state.cases.noticeReply(
                this.state.caseScopes.get(id), request.caseId(), request.replyId());
        var warnings =
                draft.proofId() == null
                        ? List.<String>of()
                        : this.state.receivedReplies.state(version, id, draft.proofId()).warnings();
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new PreparedReplyAction(
                        state,
                        request.reason(),
                        request.description(),
                        request.attachmentId() == null ? null : request.attachmentId().toString(),
                        warnings));
    }

    ReplyReceiptEvidence replyReceiptEvidence(Entry entry, ReplyReceiptDraft draft) {
        if (this.state.receiveCleanupFailed.contains(entry.id()))
            throw new SessionException("resource_unavailable");
        if (draft.request().action().equals("reject")) return null;
        var evidence =
                this.state.receivedReplies.evidence(
                        entry.key().version(), entry.id(), draft.proofId());
        if (!evidence.caseId().equals(draft.request().caseId())
                || !evidence.replyId().equals(draft.request().replyId()))
            throw new SessionException("verification_failed");
        return evidence;
    }

    Data<?> replyReceipt(ApiVersion version, String id, String command, String attemptId) {
        var entry = this.state.find(version, id);
        if (command.equals("execute_reply_receipt")) {
            var draft = this.state.pendingReplyReceipts.get(id);
            if (draft == null) throw new SessionException("send_locked");
            try {
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                entry.replyReceipts()
                                        .execute(
                                                attemptId,
                                                session,
                                                this.state.content.workspace(id),
                                                () -> replyReceiptEvidence(entry, draft)));
            } finally {
                try {
                    this.state.content.clearWorkspace(id);
                } catch (RuntimeException failure) {
                    this.state.receiveCleanupFailed.add(id);
                    entry.sender().cleanupFailed();
                    this.state.receiveFlow.invalidateReceived(entry);
                    throw failure;
                }
            }
            var receipt = entry.replyReceipts().state();
            this.state.cases.receipt(
                    this.state.caseScopes.get(id),
                    receipt.replyId(),
                    receipt.status(),
                    receipt.action(),
                    true);
            if (receipt.status().equals("confirmed")) this.state.receivedReplies.clearOwner(id);
        } else if (command.equals("cancel_reply_receipt")) entry.replyReceipts().cancel(attemptId);
        else if (!command.equals("reply_receipt_state"))
            throw new SessionException("invalid_input");
        var state = entry.replyReceipts().state();
        if (!state.status().equals("prepared")) this.state.pendingReplyReceipts.remove(id);
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), state);
    }

    Data<?> prepareReceipt(ApiVersion version, String id, ReceiptRequest request, String proofId) {
        Entry entry = this.state.find(version, id);
        this.state.receiveFlow.invalidateReceipt(entry);
        if (request == null || this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("invalid_input");
        SignedReceipt signed;
        List<String> warnings = validateReceipt(entry, request, proofId);
        try {
            signed =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session ->
                                    session.signReceipt(request, this.state.content.workspace(id)));
        } catch (RuntimeException | LinkageError failure) {
            this.state.receiveFlow.invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                this.state.receiveFlow.invalidateReceived(entry);
                throw failure;
            }
        }
        var state = entry.receipts().prepare(signed);
        this.state.pendingReceipts.put(id, new PendingReceipt(request, proofId));
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                new PreparedReceipt(
                        state,
                        request.reason(),
                        request.description(),
                        request.attachmentId() == null ? null : request.attachmentId().toString(),
                        warnings));
    }

    List<String> validateReceipt(Entry entry, ReceiptRequest request, String proofId) {
        if (this.state.receiveCleanupFailed.contains(entry.id()))
            throw new SessionException("resource_unavailable");
        try {
            return this.state.registry.withSession(
                    entry.key().version(),
                    entry.session(),
                    session -> {
                        String destination = request.destinationId().toString(),
                                submission = request.submissionId().toString();
                        entry.destinations().refreshKeys(session, destination);
                        var detail = session.submission(submission);
                        if (!request.destinationId().equals(detail.destinationId())
                                || !request.submissionId().equals(detail.submissionId())
                                || !request.caseId().equals(detail.caseId())
                                || request.attachmentId() != null
                                        && !detail.attachments().contains(request.attachmentId()))
                            throw new SessionException("invalid_resource");
                        this.state.cases.notice(this.state.caseScopes.get(entry.id()), detail);
                        if (request.action().equals("accept")) {
                            var proof =
                                    this.state.received.state(
                                            entry.key().version(), entry.id(), proofId);
                            var evidence = session.receiptEvidence(destination, submission);
                            if (!proof.destinationId().equals(destination)
                                    || !proof.submissionId().equals(submission)
                                    || !proof.caseId().equals(request.caseId().toString())
                                    || !evidence.caseId().equals(request.caseId()))
                                throw new SessionException("verification_failed");
                            return proof.warnings();
                        }
                        if (proofId != null) throw new SessionException("invalid_input");
                        return List.of();
                    });
        } catch (RuntimeException | LinkageError failure) {
            this.state.receiveFlow.invalidateReceived(entry);
            throw failure;
        }
    }

    Data<?> receipt(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = this.state.find(version, id);
        if (command.equals("execute_receipt")) {
            var pending = this.state.pendingReceipts.get(id);
            if (pending == null) throw new SessionException("send_locked");
            entry.receipts()
                    .execute(
                            attemptId,
                            (value, io) -> {
                                validateReceipt(entry, pending.request(), pending.proofId());
                                this.state.registry.withSession(
                                        version,
                                        entry.session(),
                                        session -> {
                                            session.sendReceipt(value, io);
                                            return null;
                                        });
                            });
            var receipt = entry.receipts().state();
            this.state.cases.receipt(
                    this.state.caseScopes.get(id),
                    receipt.submissionId(),
                    receipt.status(),
                    receipt.action(),
                    false);
            if (receipt.status().equals("confirmed"))
                this.state.receiveFlow.invalidateReceived(entry);
        } else if (command.equals("cancel_receipt")) entry.receipts().cancel(attemptId);
        else if (!command.equals("receipt_state")) throw new SessionException("invalid_input");
        var state = entry.receipts().state();
        if (!state.status().equals("prepared")) this.state.pendingReceipts.remove(id);
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), state);
    }
}
