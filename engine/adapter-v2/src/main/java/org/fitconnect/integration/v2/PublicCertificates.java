package org.fitconnect.integration.v2;

import com.nimbusds.jose.jwk.*;
import dev.fitko.fitconnect.api.config.ApplicationConfig;
import dev.fitko.fitconnect.api.config.resources.CertificateConfig;
import dev.fitko.fitconnect.client.util.ResourceLoadingUtils;
import dev.fitko.fitconnect.jwkvalidator.JWKValidator;
import org.fitconnect.integration.contract.*;

/** Uses the same trust anchors and online revocation checks as the pinned SDK. */
final class PublicCertificates {
    static void validate(String document, String purpose) {
        if (!IntegrationEnvironment.current().requiresVpki()) return;
        try {
            var key = RSAKey.parse(document);
            var operation =
                    switch (purpose) {
                        case "decrypt" -> KeyOperation.WRAP_KEY;
                        case "sign" -> KeyOperation.VERIFY;
                        default -> throw new SessionException("invalid_input");
                    };
            if (key.isPrivate()
                    || key.getX509CertChain() == null
                    || key.getX509CertChain().isEmpty())
                throw new SessionException("vpki_certificate_required");
            var roots =
                    ResourceLoadingUtils.loadYaml(
                                    "certificate-config.yaml", CertificateConfig.class)
                            .getTrustedRootCertificates()
                            .stream()
                            .map(ResourceLoadingUtils::readResourceToString)
                            .toList();
            JWKValidator.withRecommendedDefaults()
                    .withProxy(
                            ApplicationConfig.builder()
                                    .build()
                                    .getHttpConfig()
                                    .getProxyConfig()
                                    .getHttpProxy())
                    .withRootCertificatesAsPEM(roots)
                    .build()
                    .validate(key, operation);
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("vpki_certificate_required");
        }
    }

    private PublicCertificates() {}
}
