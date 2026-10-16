package org.fitconnect.integration.v2;

import com.nimbusds.jwt.SignedJWT;
import dev.fitko.fitconnect.api.domain.model.event.authtags.AuthenticationTags;
import dev.fitko.fitconnect.api.domain.model.reply.*;
import dev.fitko.fitconnect.api.domain.validation.ValidationContext;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.reply.ReplyApiService;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK3 reply receipt DTOs, API call and validation of the service-signed acknowledgement. */
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
                            evidence.data(), evidence.metadata(), evidence.attachments()));
        }
        if (evidence != null) throw new SessionException("invalid_input");
        return new RejectReply(
                List.of(
                        ReceiptSigner.problem(
                                request.reason(), request.description(), request.attachmentId())));
    }

    static UUID send(
            DefaultOAuthApiService auth,
            PreparedReplyReceipt prepared,
            ResourceExchange authorized,
            Path workspace) {
        try {
            var request = prepared.request();
            var http = new ReplyReceiptTransport(authorized);
            var client =
                    new ReplyApiService(
                            auth, http, "https://test.fit-connect.fitko.dev/submission-api");
            var current = client.getReply(request.replyId());
            if (current == null
                    || !request.replyId().equals(current.getReplyId())
                    || !request.caseId().equals(current.getCaseId())
                    || request.attachmentId() != null
                            && (current.getAttachments() == null
                                    || !current.getAttachments().contains(request.attachmentId())))
                throw new SessionException("verification_failed");
            var body = payload(request, prepared.evidence());
            String acknowledgement =
                    body instanceof AcceptReply accept
                            ? client.acceptReply(request.replyId(), accept)
                            : client.rejectReply(
                                    request.replyId(), ((RejectReply) body).getProblems());
            var token = checkedToken(request, acknowledgement);
            var sdk =
                    new SdkServices(
                            auth,
                            http,
                            workspace,
                            new dev.fitko.fitconnect.core.crypto.JWECryptoService());
            var context =
                    body instanceof AcceptReply accept
                            ? ValidationContext.withAuthTagValidation(
                                    null, request.caseId(), accept.getAuthenticationTags())
                            : ValidationContext.withoutAuthTagValidation(request.caseId());
            if (!sdk.events.validateEventLogs(context, List.of(token)).isEmpty())
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
