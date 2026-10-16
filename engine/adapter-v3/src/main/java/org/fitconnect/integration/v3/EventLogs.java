package org.fitconnect.integration.v3;

import com.nimbusds.jwt.SignedJWT;
import dev.fitko.fitconnect.rest.client.services.auth.AuthorizationHeaderProvider;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * SDK verification first, then exact requested identities and bounded public JSON. No content or
 * private keys.
 */
final class EventLogs {
    static VerifiedEventLog read(
            AuthorizationHeaderProvider auth,
            UUID destination,
            UUID caseId,
            UUID submission,
            EventLogSource source,
            Path workspace) {
        return read(auth, destination, caseId, submission, source, workspace, false);
    }

    static VerifiedEventLog reply(
            AuthorizationHeaderProvider auth,
            UUID caseId,
            UUID replyId,
            EventLogSource source,
            Path workspace) {
        return read(auth, null, caseId, replyId, source, workspace, true);
    }

    static VerifiedCaseEventLog caseLog(
            AuthorizationHeaderProvider auth, UUID caseId, EventLogSource source, Path workspace) {
        var http = new ReceiverTransport(source, Map.of());
        try {
            if (caseId == null || source == null || workspace == null)
                throw new SessionException("invalid_input");
            var env = dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment.TEST;
            var settings =
                    dev.fitko.fitconnect.sdk.config.settings.SdkSettings.withDefaultSettings();
            var headers = new dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders(auth);
            var base = "https://test.fit-connect.fitko.dev/submission-api";
            var limiter = new dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter(1);
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
            var events =
                    new dev.fitko.fitconnect.sdk.services.eventlog.EventLogService(
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .SubmissionApiClient(headers, http, limiter, base),
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .ReplyApiClient(headers, http, limiter, base),
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .CaseApiClient(headers, http, base),
                            validation,
                            env,
                            null);
            int verifiedCount = events.getCaseEventLog(caseId).size();
            var tokens = source.completeEventTokens();
            if (verifiedCount != tokens.size()) throw new SessionException("verification_failed");
            var entries = new ArrayList<VerifiedCaseEventLog.Entry>();
            for (String wire : tokens) {
                var jwt = SignedJWT.parse(wire);
                var claims = jwt.getJWTClaimsSet();
                var eventClaims = claims.getJSONObjectClaim("events");
                if (!("case:" + caseId).equals(claims.getStringClaim("txn"))
                        || eventClaims == null
                        || eventClaims.size() != 1)
                    throw new SessionException("verification_failed");
                String subject = claims.getSubject();
                if (subject == null || !subject.matches("(?:submission|reply|case):[0-9a-f-]{36}"))
                    throw new SessionException("verification_failed");
                String type = subject.substring(0, subject.indexOf(':'));
                String eventType = eventClaims.keySet().iterator().next();
                if (dev.fitko.fitconnect.rest.model.event.Event.fromSchemaUri(eventType) == null
                        || !eventType.endsWith("-" + type)
                        || !(TestEventIssuers.isSubmissionService(claims.getIssuer())
                                || uuidIssuer(claims.getIssuer())))
                    throw new SessionException("verification_failed");
                entries.add(
                        new VerifiedCaseEventLog.Entry(
                                type,
                                UUID.fromString(subject.substring(subject.indexOf(':') + 1)),
                                new VerifiedEventLog.Entry(
                                        UUID.fromString(claims.getJWTID()),
                                        eventType,
                                        claims.getIssuer(),
                                        claims.getIssueTime().toInstant(),
                                        jwt.getParsedParts()[0].decodeToString(),
                                        jwt.getParsedParts()[1].decodeToString())));
            }
            return new VerifiedCaseEventLog(caseId, entries);
        } catch (Exception failure) {
            if (http.readFailure() != null) throw http.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException("verification_failed");
        }
    }

    private static boolean uuidIssuer(String value) {
        try {
            return value != null
                    && UUID.fromString(value).toString().equals(value.toLowerCase(Locale.ROOT));
        } catch (IllegalArgumentException failure) {
            return false;
        }
    }

    private static VerifiedEventLog read(
            AuthorizationHeaderProvider auth,
            UUID destination,
            UUID caseId,
            UUID submission,
            EventLogSource source,
            Path workspace,
            boolean reply) {
        var http = new ReceiverTransport(source, Map.of());
        try {
            if (!reply && destination == null
                    || caseId == null
                    || submission == null
                    || source == null
                    || workspace == null) throw new SessionException("invalid_input");
            var env = dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment.TEST;
            var settings =
                    dev.fitko.fitconnect.sdk.config.settings.SdkSettings.withDefaultSettings();
            var headers = new dev.fitko.fitconnect.rest.client.services.auth.RequestHeaders(auth);
            var base = "https://test.fit-connect.fitko.dev/submission-api";
            var limiter = new dev.fitko.fitconnect.core.common.concurrent.ConcurrencyLimiter(1);
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
            var events =
                    new dev.fitko.fitconnect.sdk.services.eventlog.EventLogService(
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .SubmissionApiClient(headers, http, limiter, base),
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .ReplyApiClient(headers, http, limiter, base),
                            new dev.fitko.fitconnect.rest.client.services.submission.impl
                                    .CaseApiClient(headers, http, base),
                            validation,
                            env,
                            null);
            int verifiedCount =
                    (reply
                                    ? events.getReplyLog(caseId, submission)
                                    : events.getSubmissionLog(caseId, submission))
                            .entries()
                            .size();
            var tokens = source.completeEventTokens();
            if (verifiedCount != tokens.size()) throw new SessionException("verification_failed");
            var entries = new ArrayList<VerifiedEventLog.Entry>();
            for (String wire : tokens) {
                var jwt = SignedJWT.parse(wire);
                var claims = jwt.getJWTClaimsSet();
                var eventsClaim = claims.getJSONObjectClaim("events");
                if (!((reply ? "reply:" : "submission:") + submission).equals(claims.getSubject())
                        || !("case:" + caseId).equals(claims.getStringClaim("txn"))
                        || eventsClaim == null
                        || eventsClaim.size() != 1
                        || !(TestEventIssuers.isSubmissionService(claims.getIssuer())
                                || !reply
                                        && destination
                                                .toString()
                                                .equalsIgnoreCase(claims.getIssuer())))
                    throw new SessionException("verification_failed");
                String event = eventsClaim.keySet().iterator().next();
                if (dev.fitko.fitconnect.rest.model.event.Event.fromSchemaUri(event) == null
                        || !event.endsWith(reply ? "-reply" : "-submission"))
                    throw new SessionException("verification_failed");
                entries.add(
                        new VerifiedEventLog.Entry(
                                UUID.fromString(claims.getJWTID()),
                                event,
                                claims.getIssuer(),
                                claims.getIssueTime().toInstant(),
                                jwt.getParsedParts()[0].decodeToString(),
                                jwt.getParsedParts()[1].decodeToString()));
            }
            if (entries.stream()
                            .filter(
                                    entry ->
                                            entry.eventType()
                                                    .equals(
                                                            "https://schema.fitko.de/fit-connect/events/submit-"
                                                                    + (reply
                                                                            ? "reply"
                                                                            : "submission")))
                            .count()
                    != 1) throw new SessionException("verification_failed");
            return reply
                    ? VerifiedEventLog.reply(caseId, submission, entries)
                    : new VerifiedEventLog(destination, caseId, submission, entries);
        } catch (Exception failure) {
            if (http.readFailure() != null) throw http.readFailure();
            if (failure instanceof SessionException known) throw known;
            throw new SessionException("verification_failed");
        }
    }
}
