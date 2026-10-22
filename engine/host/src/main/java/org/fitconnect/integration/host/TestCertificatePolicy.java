package org.fitconnect.integration.host;

import com.google.gson.*;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.cert.*;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.*;
import java.util.function.BiConsumer;
import org.fitconnect.integration.contract.IntegrationEnvironment;

/**
 * Structural guard for registered destination certificates. The SDK verifier must additionally
 * approve V-PKI trust and revocation in STAGE and PROD. Registrations come from the selected API.
 * Temporary reply keys have a separate lifecycle and must not pass through this guard.
 */
final class TestCertificatePolicy {
    enum Purpose {
        ENCRYPTION("RSA-OAEP-256", "wrapKey", "enc", 2),
        SIGNING("PS512", "verify", "sig", 0);
        final String algorithm, operation, use;
        final int usageBit;

        Purpose(String algorithm, String operation, String use, int usageBit) {
            this.algorithm = algorithm;
            this.operation = operation;
            this.use = use;
            this.usageBit = usageBit;
        }
    }

    record ValidatedKey(
            String kid,
            Purpose purpose,
            RSAPublicKey publicKey,
            String certificateSha256,
            Instant expiresAt) {}

    static final class Rejected extends RuntimeException {
        private Rejected() {
            super(
                    IntegrationEnvironment.current().requiresVpki()
                            ? "vpki_certificate_required"
                            : "test_certificate_required");
        }
    }

    private static final Set<String> PRIVATE_FIELDS =
            Set.of("d", "p", "q", "dp", "dq", "qi", "oth", "k");
    private static final Set<String> SIGNATURE_OIDS =
            Set.of(
                    "1.2.840.113549.1.1.11",
                    "1.2.840.113549.1.1.12",
                    "1.2.840.113549.1.1.13"); // RSA with SHA-256/384/512
    private static final int MAX_CERTIFICATE_BASE64 = 48 * 1024;

    static ValidatedKey validate(JsonObject key, Purpose purpose, Instant at) {
        return validate(
                key,
                purpose,
                at,
                (document, operation) -> {
                    if (IntegrationEnvironment.current().requiresVpki()) throw new Rejected();
                });
    }

    static ValidatedKey validate(
            JsonObject key, Purpose purpose, Instant at, BiConsumer<String, String> verifier) {
        var accepted = inspect(key, purpose, at);
        verifier.accept(key.toString(), purpose == Purpose.ENCRYPTION ? "decrypt" : "sign");
        return accepted;
    }

    /** Identity only, for already SDK-validated material. Never grants eligibility. */
    static ValidatedKey inspect(JsonObject key, Purpose purpose, Instant at) {
        try {
            if (key == null
                    || purpose == null
                    || at == null
                    || PRIVATE_FIELDS.stream().anyMatch(key::has)
                    || !"RSA".equals(string(key.get("kty")))
                    || !purpose.algorithm.equals(string(key.get("alg")))) throw new Rejected();
            String kid = string(key.get("kid"));
            if (kid.isBlank()
                    || kid.length() > 512
                    || kid.chars().anyMatch(Character::isISOControl)) throw new Rejected();
            if (key.has("use") && !purpose.use.equals(string(key.get("use")))) throw new Rejected();
            JsonElement operations = key.get("key_ops");
            if (operations == null
                    || !operations.isJsonArray()
                    || operations.getAsJsonArray().size() != 1
                    || !purpose.operation.equals(string(operations.getAsJsonArray().get(0))))
                throw new Rejected();

            JsonElement chain = key.get("x5c");
            if (chain == null
                    || !chain.isJsonArray()
                    || chain.getAsJsonArray().isEmpty()
                    || chain.getAsJsonArray().size()
                            > (IntegrationEnvironment.current().requiresVpki() ? 8 : 1))
                throw new Rejected();
            X509Certificate previous = null;
            for (var member : chain.getAsJsonArray()) {
                var parsed = certificate(string(member), at);
                if (previous != null) {
                    if (parsed.getBasicConstraints() < 0
                            || !previous.getIssuerX500Principal()
                                    .equals(parsed.getSubjectX500Principal())) throw new Rejected();
                    previous.verify(parsed.getPublicKey());
                }
                previous = parsed;
            }
            String encoded = string(chain.getAsJsonArray().get(0));
            if (encoded.isEmpty() || encoded.length() > MAX_CERTIFICATE_BASE64)
                throw new Rejected();
            byte[] der = Base64.getDecoder().decode(encoded);
            if (!Base64.getEncoder().encodeToString(der).equals(encoded)) throw new Rejected();
            var input = new ByteArrayInputStream(der);
            var certificate =
                    (X509Certificate)
                            CertificateFactory.getInstance("X.509").generateCertificate(input);
            // A factory may accept PEM or consume just the first certificate. Require exactly one
            // DER object.
            if (input.available() != 0 || !Arrays.equals(der, certificate.getEncoded()))
                throw new Rejected();
            certificate.checkValidity(Date.from(at));
            if (certificate.getBasicConstraints() != -1
                    || certificate.hasUnsupportedCriticalExtension()
                    || (!IntegrationEnvironment.current().requiresVpki()
                            && !SIGNATURE_OIDS.contains(certificate.getSigAlgOID())))
                throw new Rejected();
            if (!(certificate.getPublicKey() instanceof RSAPublicKey rsa)
                    || rsa.getModulus().bitLength() < 4096
                    || rsa.getModulus().bitLength() > 8192
                    || !BigInteger.valueOf(65537).equals(rsa.getPublicExponent()))
                throw new Rejected();
            boolean[] usage = certificate.getKeyUsage();
            if (usage != null && (usage.length <= purpose.usageBit || !usage[purpose.usageBit]))
                throw new Rejected();
            if (!rsa.getModulus().equals(unsigned(key.get("n")))
                    || !rsa.getPublicExponent().equals(unsigned(key.get("e"))))
                throw new Rejected();
            if (!IntegrationEnvironment.current().requiresVpki()) {
                if (!certificate
                        .getSubjectX500Principal()
                        .equals(certificate.getIssuerX500Principal())) throw new Rejected();
                certificate.verify(rsa);
            }
            String fingerprint =
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(der));
            return new ValidatedKey(
                    kid, purpose, rsa, fingerprint, certificate.getNotAfter().toInstant());
        } catch (Rejected e) {
            throw e;
        } catch (Exception e) {
            throw new Rejected();
        } // No supplied values or parser errors cross this boundary.
    }

    private static X509Certificate certificate(String encoded, Instant at) throws Exception {
        if (encoded.isEmpty() || encoded.length() > MAX_CERTIFICATE_BASE64) throw new Rejected();
        byte[] der = Base64.getDecoder().decode(encoded);
        if (!Base64.getEncoder().encodeToString(der).equals(encoded)) throw new Rejected();
        var input = new ByteArrayInputStream(der);
        var certificate =
                (X509Certificate)
                        CertificateFactory.getInstance("X.509").generateCertificate(input);
        if (input.available() != 0
                || !Arrays.equals(der, certificate.getEncoded())
                || certificate.hasUnsupportedCriticalExtension()) throw new Rejected();
        certificate.checkValidity(Date.from(at));
        return certificate;
    }

    private static String string(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw new Rejected();
        return value.getAsString();
    }

    private static BigInteger unsigned(JsonElement value) {
        String encoded = string(value);
        if (encoded.isEmpty() || encoded.length() > 1366 || !encoded.matches("[A-Za-z0-9_-]+"))
            throw new Rejected();
        byte[] bytes = Base64.getUrlDecoder().decode(encoded);
        if (bytes.length == 0
                || bytes[0] == 0
                || !Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(encoded))
            throw new Rejected();
        return new BigInteger(1, bytes);
    }
}
