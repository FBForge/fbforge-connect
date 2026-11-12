package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class DestinationBackupTest {
    private static final String ID = "11111111-1111-4111-8111-111111111111";
    private static GeneratedTestKey encryption, signing;

    @BeforeAll
    static void material() throws Exception {
        try (var registry = DestinationManagementTest.registry();
                var session =
                        DestinationManagementTest.session(
                                registry, ApiVersion.V3, new DestinationManagementTest.Remote())) {
            encryption =
                    registry.withSession(ApiVersion.V3, session, s -> s.generateTestKey("decrypt"));
            signing = registry.withSession(ApiVersion.V3, session, s -> s.generateTestKey("sign"));
        }
    }

    @Test
    void sourceReadsOwnedConfigurationAndTransfersOnlyDestinationKeysSequentially()
            throws Exception {
        var remote =
                new DestinationManagementTest.Remote() {
                    @Override
                    public String get(String url, Map<String, String> headers) {
                        if (url.contains("/keys?")) {
                            assertTrue(url.contains("/destination-api/v3/destinations/" + ID));
                            assertTrue(
                                    headers.entrySet().stream()
                                            .anyMatch(
                                                    h ->
                                                            h.getKey()
                                                                            .equalsIgnoreCase(
                                                                                    "authorization")
                                                                    && h.getValue()
                                                                            .equals(
                                                                                    "Bearer synthetic-token")));
                            return "{\"offset\":0,\"count\":2,\"totalCount\":2,\"keys\":["
                                    + encryption.publicJwk()
                                    + ","
                                    + signing.publicJwk()
                                    + "]}";
                        }
                        return super.get(url, headers);
                    }
                };
        remote.documents.get(ID).addProperty("clientCount", 1);
        remote.documents
                .get(ID)
                .addProperty(
                        "encryptionKid",
                        JsonParser.parseString(encryption.publicJwk())
                                .getAsJsonObject()
                                .get("kid")
                                .getAsString());
        try (var registry = DestinationManagementTest.registry();
                var session = DestinationManagementTest.session(registry, ApiVersion.V3, remote)) {
            var source = new DestinationBackupSource();
            var parts = new ArrayList<DestinationBackupSource.Part>();
            for (int offset = 0; offset <= 3; offset++) {
                final int position = offset;
                parts.add(
                        registry.withSession(
                                ApiVersion.V3, session, s -> source.read(s, ID, position)));
            }
            assertEquals(3, parts.getFirst().total());
            assertEquals("configuration", parts.getFirst().item().get("kind").getAsString());
            assertEquals(
                    1,
                    parts.getFirst().item().getAsJsonObject("value").get("clientCount").getAsInt());
            assertEquals(
                    0,
                    parts.stream()
                            .filter(
                                    p ->
                                            p.item() != null
                                                    && p.item()
                                                            .get("kind")
                                                            .getAsString()
                                                            .equals("private_key"))
                            .count());
            assertNull(parts.getLast().item());
            assertFalse(parts.toString().contains("privateJwk"));
            assertThrows(
                    SessionException.class,
                    () -> registry.withSession(ApiVersion.V3, session, s -> source.read(s, ID, 1)));
            registry.withSession(ApiVersion.V3, session, s -> source.read(s, ID, 0));
            assertThrows(
                    SessionException.class,
                    () ->
                            registry.withSession(
                                    ApiVersion.V3, session, s -> source.read(s, ID, 0 + 2)));
        }
    }

    @Test
    void sourceNeverFallsBackToThePublicDirectoryForAnUnownedDestination() throws Exception {
        var remote =
                new DestinationManagementTest.Remote() {
                    @Override
                    public String get(String url, Map<String, String> headers) {
                        throw new SessionException("resource_denied", 403);
                    }
                };
        try (var registry = DestinationManagementTest.registry();
                var session = DestinationManagementTest.session(registry, ApiVersion.V3, remote)) {
            var source = new DestinationBackupSource();
            assertThrows(
                    SessionException.class,
                    () -> registry.withSession(ApiVersion.V3, session, s -> source.read(s, ID, 0)));
            assertThrows(
                    SessionException.class,
                    () -> registry.withSession(ApiVersion.V3, session, s -> source.read(s, ID, 1)));
        }
    }

    @Test
    void optionalFieldsRetainRestrictionsAndNeverExposeCallbackSecretsInPreviews() {
        var choices =
                JsonParser.parseString(
                                "{\"callback\":{\"url\":\"https://example.invalid/callback\",\"secret\":\"synthetic-callback-secret-minimum-32-characters\"},\"senderAccessRestricted\":{\"enabled\":true,\"allowedSenders\":[],\"allowedSenderDestinations\":[\""
                                        + ID
                                        + "\"]},\"publicForRouting\":true}")
                        .getAsJsonObject();
        var patch = new JsonObject();
        DestinationExtras.copy(choices, patch, null);
        assertEquals(choices, patch);
        assertFalse(
                DestinationExtras.readable(patch).toString().contains("synthetic-callback-secret"));
        choices.getAsJsonObject("senderAccessRestricted").getAsJsonArray("allowedSenders").add(ID);
        assertThrows(
                SessionException.class,
                () -> DestinationExtras.copy(choices, new JsonObject(), null));
        choices.getAsJsonObject("senderAccessRestricted").add("allowedSenders", new JsonArray());
        choices.getAsJsonObject("callback").addProperty("url", "http://example.invalid/unsafe");
        assertThrows(
                SessionException.class,
                () -> DestinationExtras.copy(choices, new JsonObject(), null));
    }
}
