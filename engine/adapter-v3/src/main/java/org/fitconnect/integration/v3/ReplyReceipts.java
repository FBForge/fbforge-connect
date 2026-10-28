package org.fitconnect.integration.v3;

import com.nimbusds.jwt.SignedJWT;
import dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter;
import dev.fitko.fitconnect.rest.client.services.auth.*;
import dev.fitko.fitconnect.rest.client.services.submission.impl.ReplyApiClient;
import dev.fitko.fitconnect.rest.model.event.authtags.AuthenticationTags;
import dev.fitko.fitconnect.rest.model.reply.*;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK4 reply receipt DTOs, API call and validation of the service-signed acknowledgement. */
final class ReplyReceipts {
    static PreparedReplyReceipt prepare(
            ReplyReceiptRequest request, ReplyReceiptEvidence evidence) {
        try {
            return new PreparedReplyReceipt(
                    request,
                    ReplyReceiptTransport.JSON.writeValueAsString(payload(request, evidence)),
                    evidence);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("invalid_input");
        }
    }

    private static Object payload(ReplyReceiptRequest request, ReplyReceiptEvidence evidence) {
        if (request.action().equals("accept")) {
            if (evidence == null
                    || !request.caseId().equals(evidence.caseId())
                    || !request.replyId().equals(evidence.replyId()))
                throw new SessionException("verification_failed");
            return new AcceptReply(
                    List.of(),
                    new AuthenticationTags(
                            evidence.metadata(), evidence.data(), evidence.attachments()));
        }
        if (evidence != null) throw new SessionException("invalid_input");
        return new RejectReply(
                List.of(
                        ReceiptSigner.problem(
                                request.reason(), request.description(), request.attachmentId())));
    }

    static UUID send(
            AuthorizationHeaderProvider auth,
            PreparedReplyReceipt prepared,
            ResourceExchange authorized,
            Path workspace) {
        try {
            var request = prepared.request();
            var http = new ReplyReceiptTransport(authorized);
            var client =
                    new ReplyApiClient(
                            new RequestHeaders(auth),
                            http,
                            new ConcurrencyLimiter(1),
                            IntegrationEnvironment.current().submissionApi());
            var current = client.getReply(request.replyId());
            if (current == null
                    || !request.replyId().equals(current.replyId())
                    || !request.caseId().equals(current.caseId())
                    || request.attachmentId() != null
                            && (current.attachments() == null
                                    || !current.attachments().contains(request.attachmentId())))
                throw new SessionException("verification_failed");
            var body = payload(request, prepared.evidence());
            String acknowledgement =
                    body instanceof AcceptReply accept
                            ? client.acceptReply(request.replyId(), accept)
                            : client.rejectReply(
                                    request.replyId(), ((RejectReply) body).problems());
            var token = checkedToken(request, acknowledgement);
            var env = SdkEnvironment.current();
            var settings =
                    dev.fitko.fitconnect.sdk.config.settings.SdkSettings.withDefaultSettings();
            var validation =
                    new dev.fitko.fitconnect.sdk.services.validation.ValidationService(
                            settings.validationConfig(),
                            env,
                            new dev.fitko.fitconnect.sdk.schema.SchemaResolver(
                                    settings.validationConfig(), http),
                            new dev.fitko.fitconnect.sdk.services.keys.SignatureKeyProvider(
                                    http, env),
                            new dev.fitko.fitconnect.sdk.validation.validators.key
                                    .PublicKeyValidator(settings.httpConfig().proxyConfig()),
                            new dev.fitko.fitconnect.virusscanner.impl.noop.NoOpVirusScanner(),
                            new dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider(
                                    workspace.toString()));
            // Validate this single service acknowledgement, not a complete transmission log.
            var context =
                    body instanceof AcceptReply accept
                            ? dev.fitko.fitconnect.sdk.validation.context.EventContext
                                    .forTransmission(
                                            request.caseId(),
                                            List.of(token),
                                            true,
                                            accept.authenticationTags(),
                                            dev.fitko.fitconnect.sdk.validation.context.EventContext
                                                    .TransmissionMode.CASE)
                            : dev.fitko.fitconnect.sdk.validation.context.EventContext
                                    .forTransmission(
                                            request.caseId(),
                                            List.of(token),
                                            true,
                                            dev.fitko.fitconnect.sdk.validation.context.EventContext
                                                    .TransmissionMode.CASE);
            if (!validation.validateEvents(context).isValid())
                throw new SessionException("verification_failed");
            return UUID.fromString(token.getJWTClaimsSet().getJWTID());
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("verification_failed");
        }
    }

    private static SignedJWT checkedToken(ReplyReceiptRequest request, String wire)
            throws Exception {
        if (wire == null
                || wire.length() > 65536
                || !wire.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))
            throw new SessionException("verification_failed");
        var token = SignedJWT.parse(wire);
        var claims = token.getJWTClaimsSet();
        long age =
                java.time.Instant.now().getEpochSecond()
                        - claims.getIssueTime().toInstant().getEpochSecond();
        if (!TestEventIssuers.isSubmissionService(claims.getIssuer())
                || !("case:" + request.caseId()).equals(claims.getStringClaim("txn"))
                || !("reply:" + request.replyId()).equals(claims.getSubject())
                || age < -60
                || age > 300
                || !claims.getJSONObjectClaim("events")
                        .keySet()
                        .equals(
                                Set.of(
                                        "https://schema.fitko.de/fit-connect/events/"
                                                + request.action()
                                                + "-reply")))
            throw new SessionException("verification_failed");
        UUID.fromString(claims.getJWTID());
        return token;
    }
}
