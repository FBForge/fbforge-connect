package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class LocalTestKeysTest {
    @Test
    void sdkGeneratesPurposeBoundTestCertificatesAndNativeArchivesRestoreWithoutRegistrationWrites()
            throws Exception {
        try (var registry =
                        new AdapterRegistry(
                                Path.of("../adapter-v2/target/adapter-v2.jar"),
                                Path.of("../adapter-v3/target/adapter-v3.jar"));
                var session =
                        registry.openSession(
                                ApiVersion.V3,
                                "id",
                                "secret",
                                (u, b) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                (u, h) -> {
                                    fail("Local generation must not call TEST");
                                    return null;
                                })) {
            var keys = new LocalTestKeys();
            var generated = registry.withSession(ApiVersion.V3, session, keys::generate);
            assertEquals("ready", generated.status());
            assertNotEquals(generated.encryption().kid(), generated.signing().kid());
            assertEquals(64, generated.encryption().fingerprint().length());
            String publicSummary = new Gson().toJson(generated);
            assertFalse(publicSummary.contains("privateJwk"));
            assertFalse(publicSummary.contains("publicJwk"));
            assertFalse(publicSummary.contains("\"d\""));
            var config =
                    JsonParser.parseString(
                                    "{\"name\":\"Test-Bauamt\",\"type\":\"A\",\"contactInformation\":{\"legalName\":\"Teststadt\",\"phone\":\"+49 30 000000\",\"address\":\"Musterstrasse 1, 12345 Musterstadt\",\"email\":\"test@example.invalid\"},\"metadataVersions\":[\"3.0.0\"],\"publicServices\":[{\"identifier\":\"urn:de:fim:leika:leistung:99008001014002\",\"regions\":[\"DE\"],\"submissionSchemas\":[{\"schemaUri\":\"urn:test:application\",\"mimeType\":\"application/json\"}]}],\"processMessages\":[]}")
                            .getAsJsonObject();
            for (String required : java.util.List.of("address", "phone")) {
                var missing = config.deepCopy();
                missing.getAsJsonObject("contactInformation").remove(required);
                assertThrows(
                        SessionException.class,
                        () -> DestinationConfiguration.create(missing, "{}", "{}"),
                        "Missing required API contact: " + required);
            }
            var document =
                    DestinationConfiguration.create(
                            config,
                            keys.key(generated.bundleId(), "decrypt").publicJwk(),
                            keys.key(generated.bundleId(), "sign").publicJwk());
            String canonical =
                    registry.withSession(
                            ApiVersion.V3,
                            session,
                            value ->
                                    value.canonicalDestinationMutation(
                                            "create", document.toString()));
            assertEquals(
                    "created",
                    JsonParser.parseString(canonical)
                            .getAsJsonObject()
                            .get("status")
                            .getAsString());
            assertFalse(canonical.contains("privateJwk"));
            assertFalse(canonical.contains("\"d\""));
            keys.reserve(generated.bundleId(), null);
            var restarted = new LocalTestKeys();
            for (var item : keys.archive())
                registry.withSession(
                        ApiVersion.V3,
                        session,
                        value -> {
                            restarted.restore(value, item);
                            return null;
                        });
            assertEquals(
                    "ready",
                    restarted.list().getFirst().status(),
                    "Unconfirmed reservations are safe to discard after restart");
            keys.unresolved(generated.bundleId());
            var dispatched = new LocalTestKeys();
            for (var item : keys.archive())
                registry.withSession(
                        ApiVersion.V3,
                        session,
                        value -> {
                            dispatched.restore(value, item);
                            return null;
                        });
            assertEquals("unresolved", dispatched.list().getFirst().status());
            assertThrows(
                    SessionException.class, () -> dispatched.reserve(generated.bundleId(), null));
            assertTrue(
                    keys.key(generated.bundleId(), "decrypt")
                            .privateJwk()
                            .equals(restarted.key(generated.bundleId(), "decrypt").privateJwk()),
                    "Restoration must preserve the private material");
        }
    }
}
