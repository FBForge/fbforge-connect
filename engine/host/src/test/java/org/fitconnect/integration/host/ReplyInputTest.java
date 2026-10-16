package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReplyInputTest {
    private final UUID destination = UUID.randomUUID(), submission = UUID.randomUUID(), caseId = UUID.randomUUID();
    private ReplyInput input(URI schema, String mime, byte[] bytes) {
        return new ReplyInput(destination, submission, caseId, schema, mime, bytes, List.of(), null);
    }
    @Test void immutablePayloadUsesOnlyVerifiedIdentityAndAnOfferedSchemaAndFormat() {
        byte[] bytes = {'{', '}'};
        var input = input(URI.create("urn:test:answer"), "application/json", bytes);
        bytes[0] = 0; input.data()[0] = 0; assertEquals('{', input.data()[0]);
        var recipient = new ReplyRecipient(destination, submission, caseId, null, "native-public-key",
                List.of(new ReplyRecipient.Schema(URI.create("urn:test:answer"), "application/json")));
        recipient.check(input);
        assertThrows(SessionException.class, () -> recipient.check(input(URI.create("urn:test:other"), "application/json", new byte[]{1})));
        assertThrows(SessionException.class, () -> recipient.check(input(URI.create("urn:test:answer"), "application/xml", new byte[]{1})));
        assertThrows(SessionException.class, () -> recipient.check(new ReplyInput(destination, UUID.randomUUID(), caseId,
                input.schemaUri(), input.mimeType(), input.data(), List.of(), null)));
        assertFalse(recipient.toString().contains("native-public-key")); assertFalse(input.toString().contains("{}"));
        assertThrows(UnsupportedOperationException.class, () -> recipient.schemas().clear());
    }
    @Test void invalidFormatsUrisAndUtf8AreRejectedWithoutAnSdkOrNetworkCall() {
        for (byte[] bytes : List.of(new byte[0], new byte[]{(byte) 0xff}, new byte[32 * 1024 * 1024 + 1]))
            assertThrows(SessionException.class, () -> input(URI.create("urn:test:answer"), "application/json", bytes));
        assertThrows(SessionException.class, () -> input(URI.create("relative"), "application/json", new byte[]{1}));
        assertThrows(SessionException.class, () -> input(URI.create("urn:test:answer"), null, new byte[]{1}));
        assertThrows(SessionException.class, () -> input(URI.create("urn:test:answer"), "text/html", new byte[]{1}));
        assertThrows(SessionException.class, () -> new ReplyRecipient(destination, submission, caseId, null, "native-public-key", List.of()));
        assertThrows(SessionException.class, () -> new ReplyRecipient.Schema(URI.create("/relative"), null));
        assertThrows(SessionException.class, () -> new ReplyRecipient.Schema(URI.create("urn:test:answer"), "text/html"));
    }
}
