package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;

/** Owns all SDK sessions and their resources. Cleanup is centralized here, never in the UI. */
final class SessionState implements AutoCloseable {
    record Key(ApiVersion version, SessionRole role) {}

    record Entry(
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
                    id,
                    key.version().wireValue(),
                    key.role().wireValue(),
                    IntegrationEnvironment.current().name(),
                    connected);
        }
    }

    final AdapterRegistry registry;
    final TokenExchange exchange;
    final TestResourceTransport resourceTransport;
    final java.util.function.Function<ApiVersion, ResourceExchange> resources;
    final Map<Key, Entry> entries = new HashMap<>();
    // Session-only credentials never enter IPC replies or profile archives.
    private final Map<String, Credentials> credentials = new HashMap<>();

    private static final class Credentials implements AutoCloseable {
        final String clientId;
        final char[] secret;

        Credentials(String clientId, String secret) {
            this.clientId = clientId;
            this.secret = secret.toCharArray();
        }

        public void close() {
            Arrays.fill(secret, '\0');
        }
    }

    final Map<String, SessionArchives> archives = new HashMap<>();
    final Map<String, DestinationCleanup> cleanups = new HashMap<>();
    final Map<String, DestinationRotation> rotations = new HashMap<>();
    final Map<String, DestinationProvisioning> provisioning = new HashMap<>();
    final Map<String, LocalTestKeys> localKeys = new HashMap<>();
    final Map<String, DestinationManagement> management = new HashMap<>();
    final Map<String, SendSchemas> replySchemas = new HashMap<>();
    final Map<String, SendSchemas> sendSchemas = new HashMap<>();
    final CaseRepository cases = new CaseRepository();
    final Map<String, String> caseScopes = new HashMap<>();
    final ContentStore content;
    final ReceiveStore received = new ReceiveStore();
    final ReplyReceiveStore receivedReplies = new ReplyReceiveStore();
    final EventLogStore eventLogs = new EventLogStore();
    final Set<String> receiveCleanupFailed = new HashSet<>();

    final Map<String, PendingReceipt> pendingReceipts = new HashMap<>();
    final Map<String, ReplyReceiptDraft> pendingReplyReceipts = new HashMap<>();
    final Map<String, ReplyDraft.Summary> pendingReplies = new HashMap<>();
    final SessionDestinations destinationsFlow = new SessionDestinations(this);
    final SessionContent contentFlow = new SessionContent(this);
    final SessionSend sendFlow = new SessionSend(this);
    final SessionReceive receiveFlow = new SessionReceive(this);
    final SessionReplies repliesFlow = new SessionReplies(this);
    final SessionReceipts receiptsFlow = new SessionReceipts(this);
    final SessionEvents eventsFlow = new SessionEvents(this);

    SessionState(AdapterRegistry registry, TokenExchange exchange) {
        this.registry = registry;
        this.exchange = exchange;
        content = new ContentStore();
        resourceTransport = new TestResourceTransport();
        resources = resourceTransport::forVersion;
    }

    SessionState(
            AdapterRegistry registry,
            TokenExchange exchange,
            java.util.function.Function<ApiVersion, ResourceExchange> resources) {
        this(registry, exchange, resources, new ContentStore());
    }

    SessionState(
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
            sender.certificateVerifier(
                    (document, purpose) -> registry.validatePublicKey(version, document, purpose));
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
            credentials.put(entry.id(), new Credentials(clientId, clientSecret));
            caseScopes.put(
                    entry.id(),
                    version.wireValue() + "/" + role.wireValue() + "/client/" + clientId);
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
            return Map.of(
                    "apiVersion",
                    version.wireValue(),
                    "environment",
                    IntegrationEnvironment.current().name(),
                    "valid",
                    true);
        } catch (Exception | LinkageError failure) {
            throw safe(failure);
        }
    }

    SessionSnapshot openForApi(
            ApiVersion sourceVersion, String sourceId, ApiVersion targetVersion) {
        if (sourceVersion == targetVersion) throw new SessionException("invalid_input");
        var source = find(sourceVersion, sourceId);
        // Cached targets are selected by the UI. A stale view must never replace one here.
        if (entries.containsKey(new Key(targetVersion, source.key().role())))
            throw new SessionException("invalid_input");
        var login = credentials.get(source.id());
        if (login == null) throw new SessionException("session_missing");
        return open(targetVersion, source.key().role(), login.clientId, new String(login.secret));
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

    Entry find(ApiVersion version, String id) {
        return entries.values().stream()
                .filter(e -> e.key().version() == version && e.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new SessionException("session_missing"));
    }

    static SessionException safe(Throwable cause) {
        return cause instanceof SessionException known
                ? known
                : new SessionException("authentication_failed");
    }

    void remove(Entry entry) {
        if (entry != null) {
            var login = credentials.remove(entry.id());
            if (login != null) login.close();
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
        caseScopes.remove(entry.id());
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
        cases.close();
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
