package org.fitconnect.integration.v3;

import com.nimbusds.jose.jwk.*;
import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment;
import dev.fitko.fitconnect.rest.client.services.auth.*;
import dev.fitko.fitconnect.rest.client.services.submission.impl.*;
import dev.fitko.fitconnect.sdk.config.credentials.*;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import dev.fitko.fitconnect.sdk.schema.SchemaResolver;
import dev.fitko.fitconnect.sdk.services.attachment.impl.AttachmentTransferService;
import dev.fitko.fitconnect.sdk.services.eventlog.EventLogService;
import dev.fitko.fitconnect.sdk.services.keys.SignatureKeyProvider;
import dev.fitko.fitconnect.sdk.services.transfer.*;
import dev.fitko.fitconnect.sdk.services.validation.ValidationService;
import dev.fitko.fitconnect.sdk.storage.api.AttachmentStorageProvider;
import dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider;
import dev.fitko.fitconnect.sdk.validation.validators.key.PublicKeyValidator;
import dev.fitko.fitconnect.virusscanner.impl.noop.NoOpVirusScanner;
import java.io.*;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Public SDK4 service composition, matching the pinned DestinationFactory with bounded native
 * crypto/storage.
 */
final class Receiver {
    private ReceiptEvidence evidence;
    private ReplyRecipient replyRecipient;
    private String replyFailure = "reply_channel_missing";

    ReceivedContent receive(
            AuthorizationHeaderProvider auth,
            List<RSAKey> keys,
            String destination,
            String submission,
            ResourceExchange read,
            Path workspace,
            Map<String, String> schemas) {
        evidence = null;
        replyRecipient = null;
        replyFailure = "reply_channel_missing";
        ReceiverTransport transport = null;
        try {
            var services =
                    compose(auth, keys, destination, read, workspace, schemas, null, ignored -> {});
            transport = services.http();
            var receiver = services.receiver();
            var crypto = services.crypto();
            var result = receiver.openSubmission(UUID.fromString(submission));
            if (!UUID.fromString(destination).equals(result.getDestinationId())
                    || !UUID.fromString(submission).equals(result.submissionId()))
                throw new SessionException("invalid_resource");
            if (!result.acceptable())
                throw new SessionException(
                        services.http().schemaFailed()
                                ? services.http().schemaFailureCode
                                : "verification_failed");
            var attachments = new ArrayList<ReceivedContent.Attachment>();
            for (var attachment : result.getAttachments()) {
                try (var stream = attachment.openStream()) {
                    attachments.add(
                            new ReceivedContent.Attachment(
                                    attachment.getAttachmentId(),
                                    attachment.getFileName(),
                                    attachment.getMimeType(),
                                    attachment.getDescription(),
                                    stream.readNBytes(32 * 1024 * 1024 + 1)));
                }
            }
            var issues = new ArrayList<ReceivedContent.Issue>();
            for (var issue : result.report().issues())
                issues.add(new ReceivedContent.Issue(issue.stage().name(), issue.isError()));
            issues.add(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false));
            var content =
                    new ReceivedContent(
                            result.getDestinationId(),
                            result.submissionId(),
                            result.caseId(),
                            crypto.metadata(),
                            result.getDataAsBytes(),
                            result.getDataMimeType(),
                            attachments,
                            issues,
                            transport.validation.snapshot(result.getDataSchemaUri().toString()),
                            result.processMessage()
                                    .map(
                                            message ->
                                                    new SubmissionInput.ProcessMessage(
                                                            message.processModelId(),
                                                            message.messageId()))
                                    .orElse(null));
            var tags = result.getAuthenticationTags();
            if (tags == null) throw new SessionException("verification_failed");
            evidence =
                    new ReceiptEvidence(
                            result.getDestinationId(),
                            result.submissionId(),
                            result.caseId(),
                            tags.metadata(),
                            tags.data(),
                            tags.attachments());
            // An unusable optional answer channel must not invalidate otherwise verified content.
            try {
                var channel =
                        dev.fitko.fitconnect.sdk.api.metadata.ReplyChannelResolver.resolve(
                                result.getMetadata());
                if (channel.isPresent() && channel.get().isFitConnect()) {
                    var fit = channel.get().fitConnect();
                    var key =
                            JWK.parse(
                                    dev.fitko.fitconnect.core.common.data.ObjectMappingHelper
                                            .toString(fit.encryptionPublicKey()));
                    checkReplyKey(key);
                    int count =
                            fit.supportedSchemas() != null && !fit.supportedSchemas().isEmpty()
                                    ? fit.supportedSchemas().size()
                                    : fit.processStandards() == null
                                            ? 0
                                            : fit.processStandards().size();
                    if (count < 1 || count > 64) throw new SessionException("verification_failed");
                    var schemasOffered =
                            fit.supportedSchemas() != null && !fit.supportedSchemas().isEmpty()
                                    ? fit.supportedSchemas().stream()
                                            .map(
                                                    schema ->
                                                            new ReplyRecipient.Schema(
                                                                    java.net.URI.create(
                                                                            schema.schemaUri()),
                                                                    schema.mimeType()))
                                            .toList()
                                    : fit.processStandards().stream()
                                            .map(
                                                    uri ->
                                                            new ReplyRecipient.Schema(
                                                                    java.net.URI.create(uri), null))
                                            .toList();
                    if (fit.destinationId() != null
                            && !fit.destinationId().equals(result.senderDestinationId()))
                        throw new SessionException("verification_failed");
                    replyRecipient =
                            new ReplyRecipient(
                                    result.getDestinationId(),
                                    result.submissionId(),
                                    result.caseId(),
                                    result.senderDestinationId(),
                                    key.toJSONString(),
                                    schemasOffered,
                                    ReplyMessageOffers.read(result.getMetadata()));
                }
            } catch (Exception failure) {
                replyFailure = "verification_failed";
            }
            return content;
        } catch (Exception failure) {
            if (transport != null && transport.readFailure() != null) throw transport.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException("verification_failed");
        }
    }

    record Components(
            IncomingTransferService receiver, ReceiveCrypto crypto, ReceiverTransport http) {}

    static Components compose(
            AuthorizationHeaderProvider auth,
            List<RSAKey> keys,
            String destination,
            ResourceExchange read,
            Path workspace,
            Map<String, String> schemas,
            dev.fitko.fitconnect.sdk.api.crypto.ReplyKeys replyKeys,
            java.util.function.Consumer<
                            dev.fitko.fitconnect.rest.model.event.authtags.AuthenticationTags>
                    observedReplyTags) {
        var http = new ReceiverTransport(read, schemas);
        var env = FitConnectEnvironment.TEST;
        var settings = SdkSettings.withDefaultSettings();
        var headers = new RequestHeaders(auth);
        var limiter = new ConcurrencyLimiter(1);
        var base = "https://test.fit-connect.fitko.dev/submission-api";
        var submissions = new SubmissionApiClient(headers, http, limiter, base);
        var replies = new ReplyApiClient(headers, http, limiter, base);
        var cases = new CaseApiClient(headers, http, base);
        var crypto = new ReceiveCrypto();
        var storage = new BoundedStorage(workspace);
        var validation =
                new ValidationService(
                        settings.validationConfig(),
                        env,
                        new SchemaResolver(settings.validationConfig(), http) {
                            @Override
                            public InputStream resolveSchema(java.net.URI uri) {
                                String local = http.localSchema(uri.toString());
                                return local == null
                                        ? super.resolveSchema(uri)
                                        : new ByteArrayInputStream(
                                                local.getBytes(
                                                        java.nio.charset.StandardCharsets.UTF_8));
                            }
                        },
                        new SignatureKeyProvider(http, env),
                        new PublicKeyValidator(settings.httpConfig().proxyConfig()),
                        new NoOpVirusScanner(),
                        storage) {
                    @Override
                    public dev.fitko.fitconnect.core.validation.impl.ValidationReport
                            validateSubmissionData(
                                    dev.fitko.fitconnect.sdk.validation.context.DataContext data) {
                        return dev.fitko.fitconnect.core.validation.impl.ValidationChain.forTarget(
                                        data)
                                .addValidator(
                                        new dev.fitko.fitconnect.sdk.validation.validators.data
                                                .DataAuthTagValidator())
                                .addValidator(
                                        new dev.fitko.fitconnect.sdk.validation.validators.data
                                                .DataHashValidator())
                                .addValidator(
                                        new dev.fitko.fitconnect.sdk.validation.validators.data
                                                .DataJsonSyntaxValidator())
                                .addValidator(
                                        new dev.fitko.fitconnect.sdk.validation.validators.data
                                                .DataXmlSyntaxValidator())
                                .addValidator(
                                        context -> {
                                            var schema =
                                                    context.metadata()
                                                            .getContentStructure()
                                                            .data()
                                                            .submissionSchema();
                                            try {
                                                boolean valid =
                                                        schema.mimeType()
                                                                        == dev.fitko.fitconnect.rest
                                                                                .model.metadata.data
                                                                                .MimeType
                                                                                .APPLICATION_JSON
                                                                ? http.validation.json(
                                                                        context.decryptedData(),
                                                                        schema.schemaUri()
                                                                                .toString())
                                                                : http.validation.sources
                                                                        .validateXml(
                                                                                context
                                                                                        .decryptedData(),
                                                                                schema.schemaUri()
                                                                                        .toString());
                                                return valid
                                                        ? dev.fitko.fitconnect.core.validation.api
                                                                .ValidationResult.valid()
                                                        : dev.fitko.fitconnect.core.validation.api
                                                                .ValidationResult.error(
                                                                "Fachdaten entsprechen nicht dem Schema.");
                                            } catch (SessionException failure) {
                                                http.failed(failure);
                                                return dev.fitko.fitconnect.core.validation.api
                                                        .ValidationResult.error(
                                                        "Schema nicht verfügbar.");
                                            }
                                        })
                                .addValidator(
                                        new dev.fitko.fitconnect.sdk.validation.validators.virus
                                                .DataVirusScanValidator(new NoOpVirusScanner()))
                                .executeWithReport();
                    }
                };
        var events =
                new EventLogService(submissions, replies, cases, validation, env, null) {
                    @Override
                    public dev.fitko.fitconnect.rest.model.event.authtags.AuthenticationTags
                            getReplyAuthTags(dev.fitko.fitconnect.rest.model.reply.Reply reply) {
                        var tags = super.getReplyAuthTags(reply);
                        observedReplyTags.accept(tags);
                        return tags;
                    }
                };
        var transfers =
                new AttachmentTransferService(settings.attachmentChunkingConfig(), crypto, storage);
        var acting =
                new ActingDestination(
                        UUID.fromString(destination),
                        new DestinationKeys(new ArrayList<JWK>(keys), null));
        var context = new TransferContext(submissions, replies, cases, crypto, validation, acting);
        var receiver =
                new IncomingTransferService(context, transfers, events, storage, keys, replyKeys);
        return new Components(receiver, crypto, http);
    }

    ReceiptEvidence evidence(String destination, String submission) {
        if (evidence == null
                || !evidence.destinationId().toString().equals(destination)
                || !evidence.submissionId().toString().equals(submission))
            throw new SessionException("verification_failed");
        return evidence;
    }

    ReplyRecipient replyRecipient(String destination, String submission) {
        evidence(destination, submission);
        if (replyRecipient == null) throw new SessionException(replyFailure);
        return replyRecipient;
    }

    private static void checkReplyKey(JWK key) {
        if (!(key instanceof RSAKey rsa)
                || key.isPrivate()
                || rsa.size() < 4096
                || rsa.size() > 8192
                || key.getKeyID() == null
                || key.getKeyID().isBlank()
                || key.getKeyID().length() > 512
                || key.getAlgorithm() == null
                || !"RSA-OAEP-256".equals(key.getAlgorithm().getName())
                || !Set.of(KeyOperation.WRAP_KEY).equals(key.getKeyOperations()))
            throw new SessionException("verification_failed");
    }

    /** The SDK may assemble fragment streams on disk. Its default provider has no quota. */
    private static final class BoundedStorage implements AttachmentStorageProvider {
        private final FileSystemStorageProvider delegate;
        private long written;

        BoundedStorage(Path workspace) {
            delegate = new FileSystemStorageProvider(workspace.toString());
        }

        public OutputStream getStorageStream(UUID submission, UUID attachment) {
            return new FilterOutputStream(delegate.getStorageStream(submission, attachment)) {
                private long fileBytes;

                public void write(int value) throws IOException {
                    write(new byte[] {(byte) value}, 0, 1);
                }

                public void write(byte[] value, int offset, int length) throws IOException {
                    Objects.checkFromIndexSize(offset, length, value.length);
                    if (fileBytes + length > 32L * 1024 * 1024
                            || written + length > 64L * 1024 * 1024)
                        throw new IOException("Content quota exceeded");
                    fileBytes += length;
                    written += length;
                    out.write(value, offset, length);
                }
            };
        }

        public InputStream loadAttachment(UUID submission, UUID attachment) {
            return delegate.loadAttachment(submission, attachment);
        }

        public boolean deleteAttachment(UUID submission, UUID attachment) {
            return delegate.deleteAttachment(submission, attachment);
        }

        public boolean purgeAllAttachments() {
            return delegate.purgeAllAttachments();
        }

        public long getTotalSize() {
            return delegate.getTotalSize();
        }

        public long getAttachmentCount() {
            return delegate.getAttachmentCount();
        }

        public String getStorageInfo() {
            return "Private bounded receive workspace";
        }
    }
}
