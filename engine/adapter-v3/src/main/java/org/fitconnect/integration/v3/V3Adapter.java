package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.sdk.FitConnectSdk;
import dev.fitko.fitconnect.sdk.api.OutgoingSubmission;
import dev.fitko.fitconnect.sdk.api.OutgoingReply;
import dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveReport;
import org.fitconnect.integration.contract.ProbeResult;
import org.fitconnect.integration.contract.SdkAdapter;
import org.fitconnect.integration.contract.*;
import dev.fitko.fitconnect.rest.client.services.auth.OAuthProvider;
import dev.fitko.fitconnect.rest.client.services.auth.ClientCredentials;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders;
import dev.fitko.fitconnect.rest.client.services.destination.impl.DestinationApiClient;
import dev.fitko.fitconnect.rest.client.services.submission.impl.SubmissionApiClient;

public final class V3Adapter implements SdkAdapter {
    public ProbeResult probe() {
        FitConnectSdk.fromConfigBuilder();
        OutgoingSubmission.class.getDeclaredMethods();
        OutgoingReply.class.getDeclaredMethods();
        ReceiveReport.class.getDeclaredMethods();
        boolean isolated = FitConnectSdk.class.getClassLoader() == getClass().getClassLoader()
                && dependencyClass().getClassLoader() == getClass().getClassLoader();
        return new ProbeResult("v3", "4.0.0-rc.2", "TEST", FitConnectSdk.class.getName(), isolated);
    }
    public Class<?> dependencyClass() { return com.networknt.schema.SchemaRegistry.class; }

    public AuthenticatedSession openSession(String clientId, String clientSecret, TokenExchange transport, ResourceExchange resources) {
        // OAuthProvider is an internal SDK API, deliberately confined to the pinned RC2 adapter.
        // RC2 uses UrlBuilder.add(), which does not encode form values. Encode exactly once here.
        var http = new OAuthTransport(transport, resources);
        String encodedId = URLEncoder.encode(clientId, StandardCharsets.UTF_8);
        String encodedSecret = URLEncoder.encode(clientSecret, StandardCharsets.UTF_8);
        var provider = new OAuthProvider(http, new ClientCredentials(encodedId, encodedSecret),
                TestTokenTransport.ENDPOINT);
        return new TokenSession(provider, http, transport, resources);
    }
    private static final class TokenSession implements AuthenticatedSession {
        private OAuthProvider current;
        private OAuthTransport http;
        private final PrivateKeys keys = new PrivateKeys();
        private TokenExchange tokens;
        private ResourceExchange resources;
        private Sender sender;
        private Receiver receiver;
        private java.nio.file.Path senderWorkspace;
        TokenSession(OAuthProvider provider, OAuthTransport http, TokenExchange tokens, ResourceExchange resources) {
            current = provider; this.http = http;
            this.tokens = tokens; this.resources = resources;
        }
        private void requireOpen() { if (current == null) throw new SessionException("session_missing"); }
        private DestinationApiClient destinationsApi() {
            requireOpen();
            return new DestinationApiClient(new RequestHeaders(current), http,
                    "https://test.fit-connect.fitko.dev/destination-api");
        }
        public String destinations(int offset, int limit) {
            return http.json(destinationsApi().listDestinations(offset, limit));
        }
        @Override public String publicSchema(String uri) { requireOpen(); return new SchemaValidation(Map.of(), true).examplePackage(uri); }
        public String destination(String destinationId) {
            requireOpen();
            return http.json(new SubmissionApiClient(RequestHeaders.withoutCredentials(), http,
                    new ConcurrencyLimiter(1), "https://test.fit-connect.fitko.dev/submission-api")
                    .getDestination(UUID.fromString(destinationId)));
        }
        public String destinationKeys(String destinationId, int offset, int limit) {
            return http.json(destinationsApi().listKeys(UUID.fromString(destinationId), offset, limit));
        }
        private SubmissionApiClient submissionsApi() {
            requireOpen();
            return new SubmissionApiClient(new RequestHeaders(current), http, new ConcurrencyLimiter(1),
                    "https://test.fit-connect.fitko.dev/submission-api");
        }
        public SubmissionPage submissions(String id, int offset, int limit) {
            if (offset < 0 || limit < 1 || limit > 100) throw new SessionException("invalid_input");
            var result = submissionsApi().getAvailableSubmissions(UUID.fromString(id), offset, limit);
            if (result == null || result.submissions() == null || result.count() == null || result.offset() == null
                    || result.totalCount() == null || result.offset() != offset || result.count() != result.submissions().size()
                    || result.submissions().size() > limit) throw new SessionException("invalid_resource");
            return new SubmissionPage(result.offset(), result.totalCount(), result.submissions().stream()
                    .map(item -> new SubmissionPage.Entry(item.destinationId(), item.submissionId(), item.caseId())).toList());
        }
        public ReplyPage replies(int offset, int limit) {
            requireOpen();
            if (offset < 0 || offset > 10000 || limit < 1 || limit > 100) throw new SessionException("invalid_input");
            var result = new dev.fitko.fitconnect.rest.client.services.submission.impl.ReplyApiClient(new RequestHeaders(current), http,
                    new ConcurrencyLimiter(1), "https://test.fit-connect.fitko.dev/submission-api").getAvailableReplies(null, offset, limit);
            if (result == null || result.replies() == null || result.count() == null || result.offset() == null
                    || result.totalCount() == null || result.offset() != offset || result.count() != result.replies().size()
                    || result.replies().size() > limit || result.replies().stream().anyMatch(java.util.Objects::isNull)
                    || result.replies().size() < limit && offset + result.replies().size() < result.totalCount())
                throw new SessionException("invalid_resource");
            return new ReplyPage(result.offset(), result.totalCount(), result.replies().stream()
                    .map(item -> new ReplyPage.Entry(item.replyId(), item.caseId())).toList());
        }
        public SubmissionInfo submission(String id) {
            var result = submissionsApi().getSubmission(UUID.fromString(id));
            if (result == null || !UUID.fromString(id).equals(result.submissionId())) throw new SessionException("invalid_resource");
            var service = result.publicService(); var process = result.processMessage();
            return new SubmissionInfo(result.destinationId(), result.fromDestinationId(), result.submissionId(), result.caseId(), result.attachments(),
                    service == null ? null : service.identifier(), service == null ? null : service.name(), result.region(),
                    process == null ? null : process.processModelId(), process == null ? null : process.messageId(),
                    result.encryptedMetadata() != null && !result.encryptedMetadata().isBlank(),
                    result.encryptedData() != null && !result.encryptedData().isBlank());
        }
        public KeyReference importKey(String destinationId, String purpose, String document, List<String> eligiblePublicJwks) {
            requireOpen(); receiver = null;
            return keys.importKey(destinationId, purpose, document, eligiblePublicJwks);
        }
        public List<KeyReference> loadedKeys() { requireOpen(); return keys.references(); }
        public void retainKeys(String id, List<String> registrations) {
            requireOpen(); var before = keys.references();
            try { keys.retainRegistered(id, registrations); }
            catch (RuntimeException failure) { receiver = null; throw failure; }
            if (!before.equals(keys.references())) receiver = null;
        }
        public void discardReceived() { requireOpen(); receiver = null; }
        public ReceiptEvidence receiptEvidence(String destination, String submission) {
            requireOpen();
            if (receiver == null) throw new SessionException("verification_failed");
            return receiver.evidence(destination, submission);
        }
        public SignedReceipt signReceipt(ReceiptRequest request, java.nio.file.Path workspace) {
            requireOpen();
            if (request == null || workspace == null) throw new SessionException("invalid_input");
            var key = keys.signingKey(request.destinationId().toString(), request.signingKid());
            var evidence = request.action().equals("accept") ? receiptEvidence(request.destinationId().toString(), request.submissionId().toString()) : null;
            return ReceiptSigner.sign(key, request, evidence, workspace);
        }
        public void sendReceipt(SignedReceipt value, ResourceExchange authorized) {
            requireOpen();
            if (value == null || authorized == null) throw new SessionException("invalid_input");
            var key = keys.signingKey(value.destinationId().toString(), value.signingKid());
            ReceiptSigner.validate(value, key);
            if (value.action().equals("accept")) {
                var evidence = receiptEvidence(value.destinationId().toString(), value.submissionId().toString());
                if (!value.caseId().equals(evidence.caseId())) throw new SessionException("verification_failed");
            }
            new dev.fitko.fitconnect.rest.client.services.submission.impl.CaseApiClient(new RequestHeaders(current), new ReceiptTransport(authorized),
                    "https://test.fit-connect.fitko.dev/submission-api").sendSubmissionEvent(value.caseId(), value.jwt());
        }
        public VerifiedEventLog eventLog(UUID destinationId, UUID caseId, UUID submissionId, EventLogSource source, java.nio.file.Path workspace) {
            requireOpen();
            return EventLogs.read(current, destinationId, caseId, submissionId, source, workspace);
        }
        public void discardKeys() { requireOpen(); keys.clear(); receiver = null; }
        public ReceivedContent receive(String destination, String submission, ResourceExchange read, java.nio.file.Path workspace,
                java.util.Map<String,String> schemas) {
            requireOpen(); receiver = null;
            destination = UUID.fromString(destination).toString(); UUID.fromString(submission);
            var selected = keys.decryptionKeys(destination);
            if (selected.isEmpty()) throw new SessionException("key_rejected");
            var candidate = new Receiver();
            var result = candidate.receive(current, selected, destination, submission, read, workspace, schemas);
            receiver = candidate;
            return result;
        }
        public ReceivedReplyContent receiveReply(UUID caseId, UUID replyId, ReplySource read, java.nio.file.Path workspace,
                java.util.Map<String,String> schemas) {
            requireOpen(); receiver = null;
            if (caseId == null || replyId == null || read == null || workspace == null || schemas == null)
                throw new SessionException("invalid_input");
            if (sender == null || !sender.replyKeys.hasBoundCase(caseId)) throw new SessionException("key_rejected");
            return ReplyReceiver.receive(current, sender.replyKeys, caseId, replyId, read, workspace, schemas);
        }
        public PreparedReplyReceipt prepareReplyReceipt(ReplyReceiptRequest request, ReplyReceiptEvidence evidence) {
            requireOpen();
            if (request == null) throw new SessionException("invalid_input");
            if (request.action().equals("accept") && (evidence == null || sender == null
                    || sender.replyKeys.references().stream().noneMatch(item -> item.status().equals("bound")
                        && item.caseId().equals(request.caseId()) && item.attemptId().equals(evidence.channelAttemptId()))))
                throw new SessionException("verification_failed");
            return ReplyReceipts.prepare(request, evidence);
        }
        public UUID sendReplyReceipt(PreparedReplyReceipt prepared, ResourceExchange authorized, java.nio.file.Path workspace) {
            requireOpen();
            if (prepared == null || authorized == null || workspace == null) throw new SessionException("invalid_input");
            if (!prepareReplyReceipt(prepared.request(), prepared.evidence()).equals(prepared)) throw new SessionException("verification_failed");
            return ReplyReceipts.send(current, prepared, authorized, workspace);
        }
        public ReplyRecipient replyRecipient(String destination, String submission) {
            requireOpen();
            if (receiver == null) throw new SessionException("verification_failed");
            return receiver.replyRecipient(destination, submission);
        }
        public ReplyResult sendReply(ReplyInput input, java.nio.file.Path workspace, ResourceExchange authorized) {
            requireOpen();
            if (input == null || workspace == null || authorized == null) throw new SessionException("invalid_input");
            var recipient = replyRecipient(input.destinationId().toString(), input.submissionId().toString());
            recipient.check(input);
            return new Sender(current, tokens, authorized, workspace).sendReply(recipient, input);
        }
        public List<ReplyChannelReference> replyChannels() { requireOpen(); return sender == null ? List.of() : sender.replyKeys.references(); }
        public void completeReplyChannel(UUID attemptId, UUID caseId, UUID submissionId, boolean retain) {
            requireOpen();
            if (sender == null) { if (retain) throw new SessionException("invalid_resource"); return; }
            sender.replyKeys.complete(attemptId, caseId, submissionId, retain);
        }
        public SendResult send(SubmissionInput input, java.nio.file.Path workspace, UUID attemptId) {
            requireOpen();
            if (attemptId == null) throw new SessionException("invalid_input");
            if (workspace == null || input == null) throw new SessionException("invalid_submission");
            if (sender == null) {
                sender = new Sender(current, tokens, resources, workspace);
                senderWorkspace = workspace;
            } else if (!senderWorkspace.equals(workspace)) throw new SessionException("invalid_submission");
            return sender.send(input, attemptId);
        }
        public void check() {
            if (current == null) throw new SessionException("session_missing");
            current.authorizationHeader(); // The token never leaves this adapter.
        }
        public void close() {
            if (sender != null) sender.replyKeys.clear();
            keys.clear(); current = null; http = null; sender = null; senderWorkspace = null;
            receiver = null;
            tokens = null; resources = null;
        }
    }
}
