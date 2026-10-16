package org.fitconnect.integration.contract;

import java.util.Set;

/**
 * Official TEST issuer identifiers. These identify signed events, never network destinations.
 * Verification keys are still loaded only from the fixed TEST endpoint by the pinned SDK.
 */
public final class TestEventIssuers {
    private static final Set<String> SUBMISSION_SERVICES =
            Set.of(
                    "https://test.fit-connect.fitko.dev/submission-api",
                    "https://submission-api-testing.fit-connect.fitko.dev");

    private TestEventIssuers() {}

    public static boolean isSubmissionService(String issuer) {
        return SUBMISSION_SERVICES.contains(issuer == null ? "" : issuer);
    }
}
