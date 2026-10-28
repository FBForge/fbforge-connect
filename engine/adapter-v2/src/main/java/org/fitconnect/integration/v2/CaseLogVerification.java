package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.domain.validation.*;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import dev.fitko.fitconnect.core.cases.CaseApiService;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK3's single-destination context cannot represent a whole case with multiple recipients. */
final class CaseLogVerification {
    private CaseLogVerification() {}

    static int read(
            DefaultOAuthApiService auth, ReceiverTransport http, SdkServices sdk, UUID caseId) {
        var cases =
                new CaseApiService(
                        auth,
                        http,
                        (ignored, tokens) -> {
                            var errors = new ArrayList<ValidationResult>();
                            for (var token : tokens) {
                                try {
                                    String issuer = token.getJWTClaimsSet().getIssuer();
                                    UUID destination =
                                            TestEventIssuers.isSubmissionService(issuer)
                                                    ? null
                                                    : UUID.fromString(issuer);
                                    // The issuer selects a candidate, not a trusted key. The SDK
                                    // verifies its registered key, signature, schema, header,
                                    // issuer and exact case. Case receipts may have different
                                    // issuers.
                                    var context =
                                            ValidationContext.withoutAuthTagValidation(
                                                    destination, caseId);
                                    errors.addAll(
                                            sdk.events.validateEventLogs(context, List.of(token)));
                                } catch (Exception failure) {
                                    throw new SessionException("verification_failed");
                                }
                            }
                            return errors;
                        },
                        sdk.config.getSubmissionBaseUrl());
        return cases.getEventLogForCase(null, caseId, null).size();
    }
}
