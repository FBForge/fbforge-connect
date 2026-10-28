package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.client.services.auth.OAuthProvider;
import dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders;
import dev.fitko.fitconnect.rest.client.services.submission.impl.SubmissionApiClient;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.fitconnect.integration.contract.*;

/** Owns this SDK session, loaded keys and sender/receiver lifetime. */
final class TokenSession implements AuthenticatedSession {
    public Boolean canManageDestinations() {
        return http.managementAllowed();
    }

    private OAuthProvider current;
    private OAuthTransport http;
    private final PrivateKeys keys = new PrivateKeys();
    private TokenExchange tokens;
    private ResourceExchange resources;
    private Sender sender;
    private Receiver receiver;
    private java.nio.file.Path senderWorkspace;

    TokenSession(
            OAuthProvider provider,
            OAuthTransport http,
            TokenExchange tokens,
            ResourceExchange resources) {
        current = provider;
        this.http = http;
        this.tokens = tokens;
        this.resources = resources;
    }

    private DestinationOperations destinationOperations() {
        requireOpen();
        return new DestinationOperations(current, http);
    }

    private void requireOpen() {
        if (current == null) throw new SessionException("session_missing");
    }

    public String destinations(int offset, int limit) {
        return destinationOperations().destinations(offset, limit);
    }

    @Override
    public String publicSchema(String uri, Map<String, String> local, boolean allowExternal) {
        requireOpen();
        return new SchemaValidation(local, allowExternal).examplePackage(uri);
    }

    @Override
    public boolean validateDraft(SchemaSnapshot snapshot, String mimeType, byte[] data) {
        requireOpen();
        return new SchemaValidation(Map.of(), false).draft(snapshot, mimeType, data);
    }

    @Override
    public String publicSchema(String uri) {
        requireOpen();
        return new SchemaValidation(Map.of(), true).examplePackage(uri);
    }

    public String destination(String destinationId) {
        return destinationOperations().destination(destinationId);
    }

    public String ownDestination(String destinationId) {
        return destinationOperations().ownDestination(destinationId);
    }

    public String processDestinations(
            String model,
            String message,
            String region,
            int offset,
            int limit,
            ResourceExchange processReads) {
        return destinationOperations()
                .processDestinations(model, message, region, offset, limit, processReads);
    }

    public void checkGeneratedTestKey(String purpose, GeneratedTestKey key) {
        requireOpen();
        new PrivateKeys()
                .importKey(
                        "00000000-0000-4000-8000-000000000001",
                        purpose,
                        key.privateJwk(),
                        List.of(key.publicJwk()));
    }

    public GeneratedTestKey generateTestKey(String purpose) {
        requireOpen();
        return TestKeys.generate(purpose);
    }

    public String canonicalDestinationMutation(String kind, String document) {
        return destinationOperations().canonicalDestinationMutation(kind, document);
    }

    public String createOwnDestination(String document, ResourceExchange authorized) {
        return destinationOperations().createOwnDestination(document, authorized);
    }

    public void deleteOwnDestination(String destinationId, ResourceExchange authorized) {
        destinationOperations().deleteOwnDestination(destinationId, authorized);
    }

    public void registerOwnDestinationKey(
            String destinationId, String publicJwk, ResourceExchange authorized) {
        destinationOperations().registerOwnDestinationKey(destinationId, publicJwk, authorized);
    }

    public String patchOwnDestination(
            String destinationId, String patch, ResourceExchange authorized) {
        return destinationOperations().patchOwnDestination(destinationId, patch, authorized);
    }

    public String ownDestinationKeys(String id, int offset, int limit) {
        return destinationOperations().ownDestinationKeys(id, offset, limit);
    }

    public String destinationKeys(String destinationId, int offset, int limit) {
        return destinationOperations().destinationKeys(destinationId, offset, limit);
    }

    private SubmissionApiClient submissionsApi() {
        requireOpen();
        return new SubmissionApiClient(
                new RequestHeaders(current),
                http,
                new ConcurrencyLimiter(1),
                IntegrationEnvironment.current().submissionApi());
    }

    public SubmissionPage submissions(String id, int offset, int limit) {
        if (offset < 0 || limit < 1 || limit > 100) throw new SessionException("invalid_input");
        var result = submissionsApi().getAvailableSubmissions(UUID.fromString(id), offset, limit);
        if (result == null
                || result.submissions() == null
                || result.count() == null
                || result.offset() == null
                || result.totalCount() == null
                || result.offset() != offset
                || result.count() != result.submissions().size()
                || result.submissions().size() > limit)
            throw new SessionException("invalid_resource");
        return new SubmissionPage(
                result.offset(),
                result.totalCount(),
                result.submissions().stream()
                        .map(
                                item ->
                                        new SubmissionPage.Entry(
                                                item.destinationId(),
                                                item.submissionId(),
                                                item.caseId()))
                        .toList());
    }

    public ReplyPage replies(int offset, int limit) {
        requireOpen();
        if (offset < 0 || offset > 10000 || limit < 1 || limit > 100)
            throw new SessionException("invalid_input");
        var result =
                new dev.fitko.fitconnect.rest.client.services.submission.impl.ReplyApiClient(
                                new RequestHeaders(current),
                                http,
                                new ConcurrencyLimiter(1),
                                IntegrationEnvironment.current().submissionApi())
                        .getAvailableReplies(null, offset, limit);
        if (result == null
                || result.replies() == null
                || result.count() == null
                || result.offset() == null
                || result.totalCount() == null
                || result.offset() != offset
                || result.count() != result.replies().size()
                || result.replies().size() > limit
                || result.replies().stream().anyMatch(java.util.Objects::isNull)
                || result.replies().size() < limit
                        && offset + result.replies().size() < result.totalCount())
            throw new SessionException("invalid_resource");
        return new ReplyPage(
                result.offset(),
                result.totalCount(),
                result.replies().stream()
                        .map(item -> new ReplyPage.Entry(item.replyId(), item.caseId()))
                        .toList());
    }

    public SubmissionInfo submission(String id) {
        var result = submissionsApi().getSubmission(UUID.fromString(id));
        if (result == null || !UUID.fromString(id).equals(result.submissionId()))
            throw new SessionException("invalid_resource");
        var service = result.publicService();
        var process = result.processMessage();
        return new SubmissionInfo(
                result.destinationId(),
                result.fromDestinationId(),
                result.submissionId(),
                result.caseId(),
                result.attachments(),
                service == null ? null : service.identifier(),
                service == null ? null : service.name(),
                result.region(),
                process == null ? null : process.processModelId(),
                process == null ? null : process.messageId(),
                result.encryptedMetadata() != null && !result.encryptedMetadata().isBlank(),
                result.encryptedData() != null && !result.encryptedData().isBlank());
    }

    public KeyReference importKey(
            String destinationId,
            String purpose,
            String document,
            List<String> eligiblePublicJwks) {
        requireOpen();
        receiver = null;
        return keys.importKey(destinationId, purpose, document, eligiblePublicJwks);
    }

    public List<KeyReference> loadedKeys() {
        requireOpen();
        return keys.references();
    }

    public void retainKeys(String id, List<String> registrations) {
        requireOpen();
        var before = keys.references();
        try {
            keys.retainRegistered(id, registrations);
        } catch (RuntimeException failure) {
            receiver = null;
            throw failure;
        }
        if (!before.equals(keys.references())) receiver = null;
    }

    public void discardReceived() {
        requireOpen();
        receiver = null;
    }

    public ReceiptEvidence receiptEvidence(String destination, String submission) {
        requireOpen();
        if (receiver == null) throw new SessionException("verification_failed");
        return receiver.evidence(destination, submission);
    }

    public SignedReceipt signReceipt(ReceiptRequest request, java.nio.file.Path workspace) {
        requireOpen();
        if (request == null || workspace == null) throw new SessionException("invalid_input");
        var key = keys.signingKey(request.destinationId().toString(), request.signingKid());
        var evidence =
                request.action().equals("accept")
                        ? receiptEvidence(
                                request.destinationId().toString(),
                                request.submissionId().toString())
                        : null;
        return ReceiptSigner.sign(key, request, evidence, workspace);
    }

    public void sendReceipt(SignedReceipt value, ResourceExchange authorized) {
        requireOpen();
        if (value == null || authorized == null) throw new SessionException("invalid_input");
        var key = keys.signingKey(value.destinationId().toString(), value.signingKid());
        ReceiptSigner.validate(value, key);
        if (value.action().equals("accept")) {
            var evidence =
                    receiptEvidence(
                            value.destinationId().toString(), value.submissionId().toString());
            if (!value.caseId().equals(evidence.caseId()))
                throw new SessionException("verification_failed");
        }
        new dev.fitko.fitconnect.rest.client.services.submission.impl.CaseApiClient(
                        new RequestHeaders(current),
                        new ReceiptTransport(authorized),
                        IntegrationEnvironment.current().submissionApi())
                .sendSubmissionEvent(value.caseId(), value.jwt());
    }

    public VerifiedEventLog eventLog(
            UUID destinationId,
            UUID caseId,
            UUID submissionId,
            EventLogSource source,
            java.nio.file.Path workspace) {
        requireOpen();
        return EventLogs.read(current, destinationId, caseId, submissionId, source, workspace);
    }

    public VerifiedCaseEventLog caseEventLog(
            UUID caseId, EventLogSource source, java.nio.file.Path workspace) {
        requireOpen();
        return EventLogs.caseLog(current, caseId, source, workspace);
    }

    public VerifiedEventLog replyEventLog(
            UUID caseId, UUID replyId, EventLogSource source, java.nio.file.Path workspace) {
        requireOpen();
        return EventLogs.reply(current, caseId, replyId, source, workspace);
    }

    public List<SessionKeyArchive> archiveKeys() {
        requireOpen();
        var result = new java.util.ArrayList<>(keys.archive());
        if (sender != null) result.addAll(sender.replyKeys.archive());
        return List.copyOf(result);
    }

    private void ensureSender(java.nio.file.Path workspace) {
        requireOpen();
        if (sender == null) {
            sender = new Sender(current, tokens, resources, workspace);
            senderWorkspace = workspace;
        } else if (!senderWorkspace.equals(workspace))
            throw new SessionException("invalid_submission");
    }

    public void prepareReplyChannel(
            UUID attemptId, SubmissionInput input, java.nio.file.Path workspace) {
        ensureSender(workspace);
        sender.replyKeys.offer(attemptId, input);
    }

    public void restoreReplyKey(SessionKeyArchive item, java.nio.file.Path workspace) {
        ensureSender(workspace);
        sender.replyKeys.restore(item);
    }

    public void discardDestinationKeys(String destinationId) {
        requireOpen();
        keys.discardDestination(destinationId);
        receiver = null;
    }

    public void discardKey(KeyReference reference) {
        requireOpen();
        keys.discard(reference);
        receiver = null;
    }

    public void discardReplyChannel(UUID attemptId) {
        requireOpen();
        if (sender == null) throw new SessionException("key_missing");
        sender.replyKeys.discard(attemptId);
    }

    public void discardKeys() {
        requireOpen();
        keys.clear();
        receiver = null;
    }

    public ReceivedContent receive(
            String destination,
            String submission,
            ResourceExchange read,
            java.nio.file.Path workspace,
            java.util.Map<String, String> schemas) {
        requireOpen();
        receiver = null;
        destination = UUID.fromString(destination).toString();
        UUID.fromString(submission);
        var selected = keys.decryptionKeys(destination);
        if (selected.isEmpty()) throw new SessionException("key_rejected");
        var candidate = new Receiver();
        var result =
                candidate.receive(
                        current, selected, destination, submission, read, workspace, schemas);
        receiver = candidate;
        return result;
    }

    public ReceivedReplyContent receiveReply(
            UUID caseId,
            UUID replyId,
            ReplySource read,
            java.nio.file.Path workspace,
            java.util.Map<String, String> schemas) {
        requireOpen();
        receiver = null;
        if (caseId == null
                || replyId == null
                || read == null
                || workspace == null
                || schemas == null) throw new SessionException("invalid_input");
        if (sender == null || !sender.replyKeys.canReceiveCase(caseId))
            throw new SessionException("key_rejected");
        return ReplyReceiver.receive(
                current, sender.replyKeys, caseId, replyId, read, workspace, schemas);
    }

    public PreparedReplyReceipt prepareReplyReceipt(
            ReplyReceiptRequest request, ReplyReceiptEvidence evidence) {
        requireOpen();
        if (request == null) throw new SessionException("invalid_input");
        if (request.action().equals("accept")
                && (evidence == null
                        || sender == null
                        || sender.replyKeys.references().stream()
                                .noneMatch(
                                        item ->
                                                java.util.Set.of("bound", "recovered")
                                                                .contains(item.status())
                                                        && item.caseId().equals(request.caseId())
                                                        && item.attemptId()
                                                                .equals(
                                                                        evidence
                                                                                .channelAttemptId()))))
            throw new SessionException("verification_failed");
        return ReplyReceipts.prepare(request, evidence);
    }

    public UUID sendReplyReceipt(
            PreparedReplyReceipt prepared,
            ResourceExchange authorized,
            java.nio.file.Path workspace) {
        requireOpen();
        if (prepared == null || authorized == null || workspace == null)
            throw new SessionException("invalid_input");
        if (!prepareReplyReceipt(prepared.request(), prepared.evidence()).equals(prepared))
            throw new SessionException("verification_failed");
        return ReplyReceipts.send(current, prepared, authorized, workspace);
    }

    public ReplyRecipient replyRecipient(String destination, String submission) {
        requireOpen();
        if (receiver == null) throw new SessionException("verification_failed");
        return receiver.replyRecipient(destination, submission);
    }

    public ReplyResult sendReply(
            ReplyInput input, java.nio.file.Path workspace, ResourceExchange authorized) {
        requireOpen();
        if (input == null || workspace == null || authorized == null)
            throw new SessionException("invalid_input");
        var recipient =
                replyRecipient(input.destinationId().toString(), input.submissionId().toString());
        recipient.check(input);
        return new Sender(current, tokens, authorized, workspace).sendReply(recipient, input);
    }

    public List<ReplyChannelReference> replyChannels() {
        requireOpen();
        return sender == null ? List.of() : sender.replyKeys.references();
    }

    public void completeReplyChannel(
            UUID attemptId, UUID caseId, UUID submissionId, boolean retain) {
        requireOpen();
        if (sender == null) {
            if (retain) throw new SessionException("invalid_resource");
            return;
        }
        sender.replyKeys.complete(attemptId, caseId, submissionId, retain);
    }

    public SendResult send(SubmissionInput input, java.nio.file.Path workspace, UUID attemptId) {
        requireOpen();
        if (attemptId == null) throw new SessionException("invalid_input");
        if (workspace == null || input == null) throw new SessionException("invalid_submission");
        ensureSender(workspace);
        return sender.send(input, attemptId);
    }

    public void validatePublicKey(String document, String purpose) {
        PublicCertificates.validate(document, purpose);
    }

    public void check() {
        if (current == null) throw new SessionException("session_missing");
        current.authorizationHeader(); // The token never leaves this adapter.
    }

    public void close() {
        if (sender != null) sender.replyKeys.clear();
        keys.clear();
        current = null;
        http = null;
        sender = null;
        senderWorkspace = null;
        receiver = null;
        tokens = null;
        resources = null;
    }
}
