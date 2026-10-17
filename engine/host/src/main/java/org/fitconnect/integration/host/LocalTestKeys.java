package org.fitconnect.integration.host;

import java.time.Instant;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Native generated TEST bundles, retained independently of keys currently loaded for a destination.
 */
final class LocalTestKeys {
    record KeyInfo(String kid, String purpose, String fingerprint, String expiresAt) {}

    record Summary(
            String bundleId,
            String destinationId,
            String status,
            KeyInfo encryption,
            KeyInfo signing) {}

    private static final class Bundle {
        final UUID id;
        GeneratedTestKey encryption, signing;
        UUID destination;
        String status = "ready";

        Bundle(UUID id) {
            this.id = id;
        }
    }

    private final Map<UUID, Bundle> bundles = new LinkedHashMap<>();

    Summary generate(AuthenticatedSession session) {
        if (bundles.size() >= 64) throw error("content_limit");
        var bundle = new Bundle(UUID.randomUUID());
        bundle.encryption = session.generateTestKey("decrypt");
        validate(session, "decrypt", bundle.encryption);
        bundle.signing = session.generateTestKey("sign");
        validate(session, "sign", bundle.signing);
        bundles.put(bundle.id, bundle);
        return summary(bundle);
    }

    private static TestCertificatePolicy.ValidatedKey validate(
            AuthenticatedSession session, String purpose, GeneratedTestKey key) {
        try {
            var result =
                    TestCertificatePolicy.validate(
                            StrictJson.object(key.publicJwk(), 32768),
                            purpose.equals("decrypt")
                                    ? TestCertificatePolicy.Purpose.ENCRYPTION
                                    : TestCertificatePolicy.Purpose.SIGNING,
                            Instant.now());
            session.checkGeneratedTestKey(purpose, key);
            return result;
        } catch (TestCertificatePolicy.Rejected failure) {
            throw error("test_certificate_required");
        }
    }

    private Bundle require(String id) {
        var bundle = bundles.get(UUID.fromString(DestinationAccess.id(id)));
        if (bundle == null || bundle.encryption == null || bundle.signing == null)
            throw error("key_missing");
        return bundle;
    }

    GeneratedTestKey key(String id, String purpose) {
        var bundle = require(id);
        return switch (purpose) {
            case "decrypt" -> bundle.encryption;
            case "sign" -> bundle.signing;
            default -> throw error("invalid_input");
        };
    }

    void reserve(String id, String destination) {
        var bundle = require(id);
        if (!bundle.status.equals("ready") || bundle.destination != null)
            throw error("destination_update_locked");
        bundle.status = "reserved";
        bundle.destination =
                destination == null ? null : UUID.fromString(DestinationAccess.id(destination));
    }

    void release(String id) {
        var bundle = require(id);
        if (Set.of("reserved", "unresolved").contains(bundle.status)) {
            bundle.status = "ready";
            bundle.destination = null;
        }
    }

    void unresolved(String id) {
        unresolved(id, null);
    }

    void unresolved(String id, String destination) {
        var bundle = require(id);
        bundle.status = "unresolved";
        if (destination != null)
            bundle.destination = UUID.fromString(DestinationAccess.id(destination));
    }

    void bind(String id, String destination) {
        var bundle = require(id);
        var target = UUID.fromString(DestinationAccess.id(destination));
        if (bundle.status.equals("bound")
                && bundle.destination != null
                && !bundle.destination.equals(target)) throw error("invalid_resource");
        bundle.destination = target;
        bundle.status = "bound";
    }

    List<Summary> list() {
        return bundles.values().stream()
                .filter(item -> item.encryption != null && item.signing != null)
                .map(LocalTestKeys::summary)
                .toList();
    }

    private static Summary summary(Bundle bundle) {
        return new Summary(
                bundle.id.toString(),
                bundle.destination == null ? null : bundle.destination.toString(),
                bundle.status,
                info(bundle.encryption, "decrypt"),
                info(bundle.signing, "sign"));
    }

    private static KeyInfo info(GeneratedTestKey material, String purpose) {
        try {
            var value =
                    TestCertificatePolicy.validate(
                            StrictJson.object(material.publicJwk(), 32768),
                            purpose.equals("decrypt")
                                    ? TestCertificatePolicy.Purpose.ENCRYPTION
                                    : TestCertificatePolicy.Purpose.SIGNING,
                            Instant.now());
            return new KeyInfo(
                    value.kid(), purpose, value.certificateSha256(), value.expiresAt().toString());
        } catch (TestCertificatePolicy.Rejected failure) {
            throw error("test_certificate_required");
        }
    }

    List<SessionKeyArchive> archive() {
        var result = new ArrayList<SessionKeyArchive>();
        for (var bundle : bundles.values()) {
            if (bundle.encryption == null || bundle.signing == null)
                throw error("invalid_resource");
            for (String purpose : List.of("decrypt", "sign")) {
                var material = purpose.equals("decrypt") ? bundle.encryption : bundle.signing;
                result.add(
                        new SessionKeyArchive(
                                null,
                                null,
                                null,
                                material.privateJwk(),
                                null,
                                null,
                                new GeneratedKeyReference(
                                        bundle.id,
                                        purpose,
                                        material.publicJwk(),
                                        bundle.destination,
                                        bundle.status)));
            }
        }
        return List.copyOf(result);
    }

    void restore(AuthenticatedSession session, SessionKeyArchive item) {
        var reference = item.generatedKey();
        if (reference == null) throw error("invalid_input");
        var material = new GeneratedTestKey(reference.publicJwk(), item.privateJwk());
        validate(session, reference.purpose(), material);
        var bundle = bundles.get(reference.bundleId());
        String status = reference.status().equals("reserved") ? "ready" : reference.status();
        UUID destination = reference.status().equals("reserved") ? null : reference.destinationId();
        if (bundle == null) {
            if (bundles.size() >= 64) throw error("content_limit");
            bundle = new Bundle(reference.bundleId());
            bundle.destination = destination;
            bundle.status = status;
            bundles.put(bundle.id, bundle);
        }
        if (!Objects.equals(bundle.destination, destination) || !bundle.status.equals(status))
            throw error("invalid_resource");
        if (reference.purpose().equals("decrypt")) {
            if (bundle.encryption != null) throw error("invalid_resource");
            bundle.encryption = material;
        } else {
            if (bundle.signing != null) throw error("invalid_resource");
            bundle.signing = material;
        }
    }

    void remove(String id) {
        var bundle = require(id);
        if (!Set.of("ready", "bound").contains(bundle.status)) throw error("send_locked");
        bundles.remove(bundle.id);
    }

    void clear() {
        bundles.clear();
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
