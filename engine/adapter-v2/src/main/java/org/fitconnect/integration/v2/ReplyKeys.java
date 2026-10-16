package org.fitconnect.integration.v2;

import com.nimbusds.jose.jwk.JWK;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK-generated ephemeral keys, isolated from registered destination-key imports. */
final class ReplyKeys {
    private record Stored(
            ReplyChannelReference reference,
            UUID expectedCase,
            JWK publicKey,
            JWK privateKey,
            SubmissionInput.ReplyOffer offer) {
        @Override
        public String toString() {
            return "Stored[private reply key omitted]";
        }
    }

    private final Map<UUID, Stored> keys = new LinkedHashMap<>();

    JWK offer(UUID attempt, SubmissionInput input) {
        if (attempt == null || input == null || input.replyOffer() == null) throw error();
        if (keys.containsKey(attempt)) {
            var stored = keys.get(attempt);
            if (!stored.reference().status().equals("pending")
                    || !stored.reference().destinationId().equals(input.destinationId())
                    || !Objects.equals(
                            stored.reference().fromDestinationId(), input.fromDestinationId())
                    || !Objects.equals(stored.expectedCase(), input.caseId())
                    || !stored.offer().equals(input.replyOffer()))
                throw new SessionException("send_locked");
            return stored.publicKey();
        }
        if (keys.size() >= 32) throw new SessionException("content_limit");
        var pair =
                dev.fitko.fitconnect.client.util.ReplyChannelKeyGenerator.generateKeyPair(attempt);
        var publicKey = pair.getPublicKey();
        var privateKey = pair.getPrivateKey();
        var reference =
                new ReplyChannelReference(
                        attempt,
                        input.destinationId(),
                        input.fromDestinationId(),
                        null,
                        null,
                        publicKey.getKeyID(),
                        "pending");
        keys.put(
                attempt,
                new Stored(reference, input.caseId(), publicKey, privateKey, input.replyOffer()));
        return publicKey;
    }

    void complete(UUID attempt, UUID caseId, UUID submission, boolean retain) {
        if (attempt == null || (caseId == null) != (submission == null)) throw error();
        var stored = keys.get(attempt);
        if (stored == null) {
            if (retain) throw error();
            return;
        }
        if (!stored.reference().status().equals("pending")) throw error();
        if (!retain) {
            keys.remove(attempt);
            return;
        }
        if (caseId != null
                && stored.expectedCase() != null
                && !stored.expectedCase().equals(caseId)) throw error();
        var previous = stored.reference();
        var reference =
                new ReplyChannelReference(
                        attempt,
                        previous.destinationId(),
                        previous.fromDestinationId(),
                        caseId,
                        submission,
                        previous.keyId(),
                        caseId == null ? "unresolved" : "bound");
        keys.put(
                attempt,
                new Stored(
                        reference,
                        stored.expectedCase(),
                        stored.publicKey(),
                        stored.privateKey(),
                        stored.offer()));
    }

    private static boolean bound(ReplyChannelReference reference) {
        return Set.of("bound", "recovered").contains(reference.status());
    }

    private static boolean candidate(Stored item, UUID caseId) {
        return bound(item.reference()) && caseId.equals(item.reference().caseId())
                || item.reference().status().equals("unresolved")
                        && (item.expectedCase() == null || item.expectedCase().equals(caseId));
    }

    boolean canReceiveCase(UUID caseId) {
        return caseId != null && keys.values().stream().anyMatch(item -> candidate(item, caseId));
    }

    /**
     * Called only after full native decryption, signed event/tag checks and content construction.
     */
    void recover(Selected selected, UUID caseId) {
        var item = keys.get(selected.reference().attemptId());
        if (item == null
                || !item.reference().equals(selected.reference())
                || !candidate(item, caseId)) throw error();
        if (bound(item.reference())) return;
        var previous = item.reference();
        var reference =
                new ReplyChannelReference(
                        previous.attemptId(),
                        previous.destinationId(),
                        previous.fromDestinationId(),
                        caseId,
                        null,
                        previous.keyId(),
                        "recovered");
        keys.put(
                reference.attemptId(),
                new Stored(
                        reference,
                        item.expectedCase(),
                        item.publicKey(),
                        item.privateKey(),
                        item.offer()));
    }

    record Selected(
            ReplyChannelReference reference,
            com.nimbusds.jose.jwk.RSAKey privateKey,
            SubmissionInput.ReplyOffer offer) {
        void check(java.net.URI schema, String mimeType) {
            if (!offer.schemaUri().equals(schema) || !offer.mimeType().equals(mimeType))
                throw new SessionException("verification_failed");
        }

        @Override
        public String toString() {
            return "Selected[private reply key omitted]";
        }
    }

    Selected select(UUID caseId, String encryptedMetadata) {
        try {
            if (!canReceiveCase(caseId) || encryptedMetadata == null)
                throw new SessionException("key_rejected");
            int dot = encryptedMetadata.indexOf('.');
            if (dot < 1 || dot > 16384) throw new SessionException("key_rejected");
            String kid =
                    com.nimbusds.jose.JWEHeader.parse(
                                    new com.nimbusds.jose.util.Base64URL(
                                            encryptedMetadata.substring(0, dot)))
                            .getKeyID();
            var matches =
                    keys.values().stream()
                            .filter(
                                    item ->
                                            candidate(item, caseId)
                                                    && Objects.equals(
                                                            kid, item.reference().keyId()))
                            .toList();
            if (matches.size() != 1) throw new SessionException("key_rejected");
            var item = matches.getFirst();
            return new Selected(item.reference(), item.privateKey().toRSAKey(), item.offer());
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("key_rejected");
        }
    }

    List<SessionKeyArchive> archive() {
        return keys.values().stream()
                .map(
                        item ->
                                new SessionKeyArchive(
                                        null,
                                        item.reference(),
                                        item.expectedCase(),
                                        item.privateKey().toJSONString(),
                                        item.offer().schemaUri(),
                                        item.offer().mimeType(),
                                        null,
                                        item.offer().processMessages()))
                .toList();
    }

    void restore(SessionKeyArchive item) {
        try {
            if (item == null || item.replyChannel() == null || keys.size() >= 32) throw error();
            var reference = item.replyChannel();
            if (keys.containsKey(reference.attemptId())) throw error();
            var key = com.nimbusds.jose.jwk.RSAKey.parse(item.privateJwk());
            if (!key.isPrivate()
                    || key.size() != 4096
                    || !Objects.equals(reference.keyId(), key.getKeyID())
                    || !reference.keyId().equals("reply-key:" + reference.attemptId())
                    || key.getAlgorithm() != null
                            && !key.getAlgorithm().getName().equals("RSA-OAEP-256")
                    || key.getKeyUse() != null
                            && !key.getKeyUse().equals(com.nimbusds.jose.jwk.KeyUse.ENCRYPTION))
                throw error();
            // Validate the actual key pair, rather than trusting serialized private CRT components.
            var challenge =
                    new com.nimbusds.jose.JWEObject(
                            new com.nimbusds.jose.JWEHeader(
                                    com.nimbusds.jose.JWEAlgorithm.RSA_OAEP_256,
                                    com.nimbusds.jose.EncryptionMethod.A256GCM),
                            new com.nimbusds.jose.Payload("restore:" + reference.attemptId()));
            challenge.encrypt(new com.nimbusds.jose.crypto.RSAEncrypter(key.toRSAPublicKey()));
            challenge.decrypt(new com.nimbusds.jose.crypto.RSADecrypter(key.toRSAPrivateKey()));
            if (!challenge.getPayload().toString().equals("restore:" + reference.attemptId()))
                throw error();
            // A pending write from a previous process is unresolved, never resumed automatically.
            if (reference.status().equals("pending"))
                reference =
                        new ReplyChannelReference(
                                reference.attemptId(),
                                reference.destinationId(),
                                reference.fromDestinationId(),
                                null,
                                null,
                                reference.keyId(),
                                "unresolved");
            keys.put(
                    reference.attemptId(),
                    new Stored(
                            reference,
                            item.expectedCase(),
                            key.toPublicJWK(),
                            key,
                            new SubmissionInput.ReplyOffer(
                                    item.schemaUri(), item.mimeType(), item.replyMessages())));
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("key_rejected");
        }
    }

    List<ReplyChannelReference> references() {
        return keys.values().stream().map(Stored::reference).toList();
    }

    void clear() {
        keys.clear();
    }

    private static SessionException error() {
        return new SessionException("invalid_resource");
    }
}
