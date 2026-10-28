package org.fitconnect.integration.contract;

/**
 * Official TEST issuer identifiers. These identify signed events, never network destinations.
 * Verification keys are still loaded only from the fixed selected endpoint by the pinned SDK.
 */
public final class TestEventIssuers {
    private TestEventIssuers() {}

    public static boolean isSubmissionService(String issuer) {
        return IntegrationEnvironment.current().submissionIssuer(issuer);
    }
}
