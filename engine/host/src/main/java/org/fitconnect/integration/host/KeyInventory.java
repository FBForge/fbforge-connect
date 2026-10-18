package org.fitconnect.integration.host;

import com.google.gson.*;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.RSAPublicKeySpec;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Public key metadata only. Private archives never become an inventory response. */
final class KeyInventory {
    record Row(
            String itemId,
            String kind,
            String purpose,
            String keyId,
            String destinationId,
            String caseId,
            String status,
            String fingerprint,
            String expiresAt,
            boolean removable,
            String blockedReason) {}

    record Page(int offset, int total, List<Row> items) {}

    private record PublicKey(String fingerprint, String expiresAt) {}

    private record Selection(Row row, KeyReference imported, UUID reply, UUID bundle) {}

    static Page list(
            String owner, AuthenticatedSession session, LocalTestKeys generated, int offset) {
        var selections = selections(owner, session, generated);
        if (offset < 0 || offset % 20 != 0 || offset > selections.size())
            throw error("invalid_input");
        return new Page(
                offset,
                selections.size(),
                selections.subList(offset, Math.min(offset + 20, selections.size())).stream()
                        .map(Selection::row)
                        .toList());
    }

    static void remove(
            String owner, AuthenticatedSession session, LocalTestKeys generated, String itemId) {
        var selected =
                selections(owner, session, generated).stream()
                        .filter(item -> item.row().itemId().equals(itemId))
                        .findFirst()
                        .orElseThrow(() -> error("key_missing"));
        if (!selected.row().removable()) throw error("send_locked");
        if (selected.imported() != null) session.discardKey(selected.imported());
        else if (selected.reply() != null) session.discardReplyChannel(selected.reply());
        else {
            var id = selected.bundle().toString();
            var bundle =
                    generated.list().stream()
                            .filter(item -> item.bundleId().equals(id))
                            .findFirst()
                            .orElseThrow(() -> error("key_missing"));
            // Remove every active imported copy of this pair as well as its generated archive.
            for (var key : session.loadedKeys())
                if (Objects.equals(key.destinationId(), bundle.destinationId())
                        && (key.purpose().equals("decrypt")
                                        && key.kid().equals(bundle.encryption().kid())
                                || key.purpose().equals("sign")
                                        && key.kid().equals(bundle.signing().kid())))
                    session.discardKey(key);
            generated.remove(id);
        }
    }

    private static List<Selection> selections(
            String owner, AuthenticatedSession session, LocalTestKeys generated) {
        var items = session.archiveKeys();
        var bundles = generated == null ? List.<LocalTestKeys.Summary>of() : generated.list();
        var result = new ArrayList<Selection>();
        for (var item : items) {
            var key = publicKey(item.privateJwk());
            if (item.destinationKey() != null) {
                var reference = item.destinationKey();
                boolean managed =
                        bundles.stream()
                                .anyMatch(
                                        bundle ->
                                                Objects.equals(
                                                                bundle.destinationId(),
                                                                reference.destinationId())
                                                        && (reference.purpose().equals("decrypt")
                                                                        && reference
                                                                                .kid()
                                                                                .equals(
                                                                                        bundle.encryption()
                                                                                                .kid())
                                                                || reference
                                                                                .purpose()
                                                                                .equals("sign")
                                                                        && reference
                                                                                .kid()
                                                                                .equals(
                                                                                        bundle.signing()
                                                                                                .kid())));
                result.add(
                        new Selection(
                                row(
                                        owner,
                                        "imported",
                                        reference.purpose(),
                                        reference.kid(),
                                        reference.destinationId(),
                                        null,
                                        "loaded",
                                        key.fingerprint(),
                                        key.expiresAt(),
                                        managed ? "managed_pair" : null),
                                reference,
                                null,
                                null));
            } else if (item.replyChannel() != null) {
                var reference = item.replyChannel();
                String blocked =
                        switch (reference.status()) {
                            case "pending" -> "pending_operation";
                            case "unresolved" -> "unresolved_operation";
                            default -> null;
                        };
                result.add(
                        new Selection(
                                row(
                                        owner,
                                        "reply",
                                        "reply",
                                        reference.keyId(),
                                        reference.destinationId().toString(),
                                        reference.caseId() == null
                                                ? null
                                                : reference.caseId().toString(),
                                        reference.status(),
                                        key.fingerprint(),
                                        null,
                                        blocked),
                                null,
                                reference.attemptId(),
                                null));
            }
        }
        if (generated != null) {
            var archive = generated.archive();
            for (var bundle : bundles) {
                var keys =
                        archive.stream()
                                .filter(
                                        item ->
                                                item.generatedKey()
                                                        .bundleId()
                                                        .toString()
                                                        .equals(bundle.bundleId()))
                                .toList();
                if (keys.size() != 2) throw error("invalid_resource");
                String fingerprint =
                        keys.stream()
                                .map(item -> publicKey(item.privateJwk()).fingerprint())
                                .sorted()
                                .reduce((a, b) -> a + " / " + b)
                                .orElseThrow();
                String expiry =
                        bundle.encryption().expiresAt().compareTo(bundle.signing().expiresAt()) < 0
                                ? bundle.encryption().expiresAt()
                                : bundle.signing().expiresAt();
                String blocked =
                        switch (bundle.status()) {
                            case "reserved" -> "pending_operation";
                            case "unresolved" -> "unresolved_operation";
                            default -> null;
                        };
                result.add(
                        new Selection(
                                row(
                                        owner,
                                        "generated",
                                        "decrypt+sign",
                                        bundle.encryption().kid() + " / " + bundle.signing().kid(),
                                        bundle.destinationId(),
                                        null,
                                        bundle.status(),
                                        fingerprint,
                                        expiry,
                                        blocked),
                                null,
                                null,
                                UUID.fromString(bundle.bundleId())));
            }
        }
        if (result.size() > 112) throw error("content_limit");
        return List.copyOf(result);
    }

    private static Row row(
            String owner,
            String kind,
            String purpose,
            String kid,
            String destination,
            String caseId,
            String status,
            String fingerprint,
            String expiry,
            String blocked) {
        String identity =
                new Gson()
                        .toJson(
                                List.of(
                                        owner,
                                        kind,
                                        purpose,
                                        kid,
                                        Objects.toString(destination, ""),
                                        fingerprint));
        return new Row(
                identifier(identity),
                kind,
                purpose,
                kid,
                destination,
                caseId,
                status,
                fingerprint,
                expiry,
                blocked == null,
                blocked);
    }

    private static String identifier(String identity) {
        try {
            byte[] hash =
                    MessageDigest.getInstance("SHA-256")
                            .digest(identity.getBytes(StandardCharsets.UTF_8));
            hash[6] = (byte) ((hash[6] & 0x0f) | 0x80);
            hash[8] = (byte) ((hash[8] & 0x3f) | 0x80);
            var bytes = java.nio.ByteBuffer.wrap(hash);
            return new UUID(bytes.getLong(), bytes.getLong()).toString();
        } catch (GeneralSecurityException failure) {
            throw error("key_rejected");
        }
    }

    private static PublicKey publicKey(String document) {
        try {
            var jwk = StrictJson.object(document, 32768);
            var decoder = Base64.getUrlDecoder();
            var rsa =
                    KeyFactory.getInstance("RSA")
                            .generatePublic(
                                    new RSAPublicKeySpec(
                                            new BigInteger(
                                                    1, decoder.decode(jwk.get("n").getAsString())),
                                            new BigInteger(
                                                    1,
                                                    decoder.decode(jwk.get("e").getAsString()))));
            String fingerprint =
                    HexFormat.of()
                            .formatHex(
                                    MessageDigest.getInstance("SHA-256").digest(rsa.getEncoded()));
            String expiry = null;
            if (jwk.has("x5c") && jwk.getAsJsonArray("x5c").size() > 0) {
                byte[] der =
                        Base64.getDecoder().decode(jwk.getAsJsonArray("x5c").get(0).getAsString());
                var certificate =
                        (X509Certificate)
                                CertificateFactory.getInstance("X.509")
                                        .generateCertificate(new ByteArrayInputStream(der));
                expiry = certificate.getNotAfter().toInstant().toString();
            }
            return new PublicKey(fingerprint, expiry);
        } catch (Exception failure) {
            throw error("key_rejected");
        }
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
