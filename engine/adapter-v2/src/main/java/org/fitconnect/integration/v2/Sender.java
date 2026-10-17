package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.config.defaults.MetadataVersion;
import dev.fitko.fitconnect.api.domain.model.attachment.Attachment;
import dev.fitko.fitconnect.api.domain.model.submission.SentSubmission;
import dev.fitko.fitconnect.api.domain.sender.SendableSubmission;
import dev.fitko.fitconnect.client.attachments.upload.SubmissionAttachmentUploader;
import dev.fitko.fitconnect.client.sender.SubmissionSender;
import dev.fitko.fitconnect.client.util.SubmissionValidator;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.crypto.HashService;
import dev.fitko.fitconnect.core.crypto.JWECryptoService;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK3 public service composition, matching ClientFactory with an injected native HTTP client. */
final class Sender {
    private final SubmissionSender sender;
    private final dev.fitko.fitconnect.client.subscriber.ReplySender replies;
    private final dev.fitko.fitconnect.core.FitConnectDefaultService service;
    final ReplyKeys replyKeys = new ReplyKeys();
    private final Map<UUID, SentSubmission> sent = new LinkedHashMap<>();

    Sender(
            DefaultOAuthApiService auth,
            TokenExchange tokens,
            ResourceExchange resources,
            Path workspace) {
        var sdk =
                new SdkServices(
                        auth,
                        new SenderTransport(tokens, resources),
                        workspace,
                        new JWECryptoService(new HashService()));
        service = sdk.service;
        sender =
                new SubmissionSender(
                        sdk.config,
                        sdk.service,
                        new SubmissionValidator(sdk.service),
                        sdk.payloads,
                        new SubmissionAttachmentUploader(sdk.service));
        replies =
                new dev.fitko.fitconnect.client.subscriber.ReplySender(
                        sdk.config,
                        sdk.service,
                        new SubmissionValidator(sdk.service),
                        sdk.payloads,
                        new dev.fitko.fitconnect.client.attachments.upload.ReplyAttachmentUploader(
                                sdk.service));
    }

    ReplyResult sendReply(ReplyRecipient recipient, ReplyInput input) {
        recipient.check(input);
        if (input.processMessage() != null) throw new SessionException("invalid_submission");
        try {
            var replyCase = service.getCase(recipient.caseId());
            if (replyCase == null
                    || !recipient.caseId().equals(replyCase.getCaseId())
                    || !recipient.destinationId().equals(replyCase.getDestinationId()))
                throw new SessionException("invalid_resource");
            var destination = service.getPublicDestination(replyCase.getDestinationId());
            if (destination == null
                    || !recipient.destinationId().equals(destination.getDestinationId()))
                throw new SessionException("invalid_resource");
            // Unlike submissions, SDK3 replies use this version verbatim without negotiation.
            var metadataVersion =
                    destination.getMetadataVersions().contains("2.1.0")
                            ? MetadataVersion.V2_1_0
                            : MetadataVersion.V2_0_0;
            var step =
                    dev.fitko.fitconnect.api.domain.subscriber.SendableReply.forCase(
                                    recipient.caseId())
                            .setReplyEncryptionKey(
                                    com.nimbusds.jose.jwk.JWK.parse(recipient.publicJwk()))
                            .setMetadataVersion(metadataVersion);
            var outgoing =
                    "application/json".equals(input.mimeType())
                            ? step.setJsonData(input.data(), input.schemaUri())
                            : step.setXmlData(input.data(), input.schemaUri());
            for (var item : input.attachments())
                outgoing.addAttachment(
                        Attachment.fromByteArray(
                                item.data(), item.mimeType(), item.fileName(), item.description()));
            var result = replies.sendReply(outgoing.build());
            if (result == null || !recipient.caseId().equals(result.getCaseId()))
                throw new SessionException("invalid_resource");
            return new ReplyResult(result.getReplyId(), result.getCaseId(), null);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("resource_unavailable");
        }
    }

    SendResult send(SubmissionInput input, UUID attemptId) {
        if (input.fromDestinationId() != null
                || input.processMessage() != null
                || sent.size() >= 32) throw new SessionException("invalid_submission");
        var step =
                SendableSubmission.Builder()
                        .setDestination(input.destinationId())
                        .setServiceTypeWithRegion(
                                input.serviceIdentifier(), input.serviceName(), input.region());
        var request =
                "application/json".equals(input.mimeType())
                        ? step.setJsonData(input.data(), input.schemaUri())
                        : step.setXmlData(input.data(), input.schemaUri());
        request.preferMetadataVersion(MetadataVersion.V2);
        if (input.replyOffer() != null)
            request.setReplyChannel(
                    dev.fitko.fitconnect.api.domain.model.reply.replychannel.ReplyChannel
                            .ofFitConnect(
                                    replyKeys.offer(attemptId, input),
                                    List.of(input.replyOffer().schemaUri().toString())));
        if (input.caseId() != null) request.setCase(input.caseId());
        for (var item : input.attachments())
            request.addAttachment(
                    Attachment.fromByteArray(
                            item.data(), item.mimeType(), item.fileName(), item.description()));
        SentSubmission result = sender.sendSubmission(request.build());
        if (result == null
                || result.getSubmissionId() == null
                || result.getCaseId() == null
                || !input.destinationId().equals(result.getDestinationId()))
            throw new SessionException("resource_unavailable");
        sent.put(result.getSubmissionId(), result);
        return new SendResult(
                result.getDestinationId(), null, result.getSubmissionId(), result.getCaseId());
    }
}
