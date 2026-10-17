package org.fitconnect.integration.v2;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jose.jwk.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.SecureRandom;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Session-owned SDK key objects. Only public references leave this adapter. */
final class PrivateKeys {
    private record Stored(KeyReference reference, RSAKey key) {}

    private final Map<KeyReference, Stored> keys = new LinkedHashMap<>();
    private final ObjectMapper json =
            new ObjectMapper()
                    .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                    .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    KeyReference add(
            String destination, String purpose, String document, List<String> registrations) {
        try {
            if (!("decrypt".equals(purpose) || "sign".equals(purpose))
                    || document == null
                    || document.getBytes(StandardCharsets.UTF_8).length > 32768
                    || registrations == null
                    || registrations.isEmpty()
                    || registrations.size() > 1000) throw rejected();
            RSAKey privateKey = parse(document);
            if (!privateKey.isPrivate() || privateKey.size() < 4096 || privateKey.size() > 8192)
                throw rejected();
            validatePurpose(privateKey, purpose, true);
            List<RSAKey> matches = new ArrayList<>();
            for (String registration : registrations) {
                RSAKey registered = RSAKey.parse(registration);
                if (registered.isPrivate()) throw rejected();
                if (registered.getModulus().equals(privateKey.getModulus())
                        && registered.getPublicExponent().equals(privateKey.getPublicExponent()))
                    matches.add(registered);
            }
            if (matches.size() != 1) throw rejected();
            RSAKey registered = matches.getFirst();
            validatePurpose(registered, purpose, false);
            String kid = registered.getKeyID();
            if (kid == null
                    || kid.isBlank()
                    || kid.length() > 512
                    || (privateKey.getKeyID() != null && !kid.equals(privateKey.getKeyID())))
                throw rejected();
            if (privateKey.getX509CertChain() != null
                    && !privateKey.getX509CertChain().equals(registered.getX509CertChain()))
                throw rejected();
            prove(privateKey, registered, purpose);
            KeyReference reference = new KeyReference(destination, kid, purpose);
            if (!keys.containsKey(reference) && keys.size() >= 16) throw rejected();
            RSAKey normalized =
                    new RSAKey.Builder(privateKey)
                            .keyID(kid)
                            .x509CertChain(registered.getX509CertChain())
                            .keyOperations(
                                    Set.of(
                                            "decrypt".equals(purpose)
                                                    ? KeyOperation.UNWRAP_KEY
                                                    : KeyOperation.SIGN))
                            .build();
            keys.put(reference, new Stored(reference, normalized));
            return reference;
        } catch (Exception e) {
            throw rejected();
        }
    }

    private RSAKey parse(String document) throws Exception {
        String text = document.trim();
        if (text.startsWith("-----BEGIN PRIVATE KEY-----")) {
            if (!text.endsWith("-----END PRIVATE KEY-----")) throw rejected();
            String encoded =
                    text.substring(
                                    "-----BEGIN PRIVATE KEY-----".length(),
                                    text.length() - "-----END PRIVATE KEY-----".length())
                            .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(encoded);
            try {
                var key =
                        KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
                if (!(key instanceof RSAPrivateCrtKey rsa)) throw rejected();
                return new RSAKey.Builder(
                                com.nimbusds.jose.util.Base64URL.encode(rsa.getModulus()),
                                com.nimbusds.jose.util.Base64URL.encode(rsa.getPublicExponent()))
                        .privateKey(rsa)
                        .build();
            } finally {
                Arrays.fill(der, (byte) 0);
            }
        }
        var node = json.readTree(text);
        if (node == null || !node.isObject()) throw rejected();
        if (node.has("keys")) {
            if (node.size() != 1 || !node.get("keys").isArray() || node.get("keys").size() != 1)
                throw rejected();
            node = node.get("keys").get(0);
        }
        return RSAKey.parse(json.writeValueAsString(node));
    }

    private static void validatePurpose(RSAKey key, String purpose, boolean privateKey) {
        boolean decrypt = "decrypt".equals(purpose);
        String algorithm = decrypt ? "RSA-OAEP-256" : "PS512";
        if (key.getAlgorithm() != null && !algorithm.equals(key.getAlgorithm().getName()))
            throw rejected();
        if (key.getKeyUse() != null
                && !(decrypt ? KeyUse.ENCRYPTION : KeyUse.SIGNATURE).equals(key.getKeyUse()))
            throw rejected();
        Set<KeyOperation> allowed =
                decrypt
                        ? (privateKey
                                ? Set.of(KeyOperation.UNWRAP_KEY, KeyOperation.DECRYPT)
                                : Set.of(KeyOperation.WRAP_KEY, KeyOperation.ENCRYPT))
                        : (privateKey ? Set.of(KeyOperation.SIGN) : Set.of(KeyOperation.VERIFY));
        if (key.getKeyOperations() != null
                && (key.getKeyOperations().isEmpty()
                        || !allowed.containsAll(key.getKeyOperations()))) throw rejected();
    }

    private static void prove(RSAKey privateKey, RSAKey registered, String purpose)
            throws Exception {
        byte[] probe = new byte[32];
        new SecureRandom().nextBytes(probe);
        try {
            if ("decrypt".equals(purpose)) {
                var encrypted =
                        new JWEObject(
                                new JWEHeader(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM),
                                new Payload(probe));
                encrypted.encrypt(new RSAEncrypter(registered.toRSAPublicKey()));
                var decrypted = JWEObject.parse(encrypted.serialize());
                decrypted.decrypt(new RSADecrypter(privateKey.toRSAPrivateKey()));
                if (!Arrays.equals(probe, decrypted.getPayload().toBytes())) throw rejected();
            } else {
                var signed = new JWSObject(new JWSHeader(JWSAlgorithm.PS512), new Payload(probe));
                signed.sign(new RSASSASigner(privateKey.toRSAPrivateKey()));
                if (!signed.verify(new RSASSAVerifier(registered.toRSAPublicKey())))
                    throw rejected();
            }
        } finally {
            Arrays.fill(probe, (byte) 0);
        }
    }

    List<org.fitconnect.integration.contract.SessionKeyArchive> archive() {
        return keys.entrySet().stream()
                .map(
                        item ->
                                new org.fitconnect.integration.contract.SessionKeyArchive(
                                        item.getKey(),
                                        null,
                                        null,
                                        item.getValue().key().toJSONString(),
                                        null,
                                        null))
                .toList();
    }

    List<KeyReference> references() {
        return List.copyOf(keys.keySet());
    }

    void retainRegistered(String destination, List<String> registrations) {
        try {
            if (registrations == null || registrations.size() > 128) throw rejected();
            var current = new ArrayList<RSAKey>();
            for (String value : registrations) current.add(RSAKey.parse(value));
            keys.entrySet()
                    .removeIf(
                            entry ->
                                    entry.getKey().destinationId().equals(destination)
                                            && current.stream()
                                                    .noneMatch(
                                                            key -> {
                                                                var loaded = entry.getValue().key();
                                                                String purpose =
                                                                        entry.getKey().purpose();
                                                                return !key.isPrivate()
                                                                        && Objects.equals(
                                                                                key.getKeyID(),
                                                                                loaded.getKeyID())
                                                                        && ("decrypt"
                                                                                                .equals(
                                                                                                        purpose)
                                                                                        ? JWEAlgorithm
                                                                                                .RSA_OAEP_256
                                                                                        : JWSAlgorithm
                                                                                                .PS512)
                                                                                .equals(
                                                                                        key
                                                                                                .getAlgorithm())
                                                                        && key.getModulus()
                                                                                .equals(
                                                                                        loaded
                                                                                                .getModulus())
                                                                        && key.getPublicExponent()
                                                                                .equals(
                                                                                        loaded
                                                                                                .getPublicExponent())
                                                                        && Objects.equals(
                                                                                key
                                                                                        .getX509CertChain(),
                                                                                loaded
                                                                                        .getX509CertChain());
                                                            }));
        } catch (Exception failure) {
            keys.entrySet().removeIf(entry -> entry.getKey().destinationId().equals(destination));
            throw rejected();
        }
    }

    List<RSAKey> decryptionKeys(String destination) {
        var selected =
                keys.values().stream()
                        .filter(
                                value ->
                                        value.reference().destinationId().equals(destination)
                                                && value.reference().purpose().equals("decrypt"))
                        .map(Stored::key)
                        .toList();
        try {
            for (var key : selected) {
                var chain = key.getParsedX509CertChain();
                if (chain == null || chain.size() != 1) throw rejected();
                chain.getFirst().checkValidity();
            }
            return selected;
        } catch (Exception failure) {
            throw rejected();
        }
    }

    void discardDestination(String destination) {
        keys.keySet().removeIf(key -> key.destinationId().equals(destination));
    }

    void clear() {
        keys.clear();
    }

    RSAKey signingKey(String destination, String kid) {
        var selected =
                keys.values().stream()
                        .filter(
                                value ->
                                        value.reference().destinationId().equals(destination)
                                                && value.reference().purpose().equals("sign")
                                                && (kid == null
                                                        || value.reference().kid().equals(kid)))
                        .map(Stored::key)
                        .toList();
        if (selected.size() != 1) throw rejected();
        try {
            var chain = selected.getFirst().getParsedX509CertChain();
            if (chain == null || chain.size() != 1) throw rejected();
            chain.getFirst().checkValidity();
            return selected.getFirst();
        } catch (Exception failure) {
            throw rejected();
        }
    }

    private static SessionException rejected() {
        return new SessionException("key_rejected");
    }
}
