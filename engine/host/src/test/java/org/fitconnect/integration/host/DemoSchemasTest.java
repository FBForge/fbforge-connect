package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class DemoSchemasTest {
    @Test
    void closedVersionedDemoSchemasNeedNoExternalConsentInEitherRealSdk() throws Exception {
        var sources =
                new SchemaSources(
                        Map.of(),
                        false,
                        uri -> {
                            fail("Demo must not fetch external sources");
                            return null;
                        },
                        uri -> {
                            fail("Demo must not fetch archives");
                            return null;
                        });
        assertTrue(sources.document(DemoSchemas.APPLICATION).contains("Antragstellende Person"));
        assertThrows(
                SessionException.class,
                () -> sources.document("https://example.invalid/other.schema.json"));
        try (var adapters = DestinationManagementTest.registry()) {
            for (var api : ApiVersion.values())
                try (var session =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                (u, h) -> {
                                    fail("Schema construction must stay local");
                                    return null;
                                })) {
                    String packet =
                            adapters.withSession(
                                    api,
                                    session,
                                    value ->
                                            value.publicSchema(
                                                    DemoSchemas.APPLICATION, Map.of(), false));
                    assertTrue(packet.contains("Antragstellende Person"));
                    var snapshot = new SchemaSnapshot(DemoSchemas.APPLICATION, packet);
                    byte[] valid =
                            "{\"antragstellendePerson\":{\"vorname\":\"Erika\",\"nachname\":\"Musterfrau\"},\"anliegen\":\"Fiktiver Test\"}"
                                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    boolean accepted =
                            adapters.withSession(
                                    api,
                                    session,
                                    value ->
                                            value.validateDraft(
                                                    snapshot, "application/json", valid));
                    assertTrue(accepted);
                    boolean rejected =
                            adapters.withSession(
                                    api,
                                    session,
                                    value ->
                                            value.validateDraft(
                                                    snapshot, "application/json", "{}".getBytes()));
                    assertFalse(rejected);
                    assertThrows(
                            SessionException.class,
                            () ->
                                    adapters.withSession(
                                            api,
                                            session,
                                            value ->
                                                    value.publicSchema(
                                                            "urn:not-bundled", Map.of(), false)));
                }
        }
    }
}
