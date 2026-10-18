package org.fitconnect.integration.contract;

import java.util.*;

/** Native archive metadata for a locally generated key bundle and its registration state. */
public record GeneratedKeyReference(
        UUID bundleId, String purpose, String publicJwk, UUID destinationId, String status) {
    public GeneratedKeyReference {
        if (bundleId == null
                || !Set.of("decrypt", "sign").contains(purpose)
                || publicJwk == null
                || publicJwk.length() > 24000
                || !Set.of("ready", "reserved", "unresolved", "bound").contains(status)
                || status.equals("bound") && destinationId == null
                || status.equals("ready") && destinationId != null)
            throw new SessionException("invalid_input");
    }
}
