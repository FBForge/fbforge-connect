package org.fitconnect.integration.host;

import org.fitconnect.integration.contract.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Proof-bound, read-only paging of the resources already used by the verifier. */
final class SchemaPages {
    record Page(String proofId, String schemaUri, int totalBytes, int byteOffset, String chunk) {}
    private final String uri;
    private byte[] bytes;
    SchemaPages(SchemaSnapshot snapshot) {
        uri = snapshot == null ? null : snapshot.schemaUri();
        bytes = snapshot == null || snapshot.document() == null ? new byte[0] : snapshot.document().getBytes(StandardCharsets.UTF_8);
    }
    Page read(String proofId, int offset) {
        if (bytes == null || offset < 0 || offset > bytes.length) throw new SessionException("invalid_resource");
        return new Page(proofId, uri, bytes.length, offset, Base64.getEncoder().encodeToString(
                Arrays.copyOfRange(bytes, offset, Math.min(offset + 12 * 1024, bytes.length))));
    }
    void close() { if (bytes != null) Arrays.fill(bytes, (byte) 0); bytes = null; }
}
