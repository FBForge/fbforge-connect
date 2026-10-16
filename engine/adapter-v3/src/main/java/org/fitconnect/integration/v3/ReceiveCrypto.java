package org.fitconnect.integration.v3;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSADecrypter;
import com.nimbusds.jose.crypto.opts.*;
import com.nimbusds.jose.jwk.RSAKey;
import tools.jackson.core.*;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.json.JsonMapper;
import dev.fitko.fitconnect.core.crypto.impl.JWECryptoService;
import dev.fitko.fitconnect.core.crypto.api.*;
import org.fitconnect.integration.contract.SessionException;
import org.fitconnect.integration.contract.ReceiveFileNames;
import java.util.*;

/** Configure the SDK's JOSE library with explicit limits. No encryption primitives are implemented here. */
final class ReceiveCrypto extends JWECryptoService {
    private byte[] metadata;
    private long total;
    byte[] metadata() { return metadata; }
    @Override public DecryptedData decrypt(DecryptionRequest request) {
        try {
            RSAKey key = RSAKey.parse(request.decryptionKey());
            String wire = request.encryptedData();
            if (wire == null || wire.length() > 46 * 1024 * 1024) throw new SessionException("content_limit");
            if (wire.indexOf('.') < 1 || wire.indexOf('.') > 16384) throw new SessionException("invalid_resource");
            JWEObject jwe = JWEObject.parse(wire);
            var header = jwe.getHeader();
            if (!JWEAlgorithm.RSA_OAEP_256.equals(header.getAlgorithm()) || !EncryptionMethod.A256GCM.equals(header.getEncryptionMethod())
                    || !Objects.equals(key.getKeyID(), header.getKeyID()) || header.getCriticalParams() != null
                    || header.getCompressionAlgorithm() != null && !CompressionAlgorithm.DEF.equals(header.getCompressionAlgorithm()))
                throw new SessionException("verification_failed");
            int maximum = metadata == null ? 2 * 1024 * 1024 : 32 * 1024 * 1024;
            jwe.decrypt(new RSADecrypter(key, Set.of(new MaxDecompressedPlainTextLength(maximum))),
                    Set.of(new MaxCompressedCipherTextLength(46 * 1024 * 1024)));
            byte[] plain = jwe.getPayload().toBytes();
            if (plain.length > maximum || (total += plain.length) > 64L * 1024 * 1024) throw new SessionException("content_limit");
            if (metadata == null) { validateMetadata(plain); metadata = plain; }
            return new DecryptedData(plain, jwe.getAuthTag().toString(), header.getContentType());
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("verification_failed"); }
    }
    private static void validateMetadata(byte[] plain) throws Exception {
        var factory = JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32).maxStringLength(2 * 1024 * 1024).build()).build();
        try (var parser = JsonMapper.builder(factory).build().createParser(plain)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) throw new SessionException("invalid_resource");
            int depth = 1, remaining = 20000; boolean supported = false;
            JsonToken token;
            while ((token = parser.nextToken()) != null) {
                if (--remaining < 0 || depth == 0) throw new SessionException("invalid_resource");
                if (token.isStructStart()) depth++;
                if (token.isStructEnd()) depth--;
                if (token == JsonToken.VALUE_STRING && "filename".equals(parser.currentName())) ReceiveFileNames.check(parser.getString());
                if (depth == 1 && token == JsonToken.VALUE_STRING && "$schema".equals(parser.currentName()))
                    supported = parser.getString().matches("https://schema\\.fitko\\.de/fit-connect/metadata/[23]\\.\\d+\\.\\d+/metadata\\.schema\\.json");
            }
            if (!supported || depth != 0) throw new SessionException("invalid_resource");
        }
    }
}
