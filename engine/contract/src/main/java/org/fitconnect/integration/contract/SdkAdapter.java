package org.fitconnect.integration.contract;

/** Only JDK and contract types cross the SDK classloader boundary. */
public interface SdkAdapter {
    /** Verify a registered public key with the SDK's V-PKI trust and revocation policy. */
    default void validatePublicKey(String document, String purpose) {
        if (IntegrationEnvironment.current().requiresVpki())
            throw new SessionException("vpki_certificate_required");
    }

    ProbeResult probe();

    Class<?> dependencyClass();

    AuthenticatedSession openSession(
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources);
}
