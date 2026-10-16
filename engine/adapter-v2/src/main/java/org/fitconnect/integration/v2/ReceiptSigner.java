package org.fitconnect.integration.v2;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.RSAKey;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.crypto.JWECryptoService;
import dev.fitko.fitconnect.core.cases.SecurityEventTokenService;
import dev.fitko.fitconnect.api.domain.model.event.EventPayload;
import dev.fitko.fitconnect.api.domain.model.event.problems.Problem;
import dev.fitko.fitconnect.api.domain.model.event.problems.other.TechnicalError;
import dev.fitko.fitconnect.api.domain.model.event.problems.metadata.MetadataEncryptionIssue;
import dev.fitko.fitconnect.api.domain.model.event.problems.data.*;
import dev.fitko.fitconnect.api.domain.model.event.problems.attachment.AttachmentEncryptionIssue;
import org.fitconnect.integration.contract.*;
import java.nio.file.Path;
import java.util.*;

/** Local SDK3 SET construction and validation only. Its transport cannot make any HTTP call. */
final class ReceiptSigner {
    static SignedReceipt sign(DefaultOAuthApiService auth, RSAKey key, ReceiptRequest request, ReceiptEvidence evidence, Path workspace) {
        try {
            var sdk = new SdkServices(auth, new ReceiverTransport((u, h) -> { throw new SessionException("endpoint_blocked"); }, Map.of()), workspace, new JWECryptoService());
            var payload = EventPayload.builder().destinationId(request.destinationId()).submissionId(request.submissionId()).caseId(request.caseId());
            boolean accept = request.action().equals("accept");
            if (accept) {
                requireEvidence(request, evidence);
                payload.metadataAuthTag(evidence.metadata()).dataAuthTag(evidence.data()).attachmentAuthTags(evidence.attachments()).problems(List.of());
            } else payload.problems(List.of(problem(request)));
            var signer = new SecurityEventTokenService(sdk.config, sdk.validation, key);
            var token = accept ? signer.createAcceptSubmissionEvent(payload.build()) : signer.createRejectSubmissionEvent(payload.build());
            if (!token.verify(new RSASSAVerifier(key.toRSAPublicKey()))) throw new SessionException("verification_failed");
            return new SignedReceipt(request.destinationId(), request.submissionId(), request.caseId(), request.action(), key.getKeyID(), token.serialize());
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("verification_failed"); }
    }
    static void validate(SignedReceipt value, RSAKey key) {
        try {
            var token = com.nimbusds.jwt.SignedJWT.parse(value.jwt());
            var header = token.getHeader(); var claims = token.getJWTClaimsSet();
            var events = claims.getJSONObjectClaim("events");
            long age = java.time.Instant.now().getEpochSecond() - claims.getIssueTime().toInstant().getEpochSecond();
            if (!com.nimbusds.jose.JWSAlgorithm.PS512.equals(header.getAlgorithm())
                    || !new com.nimbusds.jose.JOSEObjectType("secevent+jwt").equals(header.getType())
                    || !key.getKeyID().equals(header.getKeyID()) || !value.signingKid().equals(header.getKeyID())
                    || !value.destinationId().toString().equals(claims.getIssuer())
                    || !("submission:" + value.submissionId()).equals(claims.getSubject())
                    || !("case:" + value.caseId()).equals(claims.getStringClaim("txn"))
                    || events == null || !events.keySet().equals(Set.of("https://schema.fitko.de/fit-connect/events/" + value.action() + "-submission"))
                    || age < -5 || age > 120 || !token.verify(new RSASSAVerifier(key.toRSAPublicKey())))
                throw new SessionException("verification_failed");
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("verification_failed"); }
    }
    private static void requireEvidence(ReceiptRequest request, ReceiptEvidence evidence) {
        if (evidence == null || !evidence.destinationId().equals(request.destinationId()) || !evidence.submissionId().equals(request.submissionId())
                || !evidence.caseId().equals(request.caseId())) throw new SessionException("verification_failed");
    }
    private static Problem problem(ReceiptRequest request) {
        return problem(request.reason(), request.description(), request.attachmentId());
    }
    static Problem problem(String reason, String description, UUID attachmentId) {
        Problem value = switch (reason) {
            case "technical-error" -> new TechnicalError();
            case "metadata-encryption-issue" -> new MetadataEncryptionIssue();
            case "data-encryption-issue" -> new DataEncryptionIssue();
            case "attachment-encryption-issue" -> new AttachmentEncryptionIssue(attachmentId);
            case "data-schema-violation" -> new DataSchemaViolation();
            default -> throw new SessionException("invalid_input");
        };
        return description == null ? value : new Problem(value.getType(), value.getTitle(), description, value.getInstance());
    }
}
