package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.rest.client.services.auth.*;
import dev.fitko.fitconnect.rest.client.services.submission.impl.ReplyApiClient;
import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.model.event.authtags.AuthenticationTags;
import org.fitconnect.integration.contract.*;
import java.nio.file.Path;
import java.util.*;

/** SDK4 reply receive using the selected case-bound native ephemeral key. */
final class ReplyReceiver {
    static ReceivedReplyContent receive(AuthorizationHeaderProvider auth, ReplyKeys keys, UUID caseId, UUID replyId,
            ReplySource source, Path workspace, Map<String,String> schemas) {
        try {
            var http = new ReceiverTransport(source, schemas);
            var envelope = new ReplyApiClient(new RequestHeaders(auth), http, new ConcurrencyLimiter(1),
                    "https://test.fit-connect.fitko.dev/submission-api").getReply(replyId);
            if (envelope == null || !replyId.equals(envelope.replyId()) || !caseId.equals(envelope.caseId()))
                throw new SessionException("verification_failed");
            var selected = keys.select(caseId, envelope.encryptedMetadata());
            var captured = new AuthenticationTags[1];
            var services = Receiver.compose(auth, List.of(), selected.reference().fromDestinationId().toString(), source, workspace, schemas,
                    dev.fitko.fitconnect.sdk.api.crypto.ReplyKeys.of(Map.of(caseId, selected.privateKey())), tags -> {
                        if (captured[0] != null) throw new SessionException("verification_failed");
                        captured[0] = tags;
                    });
            var result = services.receiver().openReply(replyId);
            if (services.http().schemaFailed()) throw new SessionException(services.http().schemaFailureCode);
            if (!replyId.equals(result.id()) || !caseId.equals(result.caseId()) || !result.report().acceptable() || captured[0] == null)
                throw new SessionException("verification_failed");
            selected.check(result.getDataSchemaUri(), result.getDataMimeType());
            var tags = captured[0];
            source.verifyAuthenticationTags(caseId, replyId, tags.metadata(), tags.data(), tags.attachments());
            var attachments = new ArrayList<ReceivedContent.Attachment>();
            for (var item : result.getAttachments()) try (var stream = item.openStream()) {
                attachments.add(new ReceivedContent.Attachment(item.getAttachmentId(), item.getFileName(), item.getMimeType(),
                        item.getDescription(), stream.readNBytes(32 * 1024 * 1024 + 1)));
            }
            var issues = new ArrayList<ReceivedContent.Issue>();
            for (var issue : result.report().issues()) issues.add(new ReceivedContent.Issue(issue.stage().name(), issue.isError()));
            issues.add(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false));
            return new ReceivedReplyContent(replyId, caseId, result.senderDestinationId(), selected.reference().attemptId(), services.crypto().metadata(),
                    result.getDataAsByteArray(), result.getDataMimeType(), attachments, issues,
                    new ReplyReceiptEvidence(caseId, replyId, selected.reference().attemptId(), tags.metadata(), tags.data(), tags.attachments()), services.http().validation.snapshot(result.getDataSchemaUri().toString()));
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("verification_failed"); }
    }
}
