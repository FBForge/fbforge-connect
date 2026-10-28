package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.config.*;
import dev.fitko.fitconnect.api.config.chunking.*;
import dev.fitko.fitconnect.api.config.defaults.*;
import dev.fitko.fitconnect.api.config.resources.CertificateConfig;
import dev.fitko.fitconnect.api.services.crypto.CryptoService;
import dev.fitko.fitconnect.api.services.http.HttpClient;
import dev.fitko.fitconnect.client.attachments.*;
import dev.fitko.fitconnect.client.util.*;
import dev.fitko.fitconnect.core.FitConnectDefaultService;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.cases.*;
import dev.fitko.fitconnect.core.crypto.*;
import dev.fitko.fitconnect.core.destination.DestinationApiService;
import dev.fitko.fitconnect.core.io.FileChunker;
import dev.fitko.fitconnect.core.keys.PublicKeyApiService;
import dev.fitko.fitconnect.core.reply.ReplyApiService;
import dev.fitko.fitconnect.core.schema.SchemaResourceProvider;
import dev.fitko.fitconnect.core.submission.SubmissionApiService;
import dev.fitko.fitconnect.core.validation.DefaultValidationService;
import dev.fitko.fitconnect.core.validation.virusscan.VirusScannerFactory;
import dev.fitko.fitconnect.core.validation.xml.*;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.IntegrationEnvironment;

/**
 * SDK3 service composition shared by sending and receiving, always with injected HTTP and storage.
 */
final class SdkServices {
    final ApplicationConfig config;
    final FitConnectDefaultService service;
    final AttachmentPayloadHandler payloads;
    final DefaultValidationService validation;
    final EventLogVerifier events;

    SdkServices(
            DefaultOAuthApiService auth, HttpClient http, Path workspace, CryptoService crypto) {
        this(auth, http, workspace, crypto, ignored -> {});
    }

    SdkServices(
            DefaultOAuthApiService auth,
            HttpClient http,
            Path workspace,
            CryptoService crypto,
            java.util.function.Consumer<
                            dev.fitko.fitconnect.api.domain.model.event.authtags
                                    .ValidatedAuthenticationTags>
                    observedTags) {
        var selected = Environments.valueOf(IntegrationEnvironment.current().name());
        var defaults = selected.getEnvironment();
        var environment =
                new Environment(
                        defaults.getAuthBaseUrl(),
                        defaults.getRoutingBaseUrl(),
                        List.of(IntegrationEnvironment.current().submissionApi()),
                        defaults.getSelfServicePortalBaseUrl(),
                        defaults.getDestinationBaseUrl(),
                        false,
                        !IntegrationEnvironment.current().requiresVpki(),
                        false);
        config =
                ApplicationConfig.builder()
                        .activeEnvironment(selected.getEnvironmentName())
                        .environments(Map.of(selected.getEnvironmentName(), environment))
                        .attachmentChunkingConfig(
                                AttachmentChunkingConfig.builder()
                                        .attachmentStoragePath(workspace)
                                        .chunkAllAttachments(true)
                                        .chunkSizeInMB(4)
                                        .build())
                        .concurrentAttachmentStreams(1)
                        .build();
        var schemas =
                new SchemaResourceProvider(
                        http,
                        ResourceLoadingUtils.loadAllSchemaResources(
                                "schema-config.yaml", config.getSubmissionDataSchemas())) {
                    @Override
                    public String loadSubmissionDataSchema(java.net.URI uri) {
                        if (http instanceof ReceiverTransport receiver) {
                            String local = receiver.localSchema(uri.toString());
                            if (local != null) return local;
                        }
                        return super.loadSubmissionDataSchema(uri);
                    }
                };
        var hash = new HashService();
        var roots =
                ResourceLoadingUtils.loadYaml("certificate-config.yaml", CertificateConfig.class)
                        .getTrustedRootCertificates()
                        .stream()
                        .map(ResourceLoadingUtils::readResourceToString)
                        .toList();
        validation =
                new DefaultValidationService(
                        config,
                        hash,
                        schemas,
                        new XmlSchemaValidator(new XRepoSchemaLoader(http), Map.of(), http),
                        roots) {
                    @Override
                    public dev.fitko.fitconnect.api.domain.validation.ValidationResult
                            validateJsonFormat(byte[] data) {
                        var result = super.validateJsonFormat(data);
                        if (http instanceof SenderTransport && result.hasError())
                            throw new org.fitconnect.integration.contract.SessionException(
                                    "data_format_invalid");
                        return result;
                    }

                    @Override
                    public dev.fitko.fitconnect.api.domain.validation.ValidationResult
                            validateXmlFormat(byte[] data) {
                        var result = super.validateXmlFormat(data);
                        if (http instanceof SenderTransport && result.hasError())
                            throw new org.fitconnect.integration.contract.SessionException(
                                    "data_format_invalid");
                        return result;
                    }

                    @Override
                    public dev.fitko.fitconnect.api.domain.validation.ValidationResult
                            validateJsonSubmissionDataSchema(byte[] data, java.net.URI uri) {
                        if (!(http instanceof ReceiverTransport receiver))
                            return super.validateJsonSubmissionDataSchema(data, uri);
                        try {
                            boolean valid = receiver.validation.json(data, uri.toString());
                            if (!valid)
                                receiver.failed(
                                        new org.fitconnect.integration.contract.SessionException(
                                                "data_schema_invalid"));
                            return valid
                                    ? dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                            .ok()
                                    : dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                            .error("Fachdaten entsprechen nicht dem JSON-Schema.");
                        } catch (org.fitconnect.integration.contract.SessionException failure) {
                            receiver.failed(failure);
                            return dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                    .error("Schema nicht verfügbar.");
                        }
                    }

                    @Override
                    public dev.fitko.fitconnect.api.domain.validation.ValidationResult
                            validateXmlSubmissionDataSchema(byte[] data, java.net.URI uri) {
                        if (!(http instanceof ReceiverTransport receiver))
                            return super.validateXmlSubmissionDataSchema(data, uri);
                        try {
                            boolean valid =
                                    receiver.validation.sources.validateXml(data, uri.toString());
                            if (!valid)
                                receiver.failed(
                                        new org.fitconnect.integration.contract.SessionException(
                                                "data_schema_invalid"));
                            return valid
                                    ? dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                            .ok()
                                    : dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                            .error("Fachdaten entsprechen nicht dem XSD.");
                        } catch (org.fitconnect.integration.contract.SessionException failure) {
                            receiver.failed(failure);
                            return dev.fitko.fitconnect.api.domain.validation.ValidationResult
                                    .error("Schema nicht verfügbar.");
                        }
                    }
                };
        var keys = new PublicKeyApiService(config, http, auth, validation);
        events = new EventLogVerifier(keys, validation);
        service =
                FitConnectDefaultService.builder()
                        .submissionService(
                                new SubmissionApiService(auth, http, config.getSubmissionBaseUrl()))
                        .destinationService(
                                new DestinationApiService(
                                        auth, http, config.getDestinationBaseUrl()))
                        .caseService(
                                new CaseApiService(
                                        auth, http, events, config.getSubmissionBaseUrl()) {
                                    @Override
                                    public dev.fitko.fitconnect.api.domain.model.event.authtags
                                                    .ValidatedAuthenticationTags
                                            getAuthenticationTags(
                                                    dev.fitko.fitconnect.api.domain.model.submission
                                                                    .Submission
                                                            submission) {
                                        var result = super.getAuthenticationTags(submission);
                                        observedTags.accept(result);
                                        return result;
                                    }

                                    @Override
                                    public dev.fitko.fitconnect.api.domain.model.event.authtags
                                                    .ValidatedAuthenticationTags
                                            getAuthenticationTags(
                                                    dev.fitko.fitconnect.api.domain.model.reply
                                                                    .Reply
                                                            reply) {
                                        var result = super.getAuthenticationTags(reply);
                                        observedTags.accept(result);
                                        return result;
                                    }
                                })
                        .replyService(
                                new ReplyApiService(auth, http, config.getSubmissionBaseUrl()))
                        .cryptoService(crypto)
                        .validationService(validation)
                        .keyService(keys)
                        .securityEventService(
                                new SecurityEventTokenService(config, validation, null))
                        .concurrencyLimiter(new ConcurrencyLimiter(1))
                        .virusScanService(
                                VirusScannerFactory.createScanner(
                                        config.getVirusScannerMode(),
                                        config.getVirusScannerConfig()))
                        .build();
        var storage = new AttachmentStorageResolver(workspace);
        payloads =
                new AttachmentPayloadHandler(
                        config.getAttachmentChunkingConfig(), new FileChunker(), storage, hash);
    }
}
