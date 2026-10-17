package org.fitconnect.integration.contract;

/** Only JDK and contract types cross the SDK classloader boundary. */
public interface SdkAdapter {
    ProbeResult probe();

    Class<?> dependencyClass();

    AuthenticatedSession openSession(
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources);
}
