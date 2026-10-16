package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

class SendSchemasTest {
    private static final String DEST = "11111111-1111-4111-8111-111111111111";
    private static final String URI = "https://example.invalid/schema.json";
    private static String request(String uri) {
        return "{\"serviceIdentifier\":\"urn:test:service\",\"schemaUri\":\"" + uri + "\",\"processModelId\":\"\",\"messageId\":\"\",\"allowExternalSchemas\":true}";
    }
    private static AuthenticatedSession session(String schema, AtomicInteger reads) {
        return (AuthenticatedSession) Proxy.newProxyInstance(AuthenticatedSession.class.getClassLoader(), new Class<?>[]{AuthenticatedSession.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "destination" -> "{\"destinationId\":\"" + DEST + "\",\"publicServices\":[{\"identifier\":\"urn:test:service\",\"submissionSchemas\":[{\"schemaUri\":\"" + URI + "\",\"mimeType\":\"application/json\"}]}]}";
                    case "publicSchema" -> { reads.incrementAndGet(); assertEquals(URI, args[0]); yield schema; }
                    default -> throw new AssertionError("Unexpected operation " + method.getName());
                });
    }
    @Test void onlyAdvertisedSchemasMayCrossThePublicHttpBoundary() {
        var calls = new AtomicInteger(); var schemas = new SendSchemas(); var session = session("{}", calls);
        assertThrows(SessionException.class, () -> schemas.load(session, DEST, request("https://example.invalid/other")));
        assertEquals(0, calls.get());
        var page = schemas.load(session, DEST, request(URI));
        assertEquals(URI, page.schemaUri()); assertEquals("{}", new String(Base64.getDecoder().decode(page.chunk()), StandardCharsets.UTF_8));
        assertEquals(1, calls.get());
    }
    @Test void schemaPagesAreBoundedAndOldSnapshotsCannotReturnAfterReloadOrClear() {
        String text = "ä".repeat(20000); var schemas = new SendSchemas();
        var session = session(text, new AtomicInteger()); var first = schemas.load(session, DEST, request(URI));
        var result = new java.io.ByteArrayOutputStream();
        for (var page = first; ;) {
            byte[] chunk = Base64.getDecoder().decode(page.chunk());
            assertTrue(chunk.length <= 12 * 1024); result.writeBytes(chunk);
            int offset = page.byteOffset() + chunk.length;
            if (offset == page.totalBytes()) break;
            page = schemas.read(first.schemaId(), offset);
        }
        assertEquals(text, result.toString(StandardCharsets.UTF_8));
        schemas.load(session, DEST, request(URI));
        assertThrows(SessionException.class, () -> schemas.read(first.schemaId(), 0));
        schemas.clear(); assertThrows(SessionException.class, () -> schemas.read(first.schemaId(), 0));
    }
}
