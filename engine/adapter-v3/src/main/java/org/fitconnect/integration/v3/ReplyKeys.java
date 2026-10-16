package org.fitconnect.integration.v3;

import com.nimbusds.jose.jwk.JWK;
import org.fitconnect.integration.contract.*;
import java.util.*;

/** SDK-generated ephemeral keys, isolated from registered destination-key imports. */
final class ReplyKeys {
    private record Stored(ReplyChannelReference reference, UUID expectedCase, JWK publicKey, JWK privateKey, SubmissionInput.ReplyOffer offer) {
        @Override public String toString() { return "Stored[private reply key omitted]"; }
    }
    private final Map<UUID, Stored> keys = new LinkedHashMap<>();
    JWK offer(UUID attempt, SubmissionInput input) {
        if (attempt == null || input == null || input.replyOffer() == null) throw error();
        if (keys.containsKey(attempt)) throw new SessionException("send_locked");
        if (keys.size() >= 32) throw new SessionException("content_limit");
        var pair = dev.fitko.fitconnect.sdk.util.EncryptionKeyPairGenerator.generate("reply-key:" + attempt);
        var publicKey = pair.publicKey(); var privateKey = pair.privateKey();
        var reference = new ReplyChannelReference(attempt, input.destinationId(), input.fromDestinationId(), null, null, publicKey.getKeyID(), "pending");
        keys.put(attempt, new Stored(reference, input.caseId(), publicKey, privateKey, input.replyOffer()));
        return publicKey;
    }
    void complete(UUID attempt, UUID caseId, UUID submission, boolean retain) {
        if (attempt == null || (caseId == null) != (submission == null)) throw error();
        var stored = keys.get(attempt);
        if (stored == null) { if (retain) throw error(); return; }
        if (!stored.reference().status().equals("pending")) throw error();
        if (!retain) { keys.remove(attempt); return; }
        if (caseId != null && stored.expectedCase() != null && !stored.expectedCase().equals(caseId)) throw error();
        var previous = stored.reference();
        var reference = new ReplyChannelReference(attempt, previous.destinationId(), previous.fromDestinationId(), caseId, submission,
                previous.keyId(), caseId == null ? "unresolved" : "bound");
        keys.put(attempt, new Stored(reference, stored.expectedCase(), stored.publicKey(), stored.privateKey(), stored.offer()));
    }
    boolean hasBoundCase(UUID caseId) {
        return caseId != null && keys.values().stream().anyMatch(item -> item.reference().status().equals("bound") && caseId.equals(item.reference().caseId()));
    }
    record Selected(ReplyChannelReference reference, com.nimbusds.jose.jwk.RSAKey privateKey, SubmissionInput.ReplyOffer offer) {
        void check(java.net.URI schema, String mimeType) {
            if (!offer.schemaUri().equals(schema) || !offer.mimeType().equals(mimeType)) throw new SessionException("verification_failed");
        }
        @Override public String toString() { return "Selected[private reply key omitted]"; }
    }
    Selected select(UUID caseId, String encryptedMetadata) {
        try {
            if (!hasBoundCase(caseId) || encryptedMetadata == null) throw new SessionException("key_rejected");
            int dot = encryptedMetadata.indexOf('.');
            if (dot < 1 || dot > 16384) throw new SessionException("key_rejected");
            String kid = com.nimbusds.jose.JWEHeader.parse(new com.nimbusds.jose.util.Base64URL(encryptedMetadata.substring(0, dot))).getKeyID();
            var matches = keys.values().stream().filter(item -> item.reference().status().equals("bound")
                    && caseId.equals(item.reference().caseId()) && Objects.equals(kid, item.reference().keyId())).toList();
            if (matches.size() != 1) throw new SessionException("key_rejected");
            var item = matches.getFirst();
            return new Selected(item.reference(), item.privateKey().toRSAKey(), item.offer());
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("key_rejected"); }
    }
    List<ReplyChannelReference> references() { return keys.values().stream().map(Stored::reference).toList(); }
    void clear() { keys.clear(); }
    private static SessionException error() { return new SessionException("invalid_resource"); }
}

