package org.fitconnect.integration.v3;

import org.fitconnect.integration.contract.*;
import dev.fitko.fitconnect.core.crypto.util.KeyGenerator;
import com.nimbusds.jose.*;
import com.nimbusds.jose.jwk.KeyOperation;
import com.nimbusds.jose.util.Base64;
import java.math.BigInteger;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.*;
import org.bouncycastle.cert.jcajce.*;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

/** SDK RSA/JWK generation with an explicitly self-signed TEST leaf certificate. Never for PROD. */
final class TestKeys {
    static GeneratedTestKey generate(String purpose) {
        if (!Set.of("decrypt", "sign").contains(purpose)) throw new SessionException("invalid_input");
        try {
            boolean encryption = purpose.equals("decrypt");
            var pair = KeyGenerator.buildRSAKeyPair(4096);
            var identity = new X500Name("CN=FIT-Connect Test-Client TEST");
            var now = Instant.now();
            var serial = new BigInteger(159, new SecureRandom()).setBit(158);
            // SDK4 rc.2's CertUtils uses different issuer/subject DNs. Keep our self-signature policy
            // and use the SDK's existing Bouncy Castle dependency for a correctly named leaf instead.
            var certificate = new JcaX509v3CertificateBuilder(identity, serial, Date.from(now.minusSeconds(60)),
                    Date.from(now.plusSeconds(365L * 24 * 60 * 60)), identity, pair.getPublic());
            certificate.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));
            certificate.addExtension(Extension.keyUsage, true, new KeyUsage(encryption ? KeyUsage.keyEncipherment : KeyUsage.digitalSignature));
            var signed = certificate.build(new JcaContentSignerBuilder("SHA512withRSA").build(pair.getPrivate()));
            var leaf = new JcaX509CertificateConverter().getCertificate(signed);
            leaf.verify(pair.getPublic());
            String kid = UUID.randomUUID().toString();
            Algorithm algorithm = encryption ? JWEAlgorithm.RSA_OAEP_256 : JWSAlgorithm.PS512;
            var publicKey = KeyGenerator.buildJWK(pair, kid, encryption ? KeyOperation.WRAP_KEY : KeyOperation.VERIFY,
                    algorithm, List.of(Base64.encode(leaf.getEncoded()))).toPublicJWK();
            var privateKey = KeyGenerator.buildJWK(pair, kid, encryption ? KeyOperation.UNWRAP_KEY : KeyOperation.SIGN, algorithm);
            return new GeneratedTestKey(publicKey.toJSONString(), privateKey.toJSONString());
        } catch (Exception failure) { throw new SessionException("key_rejected"); }
    }
    private TestKeys() {}
}
