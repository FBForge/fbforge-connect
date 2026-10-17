package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;

/** At most one native SDK session per API/role pair, with no disk persistence. */
final class SessionManager implements AutoCloseable {
    private record Key(ApiVersion version, SessionRole role) {}

    record Data<T>(String apiVersion, String sessionId, String environment, T data) {}

    private record Entry(
            Key key,
            String id,
            AuthenticatedSession session,
            DestinationAccess destinations,
            SendAccess sender,
            ReceiptAccess receipts,
            ReplyAccess replySender,
            ReplyReceiptAccess replyReceipts) {
        SessionSnapshot snapshot(boolean connected) {
            return new SessionSnapshot(
                    id, key.version().wireValue(), key.role().wireValue(), "TEST", connected);
        }
    }

    private final AdapterRegistry registry;
    private final TokenExchange exchange;
    private final TestResourceTransport resourceTransport;
    private final java.util.function.Function<ApiVersion, ResourceExchange> resources;
    private final Map<Key, Entry> entries = new HashMap<>();
    private final Map<String, SessionArchives> archives = new HashMap<>();
    private final Map<String, DestinationCleanup> cleanups = new HashMap<>();
    private final Map<String, DestinationRotation> rotations = new HashMap<>();
    private final Map<String, DestinationProvisioning> provisioning = new HashMap<>();
    private final Map<String, LocalTestKeys> localKeys = new HashMap<>();
    private final Map<String, DestinationManagement> management = new HashMap<>();
    private final Map<String, SendSchemas> replySchemas = new HashMap<>();
    private final Map<String, SendSchemas> sendSchemas = new HashMap<>();
    private final ContentStore content;
    private final ReceiveStore received = new ReceiveStore();
    private final ReplyReceiveStore receivedReplies = new ReplyReceiveStore();
    private final EventLogStore eventLogs = new EventLogStore();
    private final Set<String> receiveCleanupFailed = new HashSet<>();

    private record PendingReceipt(ReceiptRequest request, String proofId) {}

    record PreparedReceipt(
            ReceiptAccess.State attempt,
            String reason,
            String description,
            String attachmentId,
            List<String> warnings) {}

    private final Map<String, PendingReceipt> pendingReceipts = new HashMap<>();
    private final Map<String, ReplyReceiptDraft> pendingReplyReceipts = new HashMap<>();

    record PreparedReplyAction(
            ReplyReceiptAccess.State attempt,
            String reason,
            String description,
            String attachmentId,
            List<String> warnings) {}

    private final Map<String, ReplyDraft.Summary> pendingReplies = new HashMap<>();

    record ReplySchema(String schemaUri, String mimeType) {}

    record ReplyTarget(
            String proofId,
            String destinationId,
            String submissionId,
            String caseId,
            String replyDestinationId,
            int offset,
            int total,
            List<ReplySchema> schemas,
            List<SubmissionInput.ProcessMessage> processMessages) {}

    record PreparedReply(ReplyAccess.State attempt, ReplyDraft.Summary summary) {}

    SessionManager(AdapterRegistry registry, TokenExchange exchange) {
        this.registry = registry;
        this.exchange = exchange;
        content = new ContentStore();
        resourceTransport = new TestResourceTransport();
        resources = resourceTransport::forVersion;
    }

    SessionManager(
            AdapterRegistry registry,
            TokenExchange exchange,
            java.util.function.Function<ApiVersion, ResourceExchange> resources) {
        this(registry, exchange, resources, new ContentStore());
    }

    SessionManager(
            AdapterRegistry registry,
            TokenExchange exchange,
            java.util.function.Function<ApiVersion, ResourceExchange> resources,
            ContentStore content) {
        this.registry = registry;
        this.exchange = exchange;
        this.resources = resources;
        resourceTransport = null;
        this.content = content;
    }

    SessionSnapshot open(
            ApiVersion version, SessionRole role, String clientId, String clientSecret) {
        if (clientId == null
                || clientId.isBlank()
                || clientId.length() > 512
                || clientSecret == null
                || clientSecret.isBlank()
                || clientSecret.length() > 8192) throw new SessionException("invalid_credentials");
        Key key = new Key(version, role);
        remove(entries.remove(key));
        AuthenticatedSession candidate = null;
        try {
            var sender = new SendAccess(version, resources.apply(version));
            candidate = registry.openSession(version, clientId, clientSecret, exchange, sender);
            registry.checkSession(version, candidate);
            var receipts =
                    new ReceiptAccess(
                            version,
                            resourceTransport == null
                                    ? resources.apply(version)
                                    : resourceTransport.forReceipt(version));
            var replySender =
                    new ReplyAccess(
                            version,
                            resourceTransport == null
                                    ? resources.apply(version)
                                    : resourceTransport.forReply(version));
            var entry =
                    new Entry(
                            key,
                            UUID.randomUUID().toString(),
                            candidate,
                            new DestinationAccess(),
                            sender,
                            receipts,
                            replySender,
                            new ReplyReceiptAccess(
                                    version,
                                    resourceTransport == null
                                            ? resources.apply(version)
                                            : resourceTransport.forReplyReceipt(version)));
            entries.put(key, entry);
            return entry.snapshot(true);
        } catch (Exception | LinkageError e) {
            if (candidate != null) candidate.close();
            throw safe(e);
        }
    }

    Map<String, Object> validateCredentials(
            ApiVersion version, String clientId, String clientSecret) {
        if (clientId == null
                || clientId.isBlank()
                || clientId.length() > 512
                || clientSecret == null
                || clientSecret.isBlank()
                || clientSecret.length() > 8192) throw new SessionException("invalid_credentials");
        // Candidate authentication must never replace an active session or discard its pending
        // drafts/keys.
        try (var candidate =
                registry.openSession(
                        version,
                        clientId,
                        clientSecret,
                        exchange,
                        new SendAccess(version, resources.apply(version)))) {
            registry.checkSession(version, candidate);
            return Map.of("apiVersion", version.wireValue(), "environment", "TEST", "valid", true);
        } catch (Exception | LinkageError failure) {
            throw safe(failure);
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

    Data<?> resource(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            int offset,
            String purpose,
            String document) {
        Entry entry = find(version, id);
        if (command.equals("load_destination")) eventLogs.clearOwner(id);
        if (Set.of("load_destination", "import_key", "discard_keys").contains(command))
            invalidateReceived(entry);
        Object data =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "list_destinations" ->
                                            entry.destinations().list(session, offset);
                                    case "load_destination" ->
                                            entry.destinations().load(session, destinationId);
                                    case "import_key" ->
                                            entry.destinations()
                                                    .importKey(
                                                            session,
                                                            destinationId,
                                                            purpose,
                                                            document);
                                    case "loaded_keys" ->
                                            new DestinationAccess.KeyState(session.loadedKeys());
                                    case "discard_keys" -> {
                                        session.discardKeys();
                                        yield new DestinationAccess.KeyState(session.loadedKeys());
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), entry.id(), "TEST", data);
    }

    Data<?> keyInventory(ApiVersion version, String id, String command, String itemId, int offset) {
        var entry = find(version, id);
        var generated = localKeys.get(id);
        Object result =
                registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            if (command.equals("remove_key_inventory_item")) {
                                KeyInventory.remove(
                                        id, session, generated, DestinationAccess.id(itemId));
                                var archive = archives.get(id);
                                if (archive != null) archive.clear();
                                invalidateReceived(entry);
                                eventLogs.clearOwner(id);
                                return KeyInventory.list(id, session, generated, 0);
                            }
                            return KeyInventory.list(id, session, generated, offset);
                        });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> manageDestination(
            ApiVersion version,
            String id,
            String command,
            String destination,
            String document,
            String attempt) {
        Entry entry = find(version, id);
        var manager =
                management.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationManagement(
                                        version,
                                        resourceTransport == null
                                                ? resources.apply(version)
                                                : resourceTransport.forDestinationManagement(
                                                        version)));
        if (command.equals("execute_destination_update")) {
            eventLogs.clearOwner(id);
            invalidateReceived(entry);
        }
        Object data =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "load_managed_destination" ->
                                            manager.load(session, destination);
                                    case "prepare_destination_update" ->
                                            manager.prepare(session, document);
                                    case "execute_destination_update" ->
                                            manager.execute(session, attempt);
                                    case "cancel_destination_update" -> manager.cancel(attempt);
                                    case "destination_update_state" -> manager.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    Data<?> content(
            ApiVersion version,
            String id,
            String command,
            String contentId,
            long totalBytes,
            long byteOffset,
            String chunk) {
        Entry entry = find(version, id);
        Object data =
                switch (command) {
                    case "begin_content" -> content.begin(entry.id(), totalBytes);
                    case "append_content" ->
                            content.append(entry.id(), contentId, byteOffset, chunk);
                    case "discard_content" -> content.discard(entry.id(), contentId);
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
        Entry entry = find(version, id);
        Object data =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "load_send_destination" ->
                                            SendSchemas.destination(session, destinationId);
                                    case "load_send_schema" ->
                                            sendSchemas
                                                    .computeIfAbsent(
                                                            id, ignored -> new SendSchemas())
                                                    .load(session, destinationId, document);
                                    case "read_send_schema" -> {
                                        var schemas = sendSchemas.get(id);
                                        if (schemas == null)
                                            throw new SessionException("invalid_resource");
                                        yield schemas.read(schemaId, offset);
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    private Entry find(ApiVersion version, String id) {
        return entries.values().stream()
                .filter(e -> e.key().version() == version && e.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new SessionException("session_missing"));
    }

    record Prepared(SendAccess.State attempt, SubmissionDraft.Summary summary) {}

    record ReplyChannels(List<ReplyChannelReference> channels) {}

    Data<?> replyChannels(ApiVersion version, String id) {
        Entry entry = find(version, id);
        var channels =
                registry.withSession(
                        version, entry.session(), session -> List.copyOf(session.replyChannels()));
        if (channels.size() > 32) throw new SessionException("invalid_resource");
        return new Data<>(version.wireValue(), id, "TEST", new ReplyChannels(channels));
    }

    Data<?> replies(ApiVersion version, String id, int offset) {
        Entry entry = find(version, id);
        if (offset < 0 || offset > 10000 || offset % 20 != 0)
            throw new SessionException("invalid_input");
        var page =
                registry.withSession(
                        version, entry.session(), session -> session.replies(offset, 20));
        return new Data<>(version.wireValue(), id, "TEST", page);
    }

    Data<?> lookup(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            String submissionId,
            int offset) {
        Entry entry = find(version, id);
        eventLogs.clearOwner(id);
        invalidateReceived(entry);
        String destination = DestinationAccess.id(destinationId);
        Object data =
                registry.withSession(
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
                            return detail;
                        });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    Data<?> verify(
            ApiVersion version,
            String id,
            String destinationId,
            String submissionId,
            String document) {
        Entry entry = find(version, id);
        eventLogs.clearOwner(id);
        // Only one SDK/plaintext snapshot may remain active across all API/role sessions.
        clearReceiveSnapshots();
        String destination = DestinationAccess.id(destinationId),
                submission = DestinationAccess.id(submissionId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, content, id);
        ReceivedContent result;
        try {
            result =
                    registry.withSession(
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
                                        resourceTransport == null
                                                ? new ReceiveAccess(
                                                        version,
                                                        destination,
                                                        submission,
                                                        resources.apply(version))
                                                : resourceTransport.forReceive(
                                                        version, destination, submission)) {
                                    return session.receive(
                                            destination,
                                            submission,
                                            read,
                                            content.workspace(id),
                                            schemas);
                                }
                            });
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        try {
            var summary =
                    received.publish(
                            version,
                            id,
                            UUID.fromString(destination),
                            UUID.fromString(submission),
                            result);
            return new Data<>(version.wireValue(), id, "TEST", summary);
        } catch (RuntimeException failure) {
            invalidateReceived(entry);
            throw failure;
        }
    }

    private void clearReceiveSnapshots() {
        received.clear();
        receivedReplies.clear();
        for (Entry other : entries.values())
            registry.withSession(
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
        Entry entry = find(version, id);
        eventLogs.clearOwner(id);
        clearReceiveSnapshots();
        String caseId = DestinationAccess.id(caseValue), replyId = DestinationAccess.id(replyValue);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var schemas = ReceiveRequest.resolve(document, content, id);
        ReceivedReplyContent result;
        try {
            result =
                    registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var read =
                                        resourceTransport == null
                                                ? ReceiveAccess.forReply(
                                                        version,
                                                        caseId,
                                                        replyId,
                                                        resources.apply(version))
                                                : resourceTransport.forReplyReceive(
                                                        version, caseId, replyId)) {
                                    return session.receiveReply(
                                            UUID.fromString(caseId),
                                            UUID.fromString(replyId),
                                            read,
                                            content.workspace(id),
                                            schemas);
                                }
                            });
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        try {
            return new Data<>(
                    version.wireValue(),
                    id,
                    "TEST",
                    receivedReplies.publish(
                            version,
                            id,
                            UUID.fromString(caseId),
                            UUID.fromString(replyId),
                            result));
        } catch (RuntimeException failure) {
            invalidateReceived(entry);
            throw failure;
        }
    }

    Data<?> receivedReply(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        find(version, id);
        Object result =
                switch (command) {
                    case "read_received_reply_schema" ->
                            receivedReplies.schema(version, id, proofId, offset);
                    case "list_received_reply_contents" ->
                            receivedReplies.parts(version, id, proofId, offset);
                    case "read_received_reply_content" ->
                            receivedReplies.read(version, id, proofId, contentId, offset);
                    case "discard_received_reply" -> {
                        entryReplyReceiptInvalidate(version, id);
                        receivedReplies.discard(version, id, proofId);
                        yield Map.of("proofId", proofId);
                    }
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    private void entryReplyReceiptInvalidate(ApiVersion version, String id) {
        find(version, id).replyReceipts().invalidate();
        pendingReplyReceipts.remove(id);
    }

    Data<?> prepareReplyReceipt(ApiVersion version, String id, ReplyReceiptDraft draft) {
        var entry = find(version, id);
        entryReplyReceiptInvalidate(version, id);
        var evidence = replyReceiptEvidence(entry, draft);
        var prepared =
                registry.withSession(
                        version,
                        entry.session(),
                        session -> session.prepareReplyReceipt(draft.request(), evidence));
        var state = entry.replyReceipts().prepare(prepared);
        pendingReplyReceipts.put(id, draft);
        var request = draft.request();
        var warnings =
                draft.proofId() == null
                        ? List.<String>of()
                        : receivedReplies.state(version, id, draft.proofId()).warnings();
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                new PreparedReplyAction(
                        state,
                        request.reason(),
                        request.description(),
                        request.attachmentId() == null ? null : request.attachmentId().toString(),
                        warnings));
    }

    private ReplyReceiptEvidence replyReceiptEvidence(Entry entry, ReplyReceiptDraft draft) {
        if (receiveCleanupFailed.contains(entry.id()))
            throw new SessionException("resource_unavailable");
        if (draft.request().action().equals("reject")) return null;
        var evidence = receivedReplies.evidence(entry.key().version(), entry.id(), draft.proofId());
        if (!evidence.caseId().equals(draft.request().caseId())
                || !evidence.replyId().equals(draft.request().replyId()))
            throw new SessionException("verification_failed");
        return evidence;
    }

    Data<?> replyReceipt(ApiVersion version, String id, String command, String attemptId) {
        var entry = find(version, id);
        if (command.equals("execute_reply_receipt")) {
            var draft = pendingReplyReceipts.get(id);
            if (draft == null) throw new SessionException("send_locked");
            try {
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                entry.replyReceipts()
                                        .execute(
                                                attemptId,
                                                session,
                                                content.workspace(id),
                                                () -> replyReceiptEvidence(entry, draft)));
            } finally {
                try {
                    content.clearWorkspace(id);
                } catch (RuntimeException failure) {
                    receiveCleanupFailed.add(id);
                    entry.sender().cleanupFailed();
                    invalidateReceived(entry);
                    throw failure;
                }
            }
            if (entry.replyReceipts().state().status().equals("confirmed"))
                receivedReplies.clearOwner(id);
        } else if (command.equals("cancel_reply_receipt")) entry.replyReceipts().cancel(attemptId);
        else if (!command.equals("reply_receipt_state"))
            throw new SessionException("invalid_input");
        var state = entry.replyReceipts().state();
        if (!state.status().equals("prepared")) pendingReplyReceipts.remove(id);
        return new Data<>(version.wireValue(), id, "TEST", state);
    }

    Data<?> loadEventLog(
            ApiVersion version,
            String id,
            String destinationId,
            String caseId,
            String submissionId) {
        Entry entry = find(version, id);
        // A failed replacement must never leave an earlier result looking current.
        eventLogs.clear();
        String destination = DestinationAccess.id(destinationId),
                caseValue = DestinationAccess.id(caseId),
                submission = DestinationAccess.id(submissionId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        VerifiedEventLog result;
        try {
            result =
                    registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        resourceTransport == null
                                                ? new EventLogAccess(
                                                        version,
                                                        caseValue,
                                                        submission,
                                                        resources.apply(version))
                                                : resourceTransport.forEvents(
                                                        version, caseValue, submission)) {
                                    return session.eventLog(
                                            UUID.fromString(destination),
                                            UUID.fromString(caseValue),
                                            UUID.fromString(submission),
                                            source,
                                            content.workspace(id));
                                }
                            });
        } finally {
            // SDK storage must be clean before a verified result can cross the native boundary.
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                eventLogs.publish(
                        version,
                        id,
                        UUID.fromString(destination),
                        UUID.fromString(caseValue),
                        UUID.fromString(submission),
                        result));
    }

    Data<?> loadCaseEventLog(ApiVersion version, String id, String caseId) {
        Entry entry = find(version, id);
        eventLogs.clear();
        String caseValue = DestinationAccess.id(caseId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        VerifiedCaseEventLog result;
        try {
            result =
                    registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        resourceTransport == null
                                                ? EventLogAccess.forCase(
                                                        version,
                                                        caseValue,
                                                        resources.apply(version))
                                                : resourceTransport.forCaseEvents(
                                                        version, caseValue)) {
                                    return session.caseEventLog(
                                            UUID.fromString(caseValue),
                                            source,
                                            content.workspace(id));
                                }
                            });
        } finally {
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                eventLogs.publishCase(version, id, UUID.fromString(caseValue), result));
    }

    Data<?> loadReplyEventLog(ApiVersion version, String id, String caseId, String replyId) {
        Entry entry = find(version, id);
        eventLogs.clear();
        String caseValue = DestinationAccess.id(caseId), reply = DestinationAccess.id(replyId);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        VerifiedEventLog result;
        try {
            result =
                    registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        resourceTransport == null
                                                ? new EventLogAccess(
                                                        version,
                                                        caseValue,
                                                        reply,
                                                        resources.apply(version),
                                                        true)
                                                : resourceTransport.forReplyEvents(
                                                        version, caseValue, reply)) {
                                    return session.replyEventLog(
                                            UUID.fromString(caseValue),
                                            UUID.fromString(reply),
                                            source,
                                            content.workspace(id));
                                }
                            });
        } finally {
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                eventLogs.publishReply(
                        version, id, UUID.fromString(caseValue), UUID.fromString(reply), result));
    }

    Data<?> eventLogResource(
            ApiVersion version,
            String id,
            String command,
            String logId,
            String eventId,
            String part,
            int offset) {
        find(version, id);
        Object data =
                switch (command) {
                    case "list_case_event_log" -> eventLogs.casePage(version, id, logId, offset);
                    case "list_event_log" -> eventLogs.page(version, id, logId, offset);
                    case "read_event_log" ->
                            eventLogs.read(version, id, logId, eventId, part, offset);
                    case "discard_event_log" -> {
                        eventLogs.discard(version, id, logId);
                        yield Map.of("logId", logId);
                    }
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    Data<?> received(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        Entry entry = find(version, id);
        Object data =
                switch (command) {
                    case "read_received_schema" -> received.schema(version, id, proofId, offset);
                    case "list_received_contents" -> received.parts(version, id, proofId, offset);
                    case "read_received_content" ->
                            received.read(version, id, proofId, contentId, offset);
                    case "discard_received" -> {
                        received.discard(version, id, proofId);
                        invalidateReceipt(entry);
                        invalidateReply(entry);
                        registry.withSession(
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
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    private void invalidateReceived(Entry entry) {
        invalidateReceipt(entry);
        invalidateReply(entry);
        received.clearOwner(entry.id());
        receivedReplies.clearOwner(entry.id());
        registry.withSession(
                entry.key().version(),
                entry.session(),
                session -> {
                    session.discardReceived();
                    return null;
                });
    }

    private void invalidateReceipt(Entry entry) {
        entry.receipts().invalidate();
        pendingReceipts.remove(entry.id());
        entry.replyReceipts().invalidate();
        pendingReplyReceipts.remove(entry.id());
    }

    private void invalidateReply(Entry entry) {
        var schema = replySchemas.remove(entry.id());
        if (schema != null) schema.clear();
        entry.replySender().invalidatePrepared();
        pendingReplies.remove(entry.id());
    }

    private ReplyRecipient replyRecipient(Entry entry, ReceiveStore.Summary proof) {
        var recipient =
                registry.withSession(
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
        Entry entry = find(version, id);
        var proof = received.state(version, id, proofId);
        var recipient = replyRecipient(entry, proof);
        var schemas = recipient.schemas();
        if (offset < 0 || offset > schemas.size() || offset % 2 != 0)
            throw new SessionException("invalid_input");
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
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

    private Map<String, String> replyLocalSchema(String owner, String document) {
        var request = StrictJson.object(document, 24 * 1024);
        var handle = request.get("schemaContentId");
        if (handle == null || handle.isJsonNull()) return Map.of();
        if (!handle.isJsonPrimitive() || !handle.getAsJsonPrimitive().isString())
            throw new SessionException("invalid_input");
        String id = DestinationAccess.id(handle.getAsString());
        if (content.length(owner, id) > 2 * 1024 * 1024)
            throw new SessionException("content_limit");
        byte[] bytes = content.read(owner, id);
        try {
            String source =
                    java.nio.charset.StandardCharsets.UTF_8
                            .newDecoder()
                            .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                            .decode(java.nio.ByteBuffer.wrap(bytes))
                            .toString();
            var schema = StrictJson.object(source, 2 * 1024 * 1024);
            if (!schema.has("$id")
                    || !schema.get("$id").isJsonPrimitive()
                    || !schema.get("$id").getAsJsonPrimitive().isString()
                    || !SchemaSources.documentUri(schema.get("$id").getAsString())
                            .equals(
                                    SchemaSources.documentUri(
                                            request.get("schemaUri").getAsString())))
                throw new SessionException("invalid_input");
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
        Entry entry = find(version, id);
        var proof = received.state(version, id, proofId);
        Object result =
                registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            if (command.equals("load_reply_schema")) {
                                var schema =
                                        replySchemas.computeIfAbsent(
                                                id, ignored -> new SendSchemas());
                                schema.clear();
                                return schema.loadReply(
                                        session,
                                        replyRecipient(entry, proof),
                                        proofId,
                                        document,
                                        replyLocalSchema(id, document));
                            }
                            var schemas = replySchemas.get(id);
                            if (!command.equals("read_reply_schema") || schemas == null)
                                throw new SessionException("invalid_resource");
                            return schemas.readReply(proofId, schemaId, offset);
                        });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> prepareReply(ApiVersion version, String id, String document) {
        Entry entry = find(version, id);
        if (receiveCleanupFailed.contains(id)) throw new SessionException("resource_unavailable");
        var proof = received.state(version, id, ReplyDraft.proofId(document));
        var recipient = replyRecipient(entry, proof);
        long reserved =
                entries.values().stream()
                        .mapToLong(
                                other ->
                                        other.sender().pendingBytes()
                                                + (other == entry
                                                        ? 0
                                                        : other.replySender().pendingBytes()))
                        .sum();
        var draft =
                ReplyDraft.resolve(
                        document, proof, content, id, ContentStore.TOTAL_BYTES - reserved);
        recipient.check(draft.input());
        var schemas = replySchemas.get(id);
        if (schemas == null) throw new SessionException("schema_required");
        registry.withSession(
                version,
                entry.session(),
                session -> {
                    schemas.checkReply(
                            session, proof.proofId(), draft.summary().schemaId(), draft.input());
                    return null;
                });
        var attempt = entry.replySender().prepare(draft.input(), recipient);
        pendingReplies.put(id, draft.summary());
        return new Data<>(
                version.wireValue(), id, "TEST", new PreparedReply(attempt, draft.summary()));
    }

    Data<?> replySend(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_reply")) {
            var pending = pendingReplies.get(id);
            if (pending == null) throw new SessionException("send_locked");
            try {
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                entry.replySender()
                                        .execute(
                                                attemptId,
                                                session,
                                                content.workspace(id),
                                                () -> {
                                                    var proof =
                                                            received.state(
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
                try {
                    content.clearWorkspace(id);
                } catch (RuntimeException failure) {
                    receiveCleanupFailed.add(id);
                    entry.replySender().cleanupFailed();
                    entry.sender().cleanupFailed();
                    invalidateReceived(entry);
                }
            }
        } else if (command.equals("cancel_reply")) entry.replySender().cancel(attemptId);
        else if (!command.equals("reply_state")) throw new SessionException("invalid_input");
        var state = entry.replySender().state();
        if (!state.status().equals("prepared")) pendingReplies.remove(id);
        return new Data<>(version.wireValue(), id, "TEST", state);
    }

    Data<?> prepareReceipt(ApiVersion version, String id, ReceiptRequest request, String proofId) {
        Entry entry = find(version, id);
        invalidateReceipt(entry);
        if (request == null || receiveCleanupFailed.contains(id))
            throw new SessionException("invalid_input");
        SignedReceipt signed;
        List<String> warnings = validateReceipt(entry, request, proofId);
        try {
            signed =
                    registry.withSession(
                            version,
                            entry.session(),
                            session -> session.signReceipt(request, content.workspace(id)));
        } catch (RuntimeException | LinkageError failure) {
            invalidateReceived(entry);
            throw failure;
        } finally {
            try {
                content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                invalidateReceived(entry);
                throw failure;
            }
        }
        var state = entry.receipts().prepare(signed);
        pendingReceipts.put(id, new PendingReceipt(request, proofId));
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                new PreparedReceipt(
                        state,
                        request.reason(),
                        request.description(),
                        request.attachmentId() == null ? null : request.attachmentId().toString(),
                        warnings));
    }

    private List<String> validateReceipt(Entry entry, ReceiptRequest request, String proofId) {
        if (receiveCleanupFailed.contains(entry.id()))
            throw new SessionException("resource_unavailable");
        try {
            return registry.withSession(
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
                        if (request.action().equals("accept")) {
                            var proof = received.state(entry.key().version(), entry.id(), proofId);
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
            invalidateReceived(entry);
            throw failure;
        }
    }

    Data<?> receipt(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_receipt")) {
            var pending = pendingReceipts.get(id);
            if (pending == null) throw new SessionException("send_locked");
            entry.receipts()
                    .execute(
                            attemptId,
                            (value, io) -> {
                                validateReceipt(entry, pending.request(), pending.proofId());
                                registry.withSession(
                                        version,
                                        entry.session(),
                                        session -> {
                                            session.sendReceipt(value, io);
                                            return null;
                                        });
                            });
            if (entry.receipts().state().status().equals("confirmed")) invalidateReceived(entry);
        } else if (command.equals("cancel_receipt")) entry.receipts().cancel(attemptId);
        else if (!command.equals("receipt_state")) throw new SessionException("invalid_input");
        var state = entry.receipts().state();
        if (!state.status().equals("prepared")) pendingReceipts.remove(id);
        return new Data<>(version.wireValue(), id, "TEST", state);
    }

    Data<?> provisionDestination(
            ApiVersion version,
            String id,
            String command,
            String document,
            String attemptId,
            String bundleId,
            String destinationId) {
        var entry = find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var keys = localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        var creator =
                provisioning.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationProvisioning(
                                        keys,
                                        resourceTransport == null
                                                ? resources.apply(version)
                                                : resourceTransport.forDestinationLifecycle(
                                                        version)));
        if (command.equals("execute_destination_creation")) invalidateReceived(entry);
        Object result =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_creation" ->
                                            creator.prepare(session, document);
                                    case "mark_destination_creation_dispatch" ->
                                            creator.markDispatch(attemptId);
                                    case "execute_destination_creation" ->
                                            creator.execute(session, attemptId);
                                    case "cancel_destination_creation" -> creator.cancel(attemptId);
                                    case "destination_creation_state" -> creator.state();
                                    case "reconcile_destination_creation" ->
                                            creator.reconcile(session, bundleId, destinationId);
                                    case "use_generated_keys" -> {
                                        var bundle =
                                                keys.list().stream()
                                                        .filter(
                                                                value ->
                                                                        value.bundleId()
                                                                                .equals(bundleId))
                                                        .findFirst()
                                                        .orElseThrow(
                                                                () ->
                                                                        new SessionException(
                                                                                "key_missing"));
                                        if (!bundle.status().equals("bound")
                                                || !Objects.equals(
                                                        bundle.destinationId(), destinationId))
                                            throw new SessionException("invalid_input");
                                        var registration =
                                                entry.destinations()
                                                        .loadOwned(session, destinationId);
                                        if ("C"
                                                .equals(
                                                        StrictJson.object(
                                                                        registration.detailsJson(),
                                                                        24576)
                                                                .get("type")
                                                                .getAsString()))
                                            throw new SessionException("destination_no_keys");
                                        for (String purpose : List.of("decrypt", "sign"))
                                            entry.destinations()
                                                    .importKey(
                                                            session,
                                                            destinationId,
                                                            purpose,
                                                            keys.key(bundleId, purpose)
                                                                    .privateJwk());
                                        yield new DestinationAccess.KeyState(session.loadedKeys());
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> discoverProcess(ApiVersion version, String id, String document) {
        var entry = find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var remote =
                resourceTransport == null
                        ? resources.apply(version)
                        : resourceTransport.forProcessSearch();
        var result =
                registry.withSession(
                        version,
                        entry.session(),
                        session -> ProcessDiscovery.search(session, document, remote));
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> cleanupDestination(
            ApiVersion version, String id, String command, String destinationId, String attemptId) {
        var entry = find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var cleanup =
                cleanups.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationCleanup(
                                        resourceTransport == null
                                                ? resources.apply(version)
                                                : resourceTransport.forDestinationLifecycle(
                                                        version)));
        if (command.equals("execute_destination_cleanup")) invalidateReceived(entry);
        Object result =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_cleanup" ->
                                            cleanup.prepare(session, destinationId);
                                    case "execute_destination_cleanup" ->
                                            cleanup.execute(session, attemptId);
                                    case "cancel_destination_cleanup" -> cleanup.cancel(attemptId);
                                    case "destination_cleanup_state" -> cleanup.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> rotateDestinationKeys(
            ApiVersion version, String id, String command, String document, String attemptId) {
        var entry = find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var keys = localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        var rotation =
                rotations.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationRotation(
                                        keys,
                                        resourceTransport == null
                                                ? resources.apply(version)
                                                : resourceTransport.forDestinationLifecycle(
                                                        version)));
        if (command.equals("execute_destination_rotation")) invalidateReceived(entry);
        Object result =
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_rotation" ->
                                            rotation.prepare(session, document);
                                    case "mark_destination_rotation_dispatch" ->
                                            rotation.markDispatch(attemptId);
                                    case "execute_destination_rotation" ->
                                            rotation.execute(session, attemptId);
                                    case "cancel_destination_rotation" ->
                                            rotation.cancel(attemptId);
                                    case "destination_rotation_state" -> rotation.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> generatedKeys(ApiVersion version, String id, String command) {
        var entry = find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var generated = localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        Object result =
                command.equals("generate_test_keys")
                        ? registry.withSession(version, entry.session(), generated::generate)
                        : Map.of("bundles", generated.list());
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> exportSessionItem(ApiVersion version, String id, int offset) {
        var entry = find(version, id);
        return new Data<>(
                version.wireValue(),
                id,
                "TEST",
                registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                archives.computeIfAbsent(id, ignored -> new SessionArchives())
                                        .export(session, localKeys.get(id), offset)));
    }

    Data<?> restoreSessionItem(ApiVersion version, String id, String document) {
        var entry = find(version, id);
        var item = SessionArchives.parse(document);
        registry.withSession(
                version,
                entry.session(),
                session -> {
                    if (item.generatedKey() != null)
                        localKeys
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
                    } else session.restoreReplyKey(item, content.workspace(id));
                    return null;
                });
        return new Data<>(version.wireValue(), id, "TEST", Map.of("restored", true));
    }

    private void discardPendingChannel(Entry entry, String attemptId) {
        if (attemptId == null) return;
        registry.withSession(
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
        Entry entry = find(version, id);
        long reserved =
                entries.values().stream()
                        .mapToLong(
                                other ->
                                        other.replySender().pendingBytes()
                                                + (other == entry
                                                        ? 0
                                                        : other.sender().pendingBytes()))
                        .sum();
        var draft =
                SubmissionDraft.resolve(
                        document, content, entry.id(), ContentStore.TOTAL_BYTES - reserved);
        discardPendingChannel(entry, entry.sender().state().attemptId());
        var attempt = entry.sender().prepare(draft.input());
        if (draft.input().replyOffer() != null) {
            try {
                registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            session.prepareReplyChannel(
                                    UUID.fromString(attempt.attemptId()),
                                    draft.input(),
                                    content.workspace(id));
                            return null;
                        });
            } catch (RuntimeException failure) {
                entry.sender().cancel(attempt.attemptId());
                throw failure;
            }
        }
        return new Data<>(version.wireValue(), id, "TEST", new Prepared(attempt, draft.summary()));
    }

    Data<?> send(ApiVersion version, String id, String command, String attemptId) {
        Entry entry = find(version, id);
        if (command.equals("execute_send")) {
            registry.withSession(
                    version,
                    entry.session(),
                    session -> entry.sender().execute(attemptId, session, content.workspace(id)));
            try {
                content.clearWorkspace(id);
            } catch (SessionException failure) {
                entry.sender().cleanupFailed();
            }
        } else if (command.equals("cancel_send")) {
            entry.sender().cancel(attemptId);
            discardPendingChannel(entry, attemptId);
        } else if (!command.equals("send_state")) throw new SessionException("invalid_input");
        if (Set.of("failed", "cancelled").contains(entry.sender().state().status()))
            discardPendingChannel(entry, entry.sender().state().attemptId());
        return new Data<>(version.wireValue(), id, "TEST", entry.sender().state());
    }

    private static SessionException safe(Throwable cause) {
        return cause instanceof SessionException known
                ? known
                : new SessionException("authentication_failed");
    }

    private void remove(Entry entry) {
        if (entry != null) {
            management.remove(entry.id());
            var archive = archives.remove(entry.id());
            if (archive != null) archive.clear();
            provisioning.remove(entry.id());
            rotations.remove(entry.id());
            cleanups.remove(entry.id());
            var generated = localKeys.remove(entry.id());
            if (generated != null) generated.clear();
        }
        if (entry == null) return;
        var replySchema = replySchemas.remove(entry.id());
        if (replySchema != null) replySchema.clear();
        var schemas = sendSchemas.remove(entry.id());
        if (schemas != null) schemas.clear();
        eventLogs.clearOwner(entry.id());
        received.clearOwner(entry.id());
        receivedReplies.clearOwner(entry.id());
        receiveCleanupFailed.remove(entry.id());
        entry.sender().close();
        entry.receipts().close();
        pendingReceipts.remove(entry.id());
        entry.replyReceipts().close();
        pendingReplyReceipts.remove(entry.id());
        entry.replySender().close();
        pendingReplies.remove(entry.id());
        try {
            entry.session().close();
        } finally {
            content.releaseSession(entry.id());
        }
    }

    public void close() {
        eventLogs.clear();
        received.clear();
        receivedReplies.clear();
        boolean failed = false;
        for (Entry entry : List.copyOf(entries.values())) {
            try {
                remove(entry);
            } catch (Exception e) {
                failed = true;
            }
        }
        entries.clear();
        try {
            content.close();
        } catch (Exception e) {
            failed = true;
        }
        if (resourceTransport != null) {
            try {
                resourceTransport.close();
            } catch (Exception e) {
                failed = true;
            }
        }
        if (exchange instanceof AutoCloseable resource) {
            try {
                resource.close();
            } catch (Exception e) {
                failed = true;
            }
        }
        if (failed) throw new SessionException("resource_unavailable");
    }
}
