package org.fitconnect.integration.host;

import com.google.gson.JsonObject;
import java.time.Instant;
import org.fitconnect.integration.contract.*;

/**
 * Authenticated TEST ownership and exact public certificate identity, shared by setup and rotation.
 */
record DestinationRegistration(DestinationAccess.Context context, JsonObject details) {
    static DestinationRegistration read(AuthenticatedSession session, String destination) {
        var context = new DestinationAccess().loadOwned(session, destination);
        return new DestinationRegistration(
                context, StrictJson.object(context.detailsJson(), 24576));
    }

    boolean contains(GeneratedTestKey material, String purpose) {
        var expected =
                TestCertificatePolicy.inspect(
                        StrictJson.object(material.publicJwk(), 32768),
                        purpose.equals("decrypt")
                                ? TestCertificatePolicy.Purpose.ENCRYPTION
                                : TestCertificatePolicy.Purpose.SIGNING,
                        Instant.now());
        var matching =
                context.keys().stream().filter(key -> key.kid().equals(expected.kid())).toList();
        if (matching.isEmpty()) return false;
        if (matching.size() != 1
                || !matching.getFirst().eligible()
                || !matching.getFirst().purpose().equals(purpose)
                || !matching.getFirst().certificateSha256().equals(expected.certificateSha256()))
            throw new SessionException("destination_conflict");
        return true;
    }

    void verifyBundle(LocalTestKeys keys, String bundleId) {
        String expected =
                DestinationConfiguration.text(
                        StrictJson.object(keys.key(bundleId, "decrypt").publicJwk(), 32768)
                                .get("kid"),
                        512);
        if (!expected.equals(DestinationConfiguration.text(details.get("encryptionKid"), 512))
                || !contains(keys.key(bundleId, "decrypt"), "decrypt")
                || !contains(keys.key(bundleId, "sign"), "sign"))
            throw new SessionException("verification_failed");
    }
}
