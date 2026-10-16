package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.domain.sender.SendableSubmission;
import dev.fitko.fitconnect.client.SenderClient;
import dev.fitko.fitconnect.client.SubscriberClient;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.destination.DestinationApiService;
import dev.fitko.fitconnect.core.submission.SubmissionApiService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.fitconnect.integration.contract.*;

public final class V2Adapter implements SdkAdapter {
    public ProbeResult probe() {
        // Resolve method signatures as well as entry classes without creating a network client.
        SenderClient.class.getDeclaredMethods();
        SubscriberClient.class.getDeclaredMethods();
        SendableSubmission.Builder();
        boolean isolated =
                SenderClient.class.getClassLoader() == getClass().getClassLoader()
                        && dependencyClass().getClassLoader() == getClass().getClassLoader();
        return new ProbeResult("v2", "3.5.2", "TEST", SenderClient.class.getName(), isolated);
    }

    public Class<?> dependencyClass() {
        return com.networknt.schema.SchemaRegistry.class;
    }

    public AuthenticatedSession openSession(
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources) {
        // SDK 3.5.2 joins form parameters without encoding. Escape at this pinned adapter boundary.
        var http = new OAuthTransport(transport, resources);
        var provider =
                new DefaultOAuthApiService(
                        http,
                        URLEncoder.encode(clientId, StandardCharsets.UTF_8),
                        URLEncoder.encode(clientSecret, StandardCharsets.UTF_8),
                        "https://auth-testing.fit-connect.fitko.dev");
        return new TokenSession(provider, http, transport, resources);
    }

    private static final class TokenSession implements AuthenticatedSession {
        private DefaultOAuthApiService current;
        private DestinationApiService destinations;
        private SubmissionApiService submissions;
        private OAuthTransport http;
        private final PrivateKeys keys = new PrivateKeys();
        private TokenExchange tokens;
        private ResourceExchange resources;
        private Sender sender;
        private Receiver receiver;
        private java.nio.file.Path senderWorkspace;

        TokenSession(
                DefaultOAuthApiService provider,
                OAuthTransport http,
                TokenExchange tokens,
                ResourceExchange resources) {
            current = provider;
            this.http = http;
            this.tokens = tokens;
            this.resources = resources;
            destinations =
                    new DestinationApiService(
                            provider, http, "https://test.fit-connect.fitko.dev/destination-api");
            submissions =
                    new SubmissionApiService(
                            provider, http, "https://test.fit-connect.fitko.dev/submission-api");
        }

        private void requireOpen() {
            if (current == null) throw new SessionException("session_missing");
        }

        private static UUID destinationId(String id) {
            try {
                return UUID.fromString(id);
            } catch (RuntimeException e) {
                throw new SessionException("invalid_input");
            }
        }

        private static void page(int offset, int limit) {
            if (offset < 0 || limit < 1 || limit > 100) throw new SessionException("invalid_input");
        }

        public String destinations(int offset, int limit) {
            requireOpen();
            page(offset, limit);
            return http.json(destinations.listDestinations(offset, limit));
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

        public String destination(String id) {
            requireOpen();
            return http.json(submissions.getDestination(destinationId(id)));
        }

        public String ownDestination(String destinationId) {
            requireOpen();
            return http.json(
                    new dev.fitko.fitconnect.core.destination.DestinationApiService(
                                    current,
                                    http,
                                    "https://test.fit-connect.fitko.dev/destination-api")
                            .getDestination(UUID.fromString(destinationId)));
        }

        public String destinationKeys(String id, int offset, int limit) {
            requireOpen();
            page(offset, limit);
            return http.json(destinations.listKeys(destinationId(id), offset, limit));
        }

        public SubmissionPage submissions(String id, int offset, int limit) {
            requireOpen();
            page(offset, limit);
            var result =
                    submissions.pollAvailableSubmissionsForDestination(
                            destinationId(id), offset, limit);
            if (result == null
                    || result.getSubmissions() == null
                    || result.getCount() == null
                    || result.getOffset() == null
                    || result.getTotalCount() == null
                    || result.getOffset() != offset
                    || result.getCount() != result.getSubmissions().size()
                    || result.getSubmissions().size() > limit)
                throw new SessionException("invalid_resource");
            return new SubmissionPage(
                    result.getOffset(),
                    result.getTotalCount(),
                    result.getSubmissions().stream()
                            .map(
                                    item ->
                                            new SubmissionPage.Entry(
                                                    item.getDestinationId(),
                                                    item.getSubmissionId(),
                                                    item.getCaseId()))
                            .toList());
        }

        public ReplyPage replies(int offset, int limit) {
            requireOpen();
            if (offset < 0 || offset > 10000 || limit < 1 || limit > 100)
                throw new SessionException("invalid_input");
            var result =
                    new dev.fitko.fitconnect.core.reply.ReplyApiService(
                                    current,
                                    http,
                                    "https://test.fit-connect.fitko.dev/submission-api")
                            .getAvailableReplies(limit, offset);
            if (result == null
                    || result.getReplies() == null
                    || result.getCount() == null
                    || result.getOffset() == null
                    || result.getTotalCount() == null
                    || result.getOffset() != offset
                    || result.getCount() != result.getReplies().size()
                    || result.getReplies().size() > limit
                    || result.getReplies().stream().anyMatch(java.util.Objects::isNull)
                    || result.getReplies().size() < limit
                            && offset + result.getReplies().size() < result.getTotalCount())
                throw new SessionException("invalid_resource");
            return new ReplyPage(
                    result.getOffset(),
                    result.getTotalCount(),
                    result.getReplies().stream()
                            .map(item -> new ReplyPage.Entry(item.getReplyId(), item.getCaseId()))
                            .toList());
        }

        public SubmissionInfo submission(String id) {
            requireOpen();
            var result = submissions.getSubmission(destinationId(id));
            if (result == null || !destinationId(id).equals(result.getSubmissionId()))
                throw new SessionException("invalid_resource");
            var service = result.getPublicService();
            return new SubmissionInfo(
                    result.getDestinationId(),
                    null,
                    result.getSubmissionId(),
                    result.getCaseId(),
                    result.getAttachments(),
                    service == null ? null : service.getIdentifier(),
                    service == null ? null : service.getName(),
                    result.getRegion(),
                    null,
                    null,
                    result.getEncryptedMetadata() != null
                            && !result.getEncryptedMetadata().isBlank(),
                    result.getEncryptedData() != null && !result.getEncryptedData().isBlank());
        }

        public KeyReference importKey(
                String id, String purpose, String document, List<String> eligiblePublicJwks) {
            requireOpen();
            receiver = null;
            destinationId(id);
            return keys.add(id, purpose, document, eligiblePublicJwks);
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
            return ReceiptSigner.sign(current, key, request, evidence, workspace);
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
            new dev.fitko.fitconnect.core.cases.CaseApiService(
                            current,
                            new ReceiptTransport(authorized),
                            null,
                            "https://test.fit-connect.fitko.dev/submission-api")
                    .sendEvent(value.caseId(), value.jwt());
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
            destination = destinationId(destination).toString();
            destinationId(submission);
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
                                                            && item.caseId()
                                                                    .equals(request.caseId())
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
                    replyRecipient(
                            input.destinationId().toString(), input.submissionId().toString());
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

        public SendResult send(
                SubmissionInput input, java.nio.file.Path workspace, UUID attemptId) {
            requireOpen();
            if (attemptId == null) throw new SessionException("invalid_input");
            if (workspace == null || input == null)
                throw new SessionException("invalid_submission");
            ensureSender(workspace);
            return sender.send(input, attemptId);
        }

        public void check() {
            if (current == null) throw new SessionException("session_missing");
            var token = current.getCurrentToken();
            if (token == null
                    || token.getAccessToken() == null
                    || token.getAccessToken().isBlank()
                    || token.getExpiresIn() == null
                    || token.getExpiresIn() <= 0
                    || token.getError() != null)
                throw new SessionException("authentication_failed");
        }

        public void close() {
            if (sender != null) sender.replyKeys.clear();
            keys.clear();
            current = null;
            destinations = null;
            submissions = null;
            http = null;
            receiver = null;
            sender = null;
            senderWorkspace = null;
            tokens = null;
            resources = null;
        }
    }
}
