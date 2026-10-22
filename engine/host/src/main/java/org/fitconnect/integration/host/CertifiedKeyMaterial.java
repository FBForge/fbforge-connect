package org.fitconnect.integration.host;

import com.google.gson.*;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.*;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Converts local PKCS#12 or private JWK material. Trust is granted only by the SDK afterwards. */
final class CertifiedKeyMaterial {
    static GeneratedTestKey parse(JsonObject source, String purpose) {
        try {
            String format = source.get("format").getAsString();
            JsonObject privateKey;
            if (format.equals("pkcs12")) privateKey = pkcs12(source);
            else if (format.equals("jwk")) {
                if (!source.keySet().equals(Set.of("format", "content"))) throw rejected();
                privateKey = StrictJson.object(source.get("content").getAsString(), 32768);
                if (privateKey.has("keys")) {
                    if (privateKey.size() != 1 || privateKey.getAsJsonArray("keys").size() != 1)
                        throw rejected();
                    privateKey = privateKey.getAsJsonArray("keys").get(0).getAsJsonObject();
                }
                if (!privateKey.has("d") || !"RSA".equals(privateKey.get("kty").getAsString()))
                    throw rejected();
                privateKey = privateKey.deepCopy();
            } else throw rejected();
            boolean decrypt = purpose.equals("decrypt");
            if (!decrypt && !purpose.equals("sign")) throw rejected();
            String algorithm = decrypt ? "RSA-OAEP-256" : "PS512";
            if (privateKey.has("alg") && !algorithm.equals(privateKey.get("alg").getAsString()))
                throw rejected();
            privateKey.addProperty("kid", UUID.randomUUID().toString());
            privateKey.addProperty("alg", algorithm);
            privateKey.remove("use");
            privateKey.add("key_ops", new JsonArray());
            privateKey.getAsJsonArray("key_ops").add(decrypt ? "unwrapKey" : "sign");
            var publicKey = new JsonObject();
            for (String field : List.of("kty", "alg", "kid", "n", "e", "x5c")) {
                if (!privateKey.has(field)) throw rejected();
                publicKey.add(field, privateKey.get(field).deepCopy());
            }
            var operations = new JsonArray();
            operations.add(decrypt ? "wrapKey" : "verify");
            publicKey.add("key_ops", operations);
            return new GeneratedTestKey(publicKey.toString(), privateKey.toString());
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw rejected();
        }
    }

    static String normalizeRegistered(String document, String purpose) {
        var source = StrictJson.object(document, 32768);
        if (!source.has("format")) return document;
        // Purpose is explicit for PKCS#12 imports. The SDK matches the registered RSA modulus.
        if (!Set.of("decrypt", "sign").contains(purpose)) throw rejected();
        var key = StrictJson.object(parse(source, purpose).privateJwk(), 32768);
        key.remove("kid");
        return key.toString();
    }

    private static JsonObject pkcs12(JsonObject source) throws Exception {
        if (!source.keySet().equals(Set.of("format", "content", "password"))) throw rejected();
        String encoded = source.get("content").getAsString();
        String pass = source.get("password").getAsString();
        if (encoded.length() > 44000 || pass.length() > 1024) throw rejected();
        byte[] bytes = Base64.getDecoder().decode(encoded);
        char[] password = pass.toCharArray();
        try {
            var store = KeyStore.getInstance("PKCS12");
            store.load(new ByteArrayInputStream(bytes), password);
            if (store.size() > 32) throw rejected();
            var aliases =
                    Collections.list(store.aliases()).stream()
                            .filter(
                                    alias -> {
                                        try {
                                            return store.isKeyEntry(alias);
                                        } catch (KeyStoreException failure) {
                                            return false;
                                        }
                                    })
                            .toList();
            if (aliases.size() != 1
                    || !(store.getKey(aliases.getFirst(), password) instanceof RSAPrivateCrtKey key)
                    || key.getModulus().bitLength() < 4096
                    || key.getModulus().bitLength() > 8192) throw rejected();
            var chain = store.getCertificateChain(aliases.getFirst());
            if (chain == null || chain.length < 1 || chain.length > 8) throw rejected();
            var result = new JsonObject();
            result.addProperty("kty", "RSA");
            String[] fields = {"n", "e", "d", "p", "q", "dp", "dq", "qi"};
            BigInteger[] values = {
                key.getModulus(),
                key.getPublicExponent(),
                key.getPrivateExponent(),
                key.getPrimeP(),
                key.getPrimeQ(),
                key.getPrimeExponentP(),
                key.getPrimeExponentQ(),
                key.getCrtCoefficient()
            };
            for (int i = 0; i < fields.length; i++)
                result.addProperty(fields[i], unsigned(values[i]));
            var certificates = new JsonArray();
            for (var certificate : chain) {
                if (!(certificate instanceof X509Certificate)) throw rejected();
                certificates.add(Base64.getEncoder().encodeToString(certificate.getEncoded()));
            }
            result.add("x5c", certificates);
            return result;
        } finally {
            Arrays.fill(bytes, (byte) 0);
            Arrays.fill(password, '\0');
        }
    }

    private static String unsigned(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes[0] == 0) bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static SessionException rejected() {
        return new SessionException("key_rejected");
    }

    private CertifiedKeyMaterial() {}
}
