package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.sdk.FitConnectSdk;
import dev.fitko.fitconnect.sdk.api.*;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider;
import dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment;
import dev.fitko.fitconnect.rest.model.submission.SentSubmission;
import org.fitconnect.integration.contract.*;
import java.nio.file.Path;
import java.util.*;

/** Pinned SDK4 sender. No SDK default HTTP client or global temporary storage is used. */
final class Sender {
    private final FitConnectSdk sdk;
    private final SenderTransport http;
    final ReplyKeys replyKeys = new ReplyKeys();
    private final Map<UUID, SentSubmission> sent = new LinkedHashMap<>();

    Sender(String encodedClientId, String encodedSecret, TokenExchange tokens, ResourceExchange resources, Path workspace) {
        http = new SenderTransport(tokens, resources);
        sdk = FitConnectSdk.fromConfigBuilder().environment(FitConnectEnvironment.TEST)
                .credentials(encodedClientId, encodedSecret)
                .settings(SdkSettings.builder().concurrentAttachmentStreams(1)
                        .attachmentChunkingConfig(dev.fitko.fitconnect.sdk.config.settings.AttachmentChunkingConfig.builder()
                                .attachmentStoragePath(workspace).chunkAllAttachments(true).chunkSizeInMB(4).build()).build())
                .customization().withCustomHttpService(http)
                .withCustomStorageProvider(new FileSystemStorageProvider(workspace.toString())).build();
    }

    SendResult send(SubmissionInput input, UUID attemptId) {
        if (input.fromDestinationId() == null || sent.size() >= 32) throw new SessionException("invalid_submission");
        Addressing address = input.processMessage() == null
                ? Addressing.toService(input.serviceIdentifier(), input.serviceName(), input.region())
                : Addressing.toProcessMessage(input.processMessage().processModelId(), input.processMessage().messageId(), input.region());
        var request = OutgoingSubmission.to(Participant.of(input.destinationId(), address));
        if (input.caseId() != null) request.inCase(input.caseId());
        else request.openingCase(input.serviceIdentifier(), input.serviceName());
        var outgoing = request.setData("application/json".equals(input.mimeType())
                ? SubmissionData.json(input.data(), input.schemaUri()) : SubmissionData.xml(input.data(), input.schemaUri()));
        if (input.replyOffer() != null) outgoing.setReplyChannel(ReplyChannels.fitConnect(replyKeys.offer(attemptId, input),
                List.of(new dev.fitko.fitconnect.rest.model.metadata.v2.DataSetSchema(input.replyOffer().schemaUri().toString(), input.replyOffer().mimeType()))));
        for (var item : input.attachments()) outgoing.addAttachment(Attachment.builder().fromBytes(item.data())
                .fileName(item.fileName()).mimeType(item.mimeType()).description(item.description()).build());
        // The SDK verifies the acting destination type before sending.
        var source = http.get("https://test.fit-connect.fitko.dev/submission-api/v3/destinations/" + input.fromDestinationId(),
                Map.of(), dev.fitko.fitconnect.rest.model.destination.PublicDestination.class).body();
        if (source == null || !input.fromDestinationId().equals(source.destinationId()) || source.type() == null)
            throw new SessionException("invalid_submission");
        SentSubmission result = source.type() == dev.fitko.fitconnect.rest.model.destination.DestinationType.ONLINE_SERVICE
                ? sdk.onlineService(input.fromDestinationId()).send(outgoing.build())
                : sdk.organisation(input.fromDestinationId()).send(outgoing.build());
        if (result == null || result.submissionId() == null || result.caseId() == null
                || !input.destinationId().equals(result.destinationId()) || !input.fromDestinationId().equals(result.fromDestinationId()))
            throw new SessionException("resource_unavailable");
        sent.put(result.submissionId(), result);
        return new SendResult(result.destinationId(), result.fromDestinationId(), result.submissionId(), result.caseId());
    }
    ReplyResult sendReply(ReplyRecipient recipient, ReplyInput input) {
        recipient.check(input);
        try {
            var outgoing = OutgoingReply.answering(recipient.caseId(), com.nimbusds.jose.jwk.JWK.parse(recipient.publicJwk()))
                    .setData("application/json".equals(input.mimeType()) ? SubmissionData.json(input.data(), input.schemaUri())
                            : SubmissionData.xml(input.data(), input.schemaUri()));
            if (input.processMessage() != null) outgoing.forProcessMessage(input.processMessage().processModelId(), input.processMessage().messageId());
            for (var item : input.attachments()) outgoing.addAttachment(Attachment.builder().fromBytes(item.data())
                    .fileName(item.fileName()).mimeType(item.mimeType()).description(item.description()).build());
            var result = sdk.organisation(recipient.destinationId()).send(outgoing.build());
            if (result == null || !recipient.caseId().equals(result.caseId()) || !recipient.destinationId().equals(result.fromDestinationId()))
                throw new SessionException("invalid_resource");
            return new ReplyResult(result.replyId(), result.caseId(), result.fromDestinationId());
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("resource_unavailable"); }
    }
}
