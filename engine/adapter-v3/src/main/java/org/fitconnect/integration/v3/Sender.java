package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.core.crypto.impl.JWECryptoService;
import dev.fitko.fitconnect.rest.client.services.auth.AuthorizationHeaderProvider;
import dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders;
import dev.fitko.fitconnect.rest.client.services.submission.impl.*;
import dev.fitko.fitconnect.rest.model.submission.SentSubmission;
import dev.fitko.fitconnect.sdk.api.*;
import dev.fitko.fitconnect.sdk.config.credentials.ActingDestination;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import dev.fitko.fitconnect.sdk.schema.SchemaResolver;
import dev.fitko.fitconnect.sdk.services.attachment.impl.AttachmentTransferService;
import dev.fitko.fitconnect.sdk.services.keys.SignatureKeyProvider;
import dev.fitko.fitconnect.sdk.services.transfer.*;
import dev.fitko.fitconnect.sdk.services.validation.ValidationService;
import dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider;
import dev.fitko.fitconnect.sdk.validation.validators.key.PublicKeyValidator;
import dev.fitko.fitconnect.virusscanner.impl.noop.NoOpVirusScanner;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Pinned SDK4 sender. No SDK default HTTP client or global temporary storage is used. */
final class Sender {
    private final AuthorizationHeaderProvider auth;
    private final Path workspace;
    private final SenderTransport http;
    final ReplyKeys replyKeys = new ReplyKeys();
    private final Map<UUID, SentSubmission> sent = new LinkedHashMap<>();

    Sender(
            AuthorizationHeaderProvider auth,
            TokenExchange tokens,
            ResourceExchange resources,
            Path workspace) {
        this.auth = Objects.requireNonNull(auth);
        this.workspace = Objects.requireNonNull(workspace);
        http = new SenderTransport(tokens, resources);
    }

    /**
     * Wire the same pinned SDK transfer services without DestinationFactory's unrelated GET /cases
     * probe. The native SendAccess still verifies the acting destination and gates every write;
     * TEST authorizes the actual announce/finalize requests with the current session token.
     */
    private OutgoingTransferService transfers(UUID destination) {
        var env = SdkEnvironment.current();
        var settings =
                SdkSettings.builder()
                        .concurrentAttachmentStreams(1)
                        .attachmentChunkingConfig(
                                dev.fitko.fitconnect.sdk.config.settings.AttachmentChunkingConfig
                                        .builder()
                                        .attachmentStoragePath(workspace)
                                        .chunkAllAttachments(true)
                                        .chunkSizeInMB(4)
                                        .build())
                        .build();
        var headers = new RequestHeaders(auth);
        var limiter = new ConcurrencyLimiter(1);
        var base = env.submissionApiUrl();
        var submissions = new SubmissionApiClient(headers, http, limiter, base);
        var replies = new ReplyApiClient(headers, http, limiter, base);
        var cases = new CaseApiClient(headers, http, base);
        var crypto = new JWECryptoService();
        var storage = new FileSystemStorageProvider(workspace.toString());
        var validation =
                new ValidationService(
                        settings.validationConfig(),
                        env,
                        new SchemaResolver(settings.validationConfig(), http),
                        new SignatureKeyProvider(http, env),
                        new PublicKeyValidator(settings.httpConfig().proxyConfig()),
                        new NoOpVirusScanner(),
                        storage);
        var context =
                new TransferContext(
                        submissions,
                        replies,
                        cases,
                        crypto,
                        validation,
                        ActingDestination.sendOnly(destination));
        return new OutgoingTransferService(
                context,
                new AttachmentTransferService(settings.attachmentChunkingConfig(), crypto, storage),
                null);
    }

    SendResult send(SubmissionInput input, UUID attemptId) {
        if (input.fromDestinationId() == null || sent.size() >= 32)
            throw new SessionException("invalid_submission");
        Addressing address =
                input.processMessage() == null
                        ? Addressing.toService(
                                input.serviceIdentifier(), input.serviceName(), input.region())
                        : Addressing.toProcessMessage(
                                input.processMessage().processModelId(),
                                input.processMessage().messageId(),
                                input.region());
        var request = OutgoingSubmission.to(Participant.of(input.destinationId(), address));
        if (input.caseId() != null) request.inCase(input.caseId());
        else if (input.processMessage() != null)
            request.openingCase(input.serviceIdentifier(), input.serviceName());
        var outgoing =
                request.setData(
                        "application/json".equals(input.mimeType())
                                ? SubmissionData.json(input.data(), input.schemaUri())
                                : SubmissionData.xml(input.data(), input.schemaUri()));
        if (input.replyOffer() != null)
            outgoing.setReplyChannel(
                    ReplyChannels.fitConnect(
                            replyKeys.offer(attemptId, input),
                            List.of(
                                    new dev.fitko.fitconnect.rest.model.metadata.v2.DataSetSchema(
                                            input.replyOffer().schemaUri().toString(),
                                            input.replyOffer().mimeType()))));
        if (input.replyOffer() != null && !input.replyOffer().processMessages().isEmpty())
            outgoing.setReplyChannelMessages(
                    input.replyOffer().processMessages().stream()
                            .map(
                                    message ->
                                            new dev.fitko.fitconnect.rest.model.metadata.dataset
                                                    .ReplyChannelMessage(
                                                    message.processModelId(),
                                                    message.messageId(),
                                                    dev.fitko.fitconnect.rest.model.metadata.dataset
                                                            .ReplyChannelType.FIT_CONNECT))
                            .toList());
        for (var item : input.attachments())
            outgoing.addAttachment(
                    Attachment.builder()
                            .fromBytes(item.data())
                            .fileName(item.fileName())
                            .mimeType(item.mimeType())
                            .description(item.description())
                            .build());
        // Validate the acting destination before wiring its SDK transfer service.
        var source =
                http.get(
                                IntegrationEnvironment.current().submissionApi()
                                        + "/v3/destinations/"
                                        + input.fromDestinationId(),
                                Map.of(),
                                dev.fitko.fitconnect.rest.model.destination.PublicDestination.class)
                        .body();
        if (source == null
                || !input.fromDestinationId().equals(source.destinationId())
                || source.type() == null) throw new SessionException("invalid_submission");
        SentSubmission result = transfers(input.fromDestinationId()).send(outgoing.build());
        if (result == null
                || result.submissionId() == null
                || result.caseId() == null
                || !input.destinationId().equals(result.destinationId())
                || !input.fromDestinationId().equals(result.fromDestinationId()))
            throw new SessionException("resource_unavailable");
        sent.put(result.submissionId(), result);
        return new SendResult(
                result.destinationId(),
                result.fromDestinationId(),
                result.submissionId(),
                result.caseId());
    }

    ReplyResult sendReply(ReplyRecipient recipient, ReplyInput input) {
        recipient.check(input);
        try {
            var outgoing =
                    OutgoingReply.answering(
                                    recipient.caseId(),
                                    com.nimbusds.jose.jwk.JWK.parse(recipient.publicJwk()))
                            .setData(
                                    "application/json".equals(input.mimeType())
                                            ? SubmissionData.json(input.data(), input.schemaUri())
                                            : SubmissionData.xml(input.data(), input.schemaUri()));
            if (input.processMessage() != null)
                outgoing.forProcessMessage(
                        input.processMessage().processModelId(),
                        input.processMessage().messageId());
            for (var item : input.attachments())
                outgoing.addAttachment(
                        Attachment.builder()
                                .fromBytes(item.data())
                                .fileName(item.fileName())
                                .mimeType(item.mimeType())
                                .description(item.description())
                                .build());
            var source =
                    http.get(
                                    SdkEnvironment.current().submissionApiUrl()
                                            + "/v3/destinations/"
                                            + recipient.destinationId(),
                                    Map.of(),
                                    dev.fitko.fitconnect.rest.model.destination.PublicDestination
                                            .class)
                            .body();
            if (source == null
                    || !recipient.destinationId().equals(source.destinationId())
                    || source.type() == null
                    || source.type()
                            == dev.fitko.fitconnect.rest.model.destination.DestinationType
                                    .ONLINE_SERVICE)
                throw new SessionException("invalid_submission");
            var result = transfers(recipient.destinationId()).send(outgoing.build());
            if (result == null
                    || !recipient.caseId().equals(result.caseId())
                    || !recipient.destinationId().equals(result.fromDestinationId()))
                throw new SessionException("invalid_resource");
            return new ReplyResult(result.replyId(), result.caseId(), result.fromDestinationId());
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("resource_unavailable");
        }
    }
}
