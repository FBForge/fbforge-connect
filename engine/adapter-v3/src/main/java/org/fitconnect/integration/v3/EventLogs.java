package org.fitconnect.integration.v3;

import org.fitconnect.integration.contract.*;
import dev.fitko.fitconnect.rest.client.services.auth.AuthorizationHeaderProvider;
import com.nimbusds.jwt.SignedJWT;
import java.util.*;
import java.nio.file.Path;

/** SDK verification first, then exact requested identities and bounded public JSON. No content or private keys. */
final class EventLogs {
    static VerifiedEventLog read(AuthorizationHeaderProvider auth, UUID destination, UUID caseId, UUID submission, EventLogSource source, Path workspace) {
        var http = new ReceiverTransport(source, Map.of());
        try {
            if (destination == null || caseId == null || submission == null || source == null || workspace == null)
                throw new SessionException("invalid_input");
            var env = dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment.TEST;
            var settings = dev.fitko.fitconnect.sdk.config.settings.SdkSettings.withDefaultSettings();
            var headers = new dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders(auth);
            var base = "https://test.fit-connect.fitko.dev/submission-api";
            var limiter = new dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter(1);
            var validation = new dev.fitko.fitconnect.sdk.services.validation.ValidationService(settings.validationConfig(), env,
                    new dev.fitko.fitconnect.sdk.schema.SchemaResolver(settings.validationConfig(), http),
                    new dev.fitko.fitconnect.sdk.services.keys.SignatureKeyProvider(http, env),
                    new dev.fitko.fitconnect.sdk.validation.validators.key.PublicKeyValidator(settings.httpConfig().proxyConfig()),
                    new dev.fitko.fitconnect.virusscanner.impl.noop.NoOpVirusScanner(),
                    new dev.fitko.fitconnect.sdk.storage.impl.FileSystemStorageProvider(workspace.toString()));
            var events = new dev.fitko.fitconnect.sdk.services.eventlog.EventLogService(
                    new dev.fitko.fitconnect.rest.client.services.submission.impl.SubmissionApiClient(headers, http, limiter, base),
                    new dev.fitko.fitconnect.rest.client.services.submission.impl.ReplyApiClient(headers, http, limiter, base),
                    new dev.fitko.fitconnect.rest.client.services.submission.impl.CaseApiClient(headers, http, base), validation, env, null);
            int verifiedCount = events.getSubmissionLog(caseId, submission).entries().size();
            var tokens = source.completeEventTokens();
            if (verifiedCount != tokens.size()) throw new SessionException("verification_failed");
            var entries = new ArrayList<VerifiedEventLog.Entry>();
            for (String wire : tokens) {
                var jwt = SignedJWT.parse(wire); var claims = jwt.getJWTClaimsSet(); var eventsClaim = claims.getJSONObjectClaim("events");
                if (!("submission:" + submission).equals(claims.getSubject()) || !("case:" + caseId).equals(claims.getStringClaim("txn"))
                        || eventsClaim == null || eventsClaim.size() != 1
                        || !(TestEventIssuers.isSubmissionService(claims.getIssuer()) || destination.toString().equalsIgnoreCase(claims.getIssuer())))
                    throw new SessionException("verification_failed");
                String event = eventsClaim.keySet().iterator().next();
                if (dev.fitko.fitconnect.rest.model.event.Event.fromSchemaUri(event) == null || !event.endsWith("-submission")) throw new SessionException("verification_failed");
                entries.add(new VerifiedEventLog.Entry(UUID.fromString(claims.getJWTID()), event, claims.getIssuer(), claims.getIssueTime().toInstant(),
                        jwt.getParsedParts()[0].decodeToString(), jwt.getParsedParts()[1].decodeToString()));
            }
            if (entries.stream().filter(entry -> entry.eventType().equals("https://schema.fitko.de/fit-connect/events/submit-submission")).count() != 1)
                throw new SessionException("verification_failed");
            return new VerifiedEventLog(destination, caseId, submission, entries);
        } catch (Exception failure) {
            if (http.readFailure() != null) throw http.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException("verification_failed");
        }
    }
}
