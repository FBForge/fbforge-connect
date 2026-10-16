package org.fitconnect.integration.v3;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jose.jwk.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.*;
import org.fitconnect.integration.contract.KeyReference;
import org.fitconnect.integration.contract.SessionException;

/** Session-owned private keys. Registration and certificate eligibility are checked by the host. */
final class PrivateKeys {
    private final Map<KeyReference, RSAKey> keys = new LinkedHashMap<>();

    KeyReference importKey(String destinationId, String purpose, String document, List<String> eligiblePublicJwks) {
        try {
            UUID.fromString(destinationId);
            boolean decrypt = "decrypt".equals(purpose);
            if (!decrypt && !"sign".equals(purpose)) throw rejected();
            if (document == null || document.getBytes(StandardCharsets.UTF_8).length > 32768) throw rejected();
            RSAKey supplied = parse(document);
            if (!supplied.isPrivate() || supplied.size() < 4096 || supplied.size() > 8192) throw rejected();
            checkPurpose(supplied, decrypt, true);
            List<RSAKey> matches = new ArrayList<>();
            for (String encoded : eligiblePublicJwks) {
                JWK candidate = JWK.parse(encoded);
                if (!(candidate instanceof RSAKey registered) || registered.isPrivate()) throw rejected();
                if (supplied.getModulus().equals(registered.getModulus())
                        && supplied.getPublicExponent().equals(registered.getPublicExponent())) {
                    checkPurpose(registered, decrypt, false);
                    matches.add(registered);
                }
            }
            if (matches.size() != 1) throw rejected();
            RSAKey registered = matches.getFirst();
            String kid = registered.getKeyID();
            if (kid == null || kid.isBlank() || kid.length() > 512) throw rejected();
            if (supplied.getKeyID() != null && !kid.equals(supplied.getKeyID())) throw rejected();
            if (supplied.getX509CertChain() != null
                    && !supplied.getX509CertChain().equals(registered.getX509CertChain())) throw rejected();
            prove(supplied, registered, decrypt);
            RSAKey stored = new RSAKey.Builder(supplied).keyID(kid)
                    .x509CertChain(registered.getX509CertChain())
                    .keyOperations(Set.of(decrypt ? KeyOperation.UNWRAP_KEY : KeyOperation.SIGN)).build();
            KeyReference reference = new KeyReference(destinationId, kid, purpose);
            if (!keys.containsKey(reference) && keys.size() >= 16) throw rejected();
            keys.put(reference, stored);
            return reference;
        } catch (Exception e) {
            throw rejected();
        }
    }

    private static RSAKey parse(String document) throws Exception {
        String value = document.strip();
        if (value.startsWith("-----BEGIN PRIVATE KEY-----")) {
            String begin = "-----BEGIN PRIVATE KEY-----";
            String end = "-----END PRIVATE KEY-----";
            if (!value.endsWith(end)) throw rejected();
            String base64 = value.substring(begin.length(), value.length() - end.length()).replaceAll("\\s", "");
            byte[] encoded = Base64.getDecoder().decode(base64);
            try {
                var factory = KeyFactory.getInstance("RSA");
                if (!(factory.generatePrivate(new PKCS8EncodedKeySpec(encoded)) instanceof RSAPrivateCrtKey privateKey)) throw rejected();
                RSAPublicKey publicKey = (RSAPublicKey) factory.generatePublic(
                        new RSAPublicKeySpec(privateKey.getModulus(), privateKey.getPublicExponent()));
                return new RSAKey.Builder(publicKey).privateKey(privateKey).build();
            } finally { Arrays.fill(encoded, (byte) 0); }
        }
        Map<String, Object> object = com.nimbusds.jose.util.JSONObjectUtils.parse(value);
        if (object.containsKey("keys")) {
            if (object.size() != 1) throw rejected();
            JWKSet set = JWKSet.parse(object);
            if (set.getKeys().size() != 1 || !(set.getKeys().getFirst() instanceof RSAKey rsa)) throw rejected();
            return rsa;
        }
        if (!(JWK.parse(object) instanceof RSAKey rsa)) throw rejected();
        return rsa;
    }

    private static void checkPurpose(RSAKey key, boolean decrypt, boolean privateKey) {
        if (key.getKeyUse() != null && !key.getKeyUse().equals(decrypt ? KeyUse.ENCRYPTION : KeyUse.SIGNATURE)) throw rejected();
        if (key.getAlgorithm() != null && !key.getAlgorithm().getName().equals(decrypt ? "RSA-OAEP-256" : "PS512")) throw rejected();
        Set<KeyOperation> operations = key.getKeyOperations();
        Set<KeyOperation> allowed = decrypt
                ? (privateKey ? Set.of(KeyOperation.UNWRAP_KEY, KeyOperation.DECRYPT) : Set.of(KeyOperation.WRAP_KEY, KeyOperation.ENCRYPT))
                : (privateKey ? Set.of(KeyOperation.SIGN) : Set.of(KeyOperation.VERIFY));
        if (operations != null && (operations.isEmpty() || !allowed.containsAll(operations))) throw rejected();
    }

    private static void prove(RSAKey supplied, RSAKey registered, boolean decrypt) throws Exception {
        String challenge = UUID.randomUUID().toString();
        if (decrypt) {
            JWEObject encrypted = new JWEObject(new JWEHeader(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM), new Payload(challenge));
            encrypted.encrypt(new RSAEncrypter(registered.toRSAPublicKey()));
            encrypted.decrypt(new RSADecrypter(supplied.toRSAPrivateKey()));
            if (!challenge.equals(encrypted.getPayload().toString())) throw rejected();
        } else {
            JWSObject signed = new JWSObject(new JWSHeader(JWSAlgorithm.PS512), new Payload(challenge));
            signed.sign(new RSASSASigner(supplied.toRSAPrivateKey()));
            if (!signed.verify(new RSASSAVerifier(registered.toRSAPublicKey()))) throw rejected();
        }
    }

    List<KeyReference> references() { return List.copyOf(keys.keySet()); }
    void retainRegistered(String destination, List<String> registrations) {
        try {
            if (registrations == null || registrations.size() > 128) throw rejected();
            var current = new ArrayList<RSAKey>();
            for (String value : registrations) current.add(RSAKey.parse(value));
            keys.entrySet().removeIf(entry -> entry.getKey().destinationId().equals(destination) && current.stream().noneMatch(key -> {
                var loaded = entry.getValue();
                String purpose = entry.getKey().purpose();
                return !key.isPrivate() && Objects.equals(key.getKeyID(), loaded.getKeyID())
                        && ("decrypt".equals(purpose) ? JWEAlgorithm.RSA_OAEP_256 : JWSAlgorithm.PS512).equals(key.getAlgorithm())
                        && key.getModulus().equals(loaded.getModulus()) && key.getPublicExponent().equals(loaded.getPublicExponent())
                        && Objects.equals(key.getX509CertChain(), loaded.getX509CertChain());
            }));
        } catch (Exception failure) { keys.entrySet().removeIf(entry -> entry.getKey().destinationId().equals(destination)); throw rejected(); }
    }
    List<RSAKey> decryptionKeys(String destination) {
        var selected = keys.entrySet().stream().filter(value -> value.getKey().destinationId().equals(destination)
                && value.getKey().purpose().equals("decrypt")).map(Map.Entry::getValue).toList();
        try {
            for (var key : selected) {
                var chain = key.getParsedX509CertChain();
                if (chain == null || chain.size() != 1) throw rejected();
                chain.getFirst().checkValidity();
            }
            return selected;
        } catch (Exception failure) { throw rejected(); }
    }
    void clear() { keys.clear(); }
    RSAKey signingKey(String destination, String kid) {
        var selected = keys.entrySet().stream().filter(value -> value.getKey().destinationId().equals(destination)
                && value.getKey().purpose().equals("sign") && (kid == null || value.getKey().kid().equals(kid))).map(Map.Entry::getValue).toList();
        if (selected.size() != 1) throw rejected();
        try {
            var chain = selected.getFirst().getParsedX509CertChain();
            if (chain == null || chain.size() != 1) throw rejected();
            chain.getFirst().checkValidity();
            return selected.getFirst();
        } catch (Exception failure) { throw rejected(); }
    }
    private static SessionException rejected() { return new SessionException("key_rejected"); }
}
