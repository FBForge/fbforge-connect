package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;

/** At most one native SDK session per API/role pair, with no disk persistence. */
final class SessionManager implements AutoCloseable {
    private record Key(ApiVersion version, SessionRole role) {}
    record Data<T>(String apiVersion, String sessionId, String environment, T data) {}
    private record Entry(Key key, String id, AuthenticatedSession session, DestinationAccess destinations, SendAccess sender, ReceiptAccess receipts, ReplyAccess replySender) {
        SessionSnapshot snapshot(boolean connected) {
            return new SessionSnapshot(id, key.version().wireValue(), key.role().wireValue(), "TEST", connected);
        }
    }
    private final AdapterRegistry registry;
    private final TokenExchange exchange;
    private final TestResourceTransport resourceTransport;
    private final java.util.function.Function<ApiVersion, ResourceExchange> resources;
    private final Map<Key, Entry> entries = new HashMap<>();
    private final Map<String, SendSchemas> sendSchemas = new HashMap<>();
    private final ContentStore content;
    private final ReceiveStore received = new ReceiveStore();
    private final ReplyReceiveStore receivedReplies = new ReplyReceiveStore();
    private final EventLogStore eventLogs = new EventLogStore();
    private final Set<String> receiveCleanupFailed = new HashSet<>();
    private record PendingReceipt(ReceiptRequest request, String proofId) {}
    record PreparedReceipt(ReceiptAccess.State attempt, String reason, String description, String attachmentId, List<String> warnings) {}
    private final Map<String, PendingReceipt> pendingReceipts = new HashMap<>();
    private final Map<String, ReplyDraft.Summary> pendingReplies = new HashMap<>();
    record ReplySchema(String schemaUri, String mimeType) {}
    record ReplyTarget(String proofId, String destinationId, String submissionId, String caseId, String replyDestinationId,
            int offset, int total, List<ReplySchema> schemas) {}
    record PreparedReply(ReplyAccess.State attempt, ReplyDraft.Summary summary) {}

    SessionManager(AdapterRegistry registry, TokenExchange exchange) {
        this.registry = registry; this.exchange = exchange;
        content = new ContentStore();
        resourceTransport = new TestResourceTransport(); resources = resourceTransport::forVersion;
    }
    SessionManager(AdapterRegistry registry, TokenExchange exchange, java.util.function.Function<ApiVersion, ResourceExchange> resources) {
        this(registry, exchange, resources, new ContentStore());
    }
    SessionManager(AdapterRegistry registry, TokenExchange exchange, java.util.function.Function<ApiVersion, ResourceExchange> resources,
                   ContentStore content) {
        this.registry = registry; this.exchange = exchange; this.resources = resources; resourceTransport = null;
        this.content = content;
    }

    SessionSnapshot open(ApiVersion version, SessionRole role, String clientId, String clientSecret) {
        if (clientId == null || clientId.isBlank() || clientId.length() > 512
                || clientSecret == null || clientSecret.isBlank() || clientSecret.length() > 8192)
            throw new SessionException("invalid_credentials");
        Key key = new Key(version, role);
        remove(entries.remove(key));
        AuthenticatedSession candidate = null;
        try {
            var sender = new SendAccess(version, resources.apply(version));
            candidate = registry.openSession(version, clientId, clientSecret, exchange, sender);
            registry.checkSession(version, candidate);
            var receipts = new ReceiptAccess(version, resourceTransport == null ? resources.apply(version) : resourceTransport.forReceipt(version));
            var replySender = new ReplyAccess(version, resourceTransport == null ? resources.apply(version) : resourceTransport.forReply(version));
            var entry = new Entry(key, UUID.randomUUID().toString(), candidate, new DestinationAccess(), sender, receipts, replySender);
            entries.put(key, entry);
            return entry.snapshot(true);
        } catch (Exception | LinkageError e) {
            if (candidate != null) candidate.close();
            throw safe(e);
        }
    }

    SessionSnapshot check(ApiVersion version, String id) {
        Entry entry = find(version, id);
        try {
            registry.checkSession(version, entry.session());
            return entry.snapshot(true);
        } catch (Exception | LinkageError e) {
            entries.remove(entry.key());
            remove(entry);
            throw safe(e);
        }
    }

    SessionSnapshot close(ApiVersion version, String id) {
        Entry entry = find(version, id);
        entries.remove(entry.key());
        remove(entry);
        return entry.snapshot(false);
    }

    Data<?> resource(ApiVersion version, String id, String command, String destinationId, int offset, String purpose, String document) {
        Entry entry = find(version, id);
        if (command.equals("load_destination")) eventLogs.clearOwner(id);
        if (Set.of("load_destination", "import_key", "discard_keys").contains(command)) invalidateReceived(entry);
        Object data = registry.withSession(version, entry.session(), session -> switch (command) {
            case "list_destinations" -> entry.destinations().list(session, offset);
            case "load_destination" -> entry.destinations().load(session, destinationId);
            case "import_key" -> entry.destinations().importKey(session, destinationId, purpose, document);
            case "loaded_keys" -> new DestinationAccess.KeyState(session.loadedKeys());
            case "discard_keys" -> { session.discardKeys(); yield new DestinationAccess.KeyState(session.loadedKeys()); }
            default -> throw new SessionException("invalid_input");
        });
        return new Data<>(version.wireValue(), entry.id(), "TEST", data);
    }

    Data<?> content(ApiVersion version, String id, String command, String contentId, long totalBytes, long byteOffset, String chunk) {
        Entry entry = find(version, id);
        Object data = switch (command) {
            case "begin_content" -> content.begin(entry.id(), totalBytes);
            case "append_content" -> content.append(entry.id(), contentId, byteOffset, chunk);
            case "discard_content" -> content.discard(entry.id(), contentId);
            default -> throw new SessionException("invalid_input");
        };
        return new Data<>(version.wireValue(), entry.id(), "TEST", data);
    }

    Data<?> sendSchema(ApiVersion version, String id, String command, String destinationId, String document, String schemaId, int offset) {
        Entry entry = find(version, id);
        Object data = registry.withSession(version, entry.session(), session -> switch (command) {
            case "load_send_destination" -> SendSchemas.destination(session, destinationId);
            case "load_send_schema" -> sendSchemas.computeIfAbsent(id, ignored -> new SendSchemas()).load(session, destinationId, document);
            case "read_send_schema" -> {
                var schemas = sendSchemas.get(id);
                if (schemas == null) throw new SessionException("invalid_resource");
                yield schemas.read(schemaId, offset);
            }
            default -> throw new SessionException("invalid_input");
        });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    private Entry find(ApiVersion version, String id) {
        return entries.values().stream().filter(e -> e.key().version() == version && e.id().equals(id))
                .findFirst().orElseThrow(() -> new SessionException("session_missing"));
    }
    record Prepared(SendAccess.State attempt, SubmissionDraft.Summary summary) {}
    record ReplyChannels(List<ReplyChannelReference> channels) {}
    Data<?> replyChannels(ApiVersion version, String id) {
        Entry entry = find(version, id);
        var channels = registry.withSession(version, entry.session(), session -> List.copyOf(session.replyChannels()));
        if (channels.size() > 32) throw new SessionException("invalid_resource");
        return new Data<>(version.wireValue(), id, "TEST", new ReplyChannels(channels));
    }
    Data<?> replies(ApiVersion version, String id, int offset) {
        Entry entry = find(version, id);
        if (offset < 0 || offset > 10000 || offset % 20 != 0) throw new SessionException("invalid_input");
        var page = registry.withSession(version, entry.session(), session -> session.replies(offset, 20));
        return new Data<>(version.wireValue(), id, "TEST", page);
    }
    Data<?> lookup(ApiVersion version, String id, String command, String destinationId, String submissionId, int offset) {
        Entry entry = find(version, id);
        eventLogs.clearOwner(id);
        invalidateReceived(entry);
        String destination = DestinationAccess.id(destinationId);
        Object data = registry.withSession(version, entry.session(), session -> {
            if (command.equals("list_submissions")) {
                if (offset < 0 || offset > 10000 || offset % 20 != 0) throw new SessionException("invalid_input");
                var page = session.submissions(destination, offset, 20);
                if (page.submissions().stream().anyMatch(item -> !item.destinationId().toString().equals(destination)))
                    throw new SessionException("invalid_resource");
                return page;
            }
            if (!command.equals("load_submission")) throw new SessionException("invalid_input");
            String submission = DestinationAccess.id(submissionId);
            var detail = session.submission(submission);
            if (!detail.submissionId().toString().equals(submission) || !detail.destinationId().toString().equals(destination))
                throw new SessionException("invalid_resource");
            return detail;
        });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }
    Data<?> verify(ApiVersion version, String id, String destinationId, String submissionId, String document) {
        Entry entry = find(version, id);
        eventLogs.clearOwner(id);
        // Only one SDK/plaintext snapshot may remain active across all API/role sessions.
        clearReceiveSnapshots();
        String destination = DestinationAccess.id(destinationId), submission = DestinationAccess.id(submissionId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, content, id);
        ReceivedContent result;
        try {
            result = registry.withSession(version, entry.session(), session -> {
                entry.destinations().refreshKeys(session, destination);
                if (session.loadedKeys().stream().noneMatch(key -> key.destinationId().equals(destination) && key.purpose().equals("decrypt")))
                    throw new SessionException("key_missing");
                try (var read = resourceTransport == null ? new ReceiveAccess(version, destination, submission, resources.apply(version))
                        : resourceTransport.forReceive(version, destination, submission)) {
                    return session.receive(destination, submission, read, content.workspace(id), schemas);
                }
            });
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try { content.clearWorkspace(id); }
            catch (RuntimeException failure) {
                receiveCleanupFailed.add(id); entry.sender().cleanupFailed(); invalidateReceived(entry); throw failure;
            }
        }
        try {
            var summary = received.publish(version, id, UUID.fromString(destination), UUID.fromString(submission), result);
            return new Data<>(version.wireValue(), id, "TEST", summary);
        } catch (RuntimeException failure) { invalidateReceived(entry); throw failure; }
    }
    private void clearReceiveSnapshots() {
        received.clear(); receivedReplies.clear();
        for (Entry other : entries.values()) registry.withSession(other.key().version(), other.session(), session -> {
            invalidateReceipt(other); invalidateReply(other);
            session.discardReceived(); return null;
        });
    }
    Data<?> verifyReply(ApiVersion version, String id, String caseValue, String replyValue, String document) {
        Entry entry = find(version, id); eventLogs.clearOwner(id); clearReceiveSnapshots();
        String caseId = DestinationAccess.id(caseValue), replyId = DestinationAccess.id(replyValue);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, content, id);
        ReceivedReplyContent result;
        try {
            result = registry.withSession(version, entry.session(), session -> {
                try (var read = resourceTransport == null ? ReceiveAccess.forReply(version, caseId, replyId, resources.apply(version))
                        : resourceTransport.forReplyReceive(version, caseId, replyId)) {
                    return session.receiveReply(UUID.fromString(caseId), UUID.fromString(replyId), read, content.workspace(id), schemas);
                }
            });
        } catch (RuntimeException | LinkageError failure) { invalidateReceived(entry); throw failure;
        } finally {
            try { content.clearWorkspace(id); }
            catch (RuntimeException failure) {
                receiveCleanupFailed.add(id); entry.sender().cleanupFailed(); invalidateReceived(entry); throw failure;
            }
        }
        try { return new Data<>(version.wireValue(), id, "TEST", receivedReplies.publish(version, id, UUID.fromString(caseId), UUID.fromString(replyId), result)); }
        catch (RuntimeException failure) { invalidateReceived(entry); throw failure; }
    }
    Data<?> receivedReply(ApiVersion version, String id, String command, String proofId, String contentId, int offset) {
        find(version, id);
        Object result = switch (command) {
            case "list_received_reply_contents" -> receivedReplies.parts(version, id, proofId, offset);
            case "read_received_reply_content" -> receivedReplies.read(version, id, proofId, contentId, offset);
            case "discard_received_reply" -> { receivedReplies.discard(version, id, proofId); yield Map.of("proofId", proofId); }
            default -> throw new SessionException("invalid_input");
        };
        return new Data<>(version.wireValue(), id, "TEST", result);
    }
    Data<?> loadEventLog(ApiVersion version, String id, String destinationId, String caseId, String submissionId) {
        Entry entry = find(version, id);
        // A failed replacement must never leave an earlier result looking current.
        eventLogs.clear();
        String destination = DestinationAccess.id(destinationId), caseValue = DestinationAccess.id(caseId), submission = DestinationAccess.id(submissionId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        VerifiedEventLog result;
        try {
            result = registry.withSession(version, entry.session(), session -> {
                try (var source = resourceTransport == null ? new EventLogAccess(version, caseValue, submission, resources.apply(version))
                        : resourceTransport.forEvents(version, caseValue, submission)) {
                    return session.eventLog(UUID.fromString(destination), UUID.fromString(caseValue), UUID.fromString(submission), source, content.workspace(id));
                }
            });
        } finally {
            // SDK storage must be clean before a verified result can cross the native boundary.
            try { content.clearWorkspace(id); }
            catch (RuntimeException failure) {
                receiveCleanupFailed.add(id); entry.sender().cleanupFailed(); invalidateReceived(entry); throw failure;
            }
        }
        return new Data<>(version.wireValue(), id, "TEST", eventLogs.publish(version, id, UUID.fromString(destination),
                UUID.fromString(caseValue), UUID.fromString(submission), result));
    }
    Data<?> eventLogResource(ApiVersion version, String id, String command, String logId, String eventId, String part, int offset) {
        find(version, id);
        Object data = switch (command) {
            case "list_event_log" -> eventLogs.page(version, id, logId, offset);
            case "read_event_log" -> eventLogs.read(version, id, logId, eventId, part, offset);
            case "discard_event_log" -> { eventLogs.discard(version, id, logId); yield Map.of("logId", logId); }
            default -> throw new SessionException("invalid_input");
        };
        return new Data<>(version.wireValue(), id, "TEST", data);
    }
    Data<?> received(ApiVersion version, String id, String command, String proofId, String contentId, int offset) {
        Entry entry = find(version, id);
        Object data = switch (command) {
            case "list_received_contents" -> received.parts(version, id, proofId, offset);
            case "read_received_content" -> received.read(version, id, proofId, contentId, offset);
            case "discard_received" -> {
                received.discard(version, id, proofId);
                invalidateReceipt(entry);
                invalidateReply(entry);
                registry.withSession(version, entry.session(), session -> { session.discardReceived(); return null; });
                yield Map.of("proofId", proofId);
            }
            default -> throw new SessionException("invalid_input");
        };
        return new Data<>(version.wireValue(), id, "TEST", data);
    }
    private void invalidateReceived(Entry entry) {
        invalidateReceipt(entry);
        invalidateReply(entry);
        received.clearOwner(entry.id()); receivedReplies.clearOwner(entry.id());
        registry.withSession(entry.key().version(), entry.session(), session -> { session.discardReceived(); return null; });
    }
    private void invalidateReceipt(Entry entry) {
        entry.receipts().invalidate(); pendingReceipts.remove(entry.id());
    }
    private void invalidateReply(Entry entry) { entry.replySender().invalidatePrepared(); pendingReplies.remove(entry.id()); }
    private ReplyRecipient replyRecipient(Entry entry, ReceiveStore.Summary proof) {
        var recipient = registry.withSession(entry.key().version(), entry.session(), session -> session.replyRecipient(proof.destinationId(), proof.submissionId()));
        if (!recipient.caseId().toString().equals(proof.caseId())) throw new SessionException("verification_failed");
        return recipient;
    }
    Data<?> replyTarget(ApiVersion version, String id, String proofId, int offset) {
        Entry entry = find(version, id); var proof = received.state(version, id, proofId);
        var recipient = replyRecipient(entry, proof); var schemas = recipient.schemas();
        if (offset < 0 || offset > schemas.size() || offset % 2 != 0) throw new SessionException("invalid_input");
        return new Data<>(version.wireValue(), id, "TEST", new ReplyTarget(proofId, proof.destinationId(), proof.submissionId(), proof.caseId(),
                recipient.replyDestinationId() == null ? null : recipient.replyDestinationId().toString(), offset, schemas.size(),
                schemas.subList(offset, Math.min(offset + 2, schemas.size())).stream().map(schema -> new ReplySchema(schema.schemaUri().toString(), schema.mimeType())).toList()));
    }
    Data<?> prepareReply(ApiVersion version, String id, String document) {
        Entry entry = find(version, id);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var proof = received.state(version, id, ReplyDraft.proofId(document)); var recipient = replyRecipient(entry, proof);
        long reserved = entries.values().stream().mapToLong(other -> other.sender().pendingBytes() + (other == entry ? 0 : other.replySender().pendingBytes())).sum();
        var draft = ReplyDraft.resolve(document, proof, content, id, ContentStore.TOTAL_BYTES - reserved);
        var attempt = entry.replySender().prepare(draft.input(), recipient); pendingReplies.put(id, draft.summary());
        return new Data<>(version.wireValue(), id, "TEST", new PreparedReply(attempt, draft.summary()));
    }
    Data<?> replySend(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_reply")) {
            var pending = pendingReplies.get(id); if (pending == null) throw new SessionException("send_locked");
            try {
                registry.withSession(version, entry.session(), session -> entry.replySender().execute(attemptId, session, content.workspace(id), () -> {
                    var proof = received.state(version, id, pending.proofId());
                    if (!proof.destinationId().equals(pending.destinationId()) || !proof.submissionId().equals(pending.submissionId())
                            || !proof.caseId().equals(pending.caseId())) throw new SessionException("verification_failed");
                }));
            } finally {
                try { content.clearWorkspace(id); }
                catch (RuntimeException failure) { receiveCleanupFailed.add(id); entry.replySender().cleanupFailed(); entry.sender().cleanupFailed(); invalidateReceived(entry); }
            }
        } else if (command.equals("cancel_reply")) entry.replySender().cancel(attemptId);
        else if (!command.equals("reply_state")) throw new SessionException("invalid_input");
        var state = entry.replySender().state(); if (!state.status().equals("prepared")) pendingReplies.remove(id);
        return new Data<>(version.wireValue(), id, "TEST", state);
    }
    Data<?> prepareReceipt(ApiVersion version, String id, ReceiptRequest request, String proofId) {
        Entry entry = find(version, id);
        invalidateReceipt(entry);
        if (request == null || receiveCleanupFailed.contains(id)) throw new SessionException("invalid_input");
        SignedReceipt signed;
        List<String> warnings = validateReceipt(entry, request, proofId);
        try {
            signed = registry.withSession(version, entry.session(), session -> session.signReceipt(request, content.workspace(id)));
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry); throw failure;
        } finally {
            try { content.clearWorkspace(id); }
            catch (RuntimeException failure) {
                receiveCleanupFailed.add(id); entry.sender().cleanupFailed(); invalidateReceived(entry); throw failure;
            }
        }
        var state = entry.receipts().prepare(signed);
        pendingReceipts.put(id, new PendingReceipt(request, proofId));
        return new Data<>(version.wireValue(), id, "TEST", new PreparedReceipt(state, request.reason(), request.description(),
                request.attachmentId() == null ? null : request.attachmentId().toString(), warnings));
    }
    private List<String> validateReceipt(Entry entry, ReceiptRequest request, String proofId) {
        if (receiveCleanupFailed.contains(entry.id())) throw new SessionException("resource_unavailable");
        try { return registry.withSession(entry.key().version(), entry.session(), session -> {
            String destination = request.destinationId().toString(), submission = request.submissionId().toString();
            entry.destinations().refreshKeys(session, destination);
            var detail = session.submission(submission);
            if (!request.destinationId().equals(detail.destinationId()) || !request.submissionId().equals(detail.submissionId())
                    || !request.caseId().equals(detail.caseId())
                    || request.attachmentId() != null && !detail.attachments().contains(request.attachmentId()))
                throw new SessionException("invalid_resource");
            if (request.action().equals("accept")) {
                var proof = received.state(entry.key().version(), entry.id(), proofId);
                var evidence = session.receiptEvidence(destination, submission);
                if (!proof.destinationId().equals(destination) || !proof.submissionId().equals(submission)
                        || !proof.caseId().equals(request.caseId().toString()) || !evidence.caseId().equals(request.caseId()))
                    throw new SessionException("verification_failed");
                return proof.warnings();
            }
            if (proofId != null) throw new SessionException("invalid_input");
            return List.of();
        }); } catch (RuntimeException | LinkageError failure) { invalidateReceived(entry); throw failure; }
    }
    Data<?> receipt(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_receipt")) {
            var pending = pendingReceipts.get(id);
            if (pending == null) throw new SessionException("send_locked");
            entry.receipts().execute(attemptId, (value, io) -> {
                validateReceipt(entry, pending.request(), pending.proofId());
                registry.withSession(version, entry.session(), session -> { session.sendReceipt(value, io); return null; });
            });
            if (entry.receipts().state().status().equals("confirmed")) invalidateReceived(entry);
        } else if (command.equals("cancel_receipt")) entry.receipts().cancel(attemptId);
        else if (!command.equals("receipt_state")) throw new SessionException("invalid_input");
        var state = entry.receipts().state();
        if (!state.status().equals("prepared")) pendingReceipts.remove(id);
        return new Data<>(version.wireValue(), id, "TEST", state);
    }
    Data<?> prepareSend(ApiVersion version, String id, String document) {
        Entry entry = find(version, id);
        long reserved = entries.values().stream().mapToLong(other -> other.replySender().pendingBytes() + (other == entry ? 0 : other.sender().pendingBytes())).sum();
        var draft = SubmissionDraft.resolve(document, content, entry.id(), ContentStore.TOTAL_BYTES - reserved);
        return new Data<>(version.wireValue(), id, "TEST", new Prepared(entry.sender().prepare(draft.input()), draft.summary()));
    }
    Data<?> send(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_send")) {
            registry.withSession(version, entry.session(), session -> entry.sender().execute(attemptId, session, content.workspace(id)));
            try { content.clearWorkspace(id); } catch (SessionException failure) { entry.sender().cleanupFailed(); }
        } else if (command.equals("cancel_send")) entry.sender().cancel(attemptId);
        else if (!command.equals("send_state")) throw new SessionException("invalid_input");
        return new Data<>(version.wireValue(), id, "TEST", entry.sender().state());
    }
    private static SessionException safe(Throwable cause) {
        return cause instanceof SessionException known ? known : new SessionException("authentication_failed");
    }
    private void remove(Entry entry) {
        if (entry == null) return;
        var schemas = sendSchemas.remove(entry.id());
        if (schemas != null) schemas.clear();
        eventLogs.clearOwner(entry.id());
        received.clearOwner(entry.id()); receivedReplies.clearOwner(entry.id());
        receiveCleanupFailed.remove(entry.id());
        entry.sender().close();
        entry.receipts().close(); pendingReceipts.remove(entry.id());
        entry.replySender().close(); pendingReplies.remove(entry.id());
        try { entry.session().close(); }
        finally { content.releaseSession(entry.id()); }
    }
    public void close() {
        eventLogs.clear();
        received.clear(); receivedReplies.clear();
        boolean failed = false;
        for (Entry entry : List.copyOf(entries.values())) {
            try { remove(entry); } catch (Exception e) { failed = true; }
        }
        entries.clear();
        try { content.close(); } catch (Exception e) { failed = true; }
        if (resourceTransport != null) {
            try { resourceTransport.close(); } catch (Exception e) { failed = true; }
        }
        if (exchange instanceof AutoCloseable resource) {
            try { resource.close(); } catch (Exception e) { failed = true; }
        }
        if (failed) throw new SessionException("resource_unavailable");
    }
}
