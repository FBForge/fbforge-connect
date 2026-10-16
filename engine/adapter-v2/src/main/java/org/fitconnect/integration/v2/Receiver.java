package org.fitconnect.integration.v2;

import com.nimbusds.jose.jwk.RSAKey;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.client.subscriber.SubmissionReceiver;
import dev.fitko.fitconnect.client.attachments.download.SubmissionAttachmentDownloader;
import dev.fitko.fitconnect.api.domain.model.event.authtags.ValidatedAuthenticationTags;
import org.fitconnect.integration.contract.*;
import java.nio.file.Path;
import java.util.*;

/** SDK3 receive with auto-rejection disabled and no signing key or writable HTTP transport. */
final class Receiver {
    private ReceiptEvidence evidence;
    private ReplyRecipient replyRecipient;
    private String replyFailure = "reply_channel_missing";
    ReceivedContent receive(DefaultOAuthApiService auth, List<RSAKey> keys, String destination, String submission,
            ResourceExchange read, Path workspace, Map<String,String> schemas) {
        evidence = null; replyRecipient = null; replyFailure = "reply_channel_missing";
        var transport = new ReceiverTransport(read, schemas);
        try {
            var crypto = new ReceiveCrypto();
            var captured = new ValidatedAuthenticationTags[1];
            var sdk = new SdkServices(auth, transport, workspace, crypto, result -> {
                if (captured[0] != null) throw new SessionException("verification_failed");
                captured[0] = result;
            });
            if (sdk.config.isAutoRejectEnabled()) throw new SessionException("endpoint_blocked");
            var receiver = new SubmissionReceiver(sdk.service, keys, sdk.config,
                    new SubmissionAttachmentDownloader(sdk.config, sdk.service, sdk.payloads));
            var result = receiver.receiveSubmission(UUID.fromString(submission));
            if (!UUID.fromString(destination).equals(result.getDestinationId()) || !UUID.fromString(submission).equals(result.getSubmissionId()))
                throw new SessionException("invalid_resource");
            var attachments = new ArrayList<ReceivedContent.Attachment>();
            for (var attachment : result.getAttachments()) {
                try (var stream = attachment.getDataAsInputStream()) {
                    attachments.add(new ReceivedContent.Attachment(attachment.getAttachmentId(), attachment.getFileName(), attachment.getMimeType(),
                            attachment.getDescription(), stream.readNBytes(32 * 1024 * 1024 + 1)));
                }
            }
            var issues = new ArrayList<ReceivedContent.Issue>();
            issues.add(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false));
            var content = new ReceivedContent(result.getDestinationId(), result.getSubmissionId(), result.getCaseId(), crypto.metadata(),
                    result.getDataAsBytes(), result.getDataMimeType(), attachments, issues, transport.validation.snapshot(result.getDataSchemaUri().toString()));
            if (captured[0] == null || !captured[0].isValid() || captured[0].getAuthenticationTags() == null)
                throw new SessionException("verification_failed");
            var tags = captured[0].getAuthenticationTags();
            evidence = new ReceiptEvidence(result.getDestinationId(), result.getSubmissionId(), result.getCaseId(),
                    tags.getMetadata(), tags.getData(), tags.getAttachments());
            // An unusable optional answer channel must not invalidate otherwise verified content.
            try {
                var channel = result.getMetadata().getReplyChannel();
                if (channel != null && channel.isFitConnect()) {
                    var fit = channel.getFitConnect();
                    var key = fit.getEncryptionPublicKey().toJwk();
                    checkReplyKey(key);
                    if (fit.getProcessStandards() == null || fit.getProcessStandards().isEmpty() || fit.getProcessStandards().size() > 64)
                        throw new SessionException("verification_failed");
                    var schemasOffered = fit.getProcessStandards().stream()
                            .map(uri -> new ReplyRecipient.Schema(java.net.URI.create(uri), null)).toList();
                    replyRecipient = new ReplyRecipient(result.getDestinationId(), result.getSubmissionId(), result.getCaseId(),
                            null, key.toJSONString(), schemasOffered);
                }
            } catch (Exception failure) { replyFailure = "verification_failed"; }
            return content;
        } catch (Exception failure) {
            if (transport.readFailure() != null) throw transport.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException(transport.schemaFailed() ? transport.schemaFailureCode : "verification_failed");
        }
    }
    ReceiptEvidence evidence(String destination, String submission) {
        if (evidence == null || !evidence.destinationId().toString().equals(destination) || !evidence.submissionId().toString().equals(submission))
            throw new SessionException("verification_failed");
        return evidence;
    }
    ReplyRecipient replyRecipient(String destination, String submission) {
        evidence(destination, submission);
        if (replyRecipient == null) throw new SessionException(replyFailure);
        return replyRecipient;
    }
    private static void checkReplyKey(com.nimbusds.jose.jwk.JWK key) {
        if (!(key instanceof RSAKey rsa) || key.isPrivate() || rsa.size() < 4096 || rsa.size() > 8192
                || key.getKeyID() == null || key.getKeyID().isBlank() || key.getKeyID().length() > 512
                || key.getAlgorithm() == null || !"RSA-OAEP-256".equals(key.getAlgorithm().getName())
                || !Set.of(com.nimbusds.jose.jwk.KeyOperation.WRAP_KEY).equals(key.getKeyOperations()))
            throw new SessionException("verification_failed");
    }
}
