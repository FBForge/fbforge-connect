package org.fitconnect.integration.v3;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.RSAKey;
import dev.fitko.fitconnect.rest.model.event.Event;
import dev.fitko.fitconnect.rest.model.event.authtags.AuthenticationTags;
import dev.fitko.fitconnect.rest.model.event.problems.Problem;
import dev.fitko.fitconnect.rest.model.event.problems.attachment.AttachmentEncryptionIssue;
import dev.fitko.fitconnect.rest.model.event.problems.data.*;
import dev.fitko.fitconnect.rest.model.event.problems.metadata.MetadataEncryptionIssue;
import dev.fitko.fitconnect.rest.model.event.problems.other.TechnicalError;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import dev.fitko.fitconnect.sdk.schema.SchemaResolver;
import dev.fitko.fitconnect.sdk.services.eventlog.EventPayload;
import dev.fitko.fitconnect.sdk.services.eventlog.token.JwtTokenFactory;
import dev.fitko.fitconnect.sdk.services.keys.SignatureKeyProvider;
import dev.fitko.fitconnect.sdk.services.validation.ValidationService;
import dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider;
import dev.fitko.fitconnect.sdk.validation.validators.key.PublicKeyValidator;
import dev.fitko.fitconnect.virusscanner.impl.noop.NoOpVirusScanner;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Local SDK4 SET construction and validation only. There is no default network transport. */
final class ReceiptSigner {
    static SignedReceipt sign(
            RSAKey key, ReceiptRequest request, ReceiptEvidence evidence, Path workspace) {
        try {
            var settings = SdkSettings.withDefaultSettings();
            var env = SdkEnvironment.current();
            var http =
                    new ReceiverTransport(
                            (u, h) -> {
                                throw new SessionException("endpoint_blocked");
                            },
                            Map.of());
            var validation =
                    new ValidationService(
                            settings.validationConfig(),
                            env,
                            new SchemaResolver(settings.validationConfig(), http),
                            new SignatureKeyProvider(http, env),
                            new PublicKeyValidator(settings.httpConfig().proxyConfig()),
                            new NoOpVirusScanner(),
                            new FileSystemStorageProvider(workspace.toString()));
            boolean accept = request.action().equals("accept");
            AuthenticationTags tags = null;
            if (accept) {
                if (evidence == null
                        || !evidence.destinationId().equals(request.destinationId())
                        || !evidence.submissionId().equals(request.submissionId())
                        || !evidence.caseId().equals(request.caseId()))
                    throw new SessionException("verification_failed");
                tags =
                        new AuthenticationTags(
                                evidence.metadata(), evidence.data(), evidence.attachments());
            }
            var payload =
                    new EventPayload(
                            request.submissionId(),
                            request.destinationId(),
                            request.caseId(),
                            tags,
                            accept ? List.of() : List.of(problem(request)));
            var factory =
                    JwtTokenFactory.builder()
                            .rsaKey(key)
                            .schemaVersion(
                                    String.format(
                                            SdkSettings.SET_SCHEMA_URI_TEMPLATE,
                                            SdkSettings.SET_SCHEMA_WRITE_VERSION
                                                    .getVersionAsString()))
                            .build();
            var token =
                    factory.create(
                            accept ? Event.ACCEPT_SUBMISSION : Event.REJECT_SUBMISSION, payload);
            if (validation.validateSetPayload(token).isError()
                    || !token.verify(new RSASSAVerifier(key.toRSAPublicKey())))
                throw new SessionException("verification_failed");
            return new SignedReceipt(
                    request.destinationId(),
                    request.submissionId(),
                    request.caseId(),
                    request.action(),
                    key.getKeyID(),
                    token.serialize());
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("verification_failed");
        }
    }

    static void validate(SignedReceipt value, RSAKey key) {
        try {
            var token = com.nimbusds.jwt.SignedJWT.parse(value.jwt());
            var header = token.getHeader();
            var claims = token.getJWTClaimsSet();
            var events = claims.getJSONObjectClaim("events");
            long age =
                    java.time.Instant.now().getEpochSecond()
                            - claims.getIssueTime().toInstant().getEpochSecond();
            if (!com.nimbusds.jose.JWSAlgorithm.PS512.equals(header.getAlgorithm())
                    || !new com.nimbusds.jose.JOSEObjectType("secevent+jwt")
                            .equals(header.getType())
                    || !key.getKeyID().equals(header.getKeyID())
                    || !value.signingKid().equals(header.getKeyID())
                    || !value.destinationId().toString().equals(claims.getIssuer())
                    || !("submission:" + value.submissionId()).equals(claims.getSubject())
                    || !("case:" + value.caseId()).equals(claims.getStringClaim("txn"))
                    || events == null
                    || !events.keySet()
                            .equals(
                                    Set.of(
                                            "https://schema.fitko.de/fit-connect/events/"
                                                    + value.action()
                                                    + "-submission"))
                    || age < -5
                    || age > 120
                    || !token.verify(new RSASSAVerifier(key.toRSAPublicKey())))
                throw new SessionException("verification_failed");
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("verification_failed");
        }
    }

    private static Problem problem(ReceiptRequest request) {
        return problem(request.reason(), request.description(), request.attachmentId());
    }

    static Problem problem(String reason, String description, UUID attachmentId) {
        Problem value =
                switch (reason) {
                    case "technical-error" -> new TechnicalError();
                    case "metadata-encryption-issue" -> new MetadataEncryptionIssue();
                    case "data-encryption-issue" -> new DataEncryptionIssue();
                    case "attachment-encryption-issue" ->
                            new AttachmentEncryptionIssue(attachmentId);
                    case "data-schema-violation" ->
                            new DataSchemaViolation(
                                    Objects.requireNonNullElse(description, "Schema violation"));
                    default -> throw new SessionException("invalid_input");
                };
        return description == null
                ? value
                : new Problem(value.getType(), value.getTitle(), description, value.getInstance());
    }
}
