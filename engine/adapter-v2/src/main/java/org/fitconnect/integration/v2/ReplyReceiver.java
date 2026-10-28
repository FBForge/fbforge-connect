package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.domain.model.event.authtags.ValidatedAuthenticationTags;
import dev.fitko.fitconnect.client.attachments.download.ReplyAttachmentDownloader;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK3 reply receive. No destination private-key import, signing key or writable HTTP. */
final class ReplyReceiver {
    static ReceivedReplyContent receive(
            DefaultOAuthApiService auth,
            ReplyKeys keys,
            UUID caseId,
            UUID replyId,
            ReplySource source,
            Path workspace,
            Map<String, String> schemas) {
        var transport = new ReceiverTransport(source, schemas);
        try {
            var captured = new ValidatedAuthenticationTags[1];
            var crypto = new ReceiveCrypto();
            var sdk =
                    new SdkServices(
                            auth,
                            transport,
                            workspace,
                            crypto,
                            tags -> {
                                if (captured[0] != null)
                                    throw new SessionException("verification_failed");
                                captured[0] = tags;
                            });
            if (sdk.config.isAutoRejectEnabled()) throw new SessionException("endpoint_blocked");
            var envelope = sdk.service.getReply(replyId);
            if (envelope == null
                    || !replyId.equals(envelope.getReplyId())
                    || !caseId.equals(envelope.getCaseId()))
                throw new SessionException("verification_failed");
            var selected = keys.select(caseId, envelope.getEncryptedMetadata());
            var receiver =
                    new dev.fitko.fitconnect.client.sender.ReplyReceiver(
                            sdk.config,
                            sdk.service,
                            new ReplyAttachmentDownloader(sdk.config, sdk.service, sdk.payloads));
            var result = receiver.receiveReply(replyId, selected.privateKey());
            if (!replyId.equals(result.getReplyId())
                    || !caseId.equals(result.getCaseId())
                    || captured[0] == null
                    || !captured[0].isValid()
                    || captured[0].getAuthenticationTags() == null)
                throw new SessionException("verification_failed");
            selected.check(result.getDataSchemaUri(), result.getDataMimeType());
            var tags = captured[0].getAuthenticationTags();
            source.verifyAuthenticationTags(
                    caseId, replyId, tags.getMetadata(), tags.getData(), tags.getAttachments());
            var attachments = new ArrayList<ReceivedContent.Attachment>();
            for (var item : result.getAttachments())
                try (var stream = item.getDataAsInputStream()) {
                    attachments.add(
                            new ReceivedContent.Attachment(
                                    item.getAttachmentId(),
                                    item.getFileName(),
                                    item.getMimeType(),
                                    item.getDescription(),
                                    stream.readNBytes(32 * 1024 * 1024 + 1)));
                }
            var issues = new ArrayList<ReceivedContent.Issue>();
            issues.add(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false));
            issues.addAll(0, transport.validation.reviewIssues());
            var content =
                    new ReceivedReplyContent(
                            replyId,
                            caseId,
                            null,
                            selected.reference().attemptId(),
                            crypto.metadata(),
                            result.getDataAsByteArray(),
                            result.getDataMimeType(),
                            attachments,
                            issues,
                            new ReplyReceiptEvidence(
                                    caseId,
                                    replyId,
                                    selected.reference().attemptId(),
                                    tags.getMetadata(),
                                    tags.getData(),
                                    tags.getAttachments()),
                            transport.validation.snapshot(result.getDataSchemaUri().toString()));
            keys.recover(selected, caseId);
            return content;
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException(
                    transport.schemaFailed() ? transport.schemaFailureCode : "verification_failed");
        }
    }
}
