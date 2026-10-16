package org.fitconnect.integration.contract;

/** Public metadata only. Native private key objects never cross the SDK bridge. */
public record KeyReference(String destinationId, String kid, String purpose) {}
