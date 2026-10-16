package org.fitconnect.integration.v2;

import org.fitconnect.integration.contract.*;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import com.nimbusds.jwt.SignedJWT;
import java.util.*;
import java.nio.file.Path;

/** SDK verification first, then exact requested identities and bounded public JSON. No content or private keys. */
final class EventLogs {
    static VerifiedEventLog read(DefaultOAuthApiService auth, UUID destination, UUID caseId, UUID submission, EventLogSource source, Path workspace) {
        return read(auth, destination, caseId, submission, source, workspace, false);
    }
    static VerifiedEventLog reply(DefaultOAuthApiService auth, UUID caseId, UUID replyId, EventLogSource source, Path workspace) {
        return read(auth, null, caseId, replyId, source, workspace, true);
    }
    private static VerifiedEventLog read(DefaultOAuthApiService auth, UUID destination, UUID caseId, UUID submission, EventLogSource source, Path workspace, boolean reply) {
        var http = new ReceiverTransport(source, Map.of());
        try {
            if (!reply && destination == null || caseId == null || submission == null || source == null || workspace == null)
                throw new SessionException("invalid_input");
            var sdk = new SdkServices(auth, http, workspace, new dev.fitko.fitconnect.core.crypto.JWECryptoService());
            int verifiedCount;
            if (reply) {
                sdk.service.getStatus(new dev.fitko.fitconnect.api.domain.model.reply.SentReply(submission, caseId, List.of()));
                var all = new ArrayList<SignedJWT>();
                for (String token : source.completeEventTokens()) all.add(SignedJWT.parse(token));
                if (!sdk.events.validateEventLogs(dev.fitko.fitconnect.api.domain.validation.ValidationContext.withoutAuthTagValidation(caseId), all).isEmpty())
                    throw new SessionException("verification_failed");
                verifiedCount = all.size();
            } else verifiedCount = sdk.service.getEventLogForSubmission(destination, caseId, submission, null).size();
            var tokens = source.completeEventTokens();
            if (verifiedCount != tokens.size()) throw new SessionException("verification_failed");
            var entries = new ArrayList<VerifiedEventLog.Entry>();
            for (String wire : tokens) {
                var jwt = SignedJWT.parse(wire); var claims = jwt.getJWTClaimsSet(); var eventsClaim = claims.getJSONObjectClaim("events");
                if (!((reply ? "reply:" : "submission:") + submission).equals(claims.getSubject()) || !("case:" + caseId).equals(claims.getStringClaim("txn"))
                        || eventsClaim == null || eventsClaim.size() != 1
                        || !(TestEventIssuers.isSubmissionService(claims.getIssuer()) || !reply && destination.toString().equalsIgnoreCase(claims.getIssuer())))
                    throw new SessionException("verification_failed");
                String event = eventsClaim.keySet().iterator().next();
                if (dev.fitko.fitconnect.api.domain.model.event.Event.fromSchemaUri(event) == null || !event.endsWith(reply ? "-reply" : "-submission")) throw new SessionException("verification_failed");
                entries.add(new VerifiedEventLog.Entry(UUID.fromString(claims.getJWTID()), event, claims.getIssuer(), claims.getIssueTime().toInstant(),
                        jwt.getParsedParts()[0].decodeToString(), jwt.getParsedParts()[1].decodeToString()));
            }
            if (entries.stream().filter(entry -> entry.eventType().equals("https://schema.fitko.de/fit-connect/events/submit-" + (reply ? "reply" : "submission"))).count() != 1)
                throw new SessionException("verification_failed");
            return reply ? VerifiedEventLog.reply(caseId, submission, entries) : new VerifiedEventLog(destination, caseId, submission, entries);
        } catch (Exception failure) {
            if (http.readFailure() != null) throw http.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException("verification_failed");
        }
    }
}
