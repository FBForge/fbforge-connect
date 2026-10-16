package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class DestinationProvisioningTest {
    private static final String DEST = "11111111-1111-4111-8111-111111111111";
    private static final String ROOT =
            "https://test.fit-connect.fitko.dev/destination-api/v3/destinations";
    private static GeneratedTestKey encryption, signing;

    private static AdapterRegistry registry() throws Exception {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    private static AuthenticatedSession session(AdapterRegistry adapters, ResourceExchange remote)
            throws Exception {
        return adapters.openSession(
                ApiVersion.V3,
                "id",
                "secret",
                (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                remote);
    }

    @BeforeAll
    static void generateSyntheticKeys() throws Exception {
        try (var adapters = registry();
                var session =
                        session(
                                adapters,
                                (u, h) -> {
                                    fail("Local generation must not read TEST");
                                    return null;
                                })) {
            encryption =
                    adapters.withSession(
                            ApiVersion.V3, session, value -> value.generateTestKey("decrypt"));
            signing =
                    adapters.withSession(
                            ApiVersion.V3, session, value -> value.generateTestKey("sign"));
        }
    }

    private static String setup(
            LocalTestKeys keys, AdapterRegistry adapters, AuthenticatedSession session) {
        UUID bundle = UUID.randomUUID();
        for (String purpose : List.of("decrypt", "sign")) {
            var material = purpose.equals("decrypt") ? encryption : signing;
            var archive =
                    new SessionKeyArchive(
                            null,
                            null,
                            null,
                            material.privateJwk(),
                            null,
                            null,
                            new GeneratedKeyReference(
                                    bundle, purpose, material.publicJwk(), null, "ready"));
            adapters.withSession(
                    ApiVersion.V3,
                    session,
                    value -> {
                        keys.restore(value, archive);
                        return null;
                    });
        }
        return bundle.toString();
    }

    private static String choices(String bundle) {
        return "{\"bundleId\":\""
                + bundle
                + "\",\"configuration\":{\"name\":\"Bauamt TEST\",\"type\":\"A\",\"contactInformation\":{\"legalName\":\"Teststadt\",\"phone\":\"+49 30 000000\",\"address\":\"Musterstrasse 1, 12345 Musterstadt\",\"email\":\"test@example.invalid\"},\"metadataVersions\":[\"2.0.0\",\"3.0.0\"],\"publicServices\":[{\"identifier\":\"urn:de:fim:leika:leistung:99008001014002\",\"regions\":[\"DE\"],\"submissionSchemas\":[{\"schemaUri\":\"urn:test:application\",\"mimeType\":\"application/json\"}]}],\"processMessages\":[]}}";
    }

    private static final class Remote implements ResourceExchange {
        int writes, reads;
        String fault = "";
        JsonObject destination;
        JsonArray keys;

        public String get(String url, Map<String, String> headers) {
            reads++;
            assertTrue(
                    headers.entrySet().stream()
                            .anyMatch(
                                    item ->
                                            item.getKey().equalsIgnoreCase("authorization")
                                                    && item.getValue()
                                                            .equals("Bearer synthetic-token")),
                    "Owned creation verification must authenticate, including key reads");
            if (destination == null) throw new SessionException("resource_missing");
            if (fault.equals("readback-denied")) throw new SessionException("resource_denied", 403);
            if (url.equals(ROOT + "/" + DEST)) return destination.toString();
            if (url.equals(ROOT + "/" + DEST + "/keys?offset=0&limit=50")) {
                var page = new JsonObject();
                page.addProperty("count", keys.size());
                page.addProperty("totalCount", keys.size());
                page.addProperty("offset", 0);
                page.add("keys", keys);
                return page.toString();
            }
            fail("Unexpected read: " + url);
            return null;
        }

        public Response request(
                String method, String url, Map<String, String> headers, String body) {
            assertEquals("POST", method);
            assertEquals(ROOT, url);
            writes++;
            if (fault.equals("rejected")) throw new SessionException("resource_unavailable", 422);
            var input = StrictJson.object(body, 65536);
            assertEquals("created", input.get("status").getAsString());
            assertFalse(input.get("publicForRouting").getAsBoolean());
            keys = new JsonArray();
            for (String field : List.of("encryptionPublicKey", "signingPublicKey")) {
                var key = input.getAsJsonObject(field);
                for (String secret : Set.of("d", "p", "q", "dp", "dq", "qi", "oth", "k"))
                    assertFalse(key.has(secret));
                keys.add(key.deepCopy());
            }
            destination = input.deepCopy();
            destination.remove("encryptionPublicKey");
            destination.remove("signingPublicKey");
            destination.addProperty("destinationId", DEST);
            var statuses = new JsonArray();
            statuses.add("active");
            destination.add("possibleNextStatus", statuses);
            if (fault.equals("lost-response")) throw new SessionException("resource_unavailable");
            if (fault.equals("wrong-key"))
                destination.addProperty("encryptionKid", UUID.randomUUID().toString());
            if (fault.equals("wrong-configuration"))
                destination.addProperty("name", "Extern geändert");
            return new Response(201, destination.toString());
        }
    }

    @Test
    void actualSdkCreationWaitsForConfirmationUsesPublicKeysAndVerifiesTheOwnedCreatedDestination()
            throws Exception {
        var remote = new Remote();
        var clock = new AtomicLong();
        try (var adapters = registry();
                var session = session(adapters, remote)) {
            var keys = new LocalTestKeys();
            String bundle = setup(keys, adapters, session);
            var creation = new DestinationProvisioning(keys, remote, clock::get);
            var first =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.prepare(value, choices(bundle)));
            assertEquals(0, remote.writes);
            assertEquals(0, remote.reads);
            assertEquals("reserved", keys.list().getFirst().status());
            creation.cancel(first.attemptId());
            assertEquals("ready", keys.list().getFirst().status());
            var expired =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.prepare(value, choices(bundle)));
            clock.set(120000);
            assertEquals("expired", creation.execute(session, expired.attemptId()).status());
            assertEquals(0, remote.writes);
            var prepared =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.prepare(value, choices(bundle)));
            creation.markDispatch(prepared.attemptId());
            var outcome =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.execute(value, prepared.attemptId()));
            assertEquals("confirmed", outcome.status(), outcome::toString);
            assertEquals(DEST, outcome.destinationId());
            assertEquals(1, remote.writes);
            assertEquals("bound", keys.list().getFirst().status());
            assertEquals(DEST, keys.list().getFirst().destinationId());
            assertThrows(
                    SessionException.class, () -> creation.execute(session, prepared.attemptId()));
            assertEquals(1, remote.writes);
        }
    }

    @Test
    void lostResponsePersistsUnresolvedKeysAndReconciliationReadsWithoutAnotherPost()
            throws Exception {
        var remote = new Remote();
        remote.fault = "lost-response";
        try (var adapters = registry();
                var session = session(adapters, remote)) {
            var keys = new LocalTestKeys();
            String bundle = setup(keys, adapters, session);
            var creation = new DestinationProvisioning(keys, remote);
            var prepared =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.prepare(value, choices(bundle)));
            creation.markDispatch(prepared.attemptId());
            assertEquals(
                    "uncertain",
                    adapters.withSession(
                                    ApiVersion.V3,
                                    session,
                                    value -> creation.execute(value, prepared.attemptId()))
                            .status());
            var restored = new LocalTestKeys();
            for (var item : keys.archive())
                adapters.withSession(
                        ApiVersion.V3,
                        session,
                        value -> {
                            restored.restore(value, item);
                            return null;
                        });
            var restarted = new DestinationProvisioning(restored, remote);
            assertThrows(
                    SessionException.class,
                    () ->
                            adapters.withSession(
                                    ApiVersion.V3,
                                    session,
                                    value -> restarted.prepare(value, choices(bundle))));
            var checked =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> restarted.reconcile(value, bundle, DEST));
            assertEquals("confirmed", checked.status());
            assertEquals("bound", restored.list().getFirst().status());
            assertEquals(1, remote.writes);
        }
    }

    @Test
    void definiteValidationRejectionReleasesUnusedKeysAndRetainsTheHttpStatus() throws Exception {
        var remote = new Remote();
        remote.fault = "rejected";
        try (var adapters = registry();
                var session = session(adapters, remote)) {
            var keys = new LocalTestKeys();
            String bundle = setup(keys, adapters, session);
            var creation = new DestinationProvisioning(keys, remote);
            var prepared =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.prepare(value, choices(bundle)));
            creation.markDispatch(prepared.attemptId());
            var outcome =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            value -> creation.execute(value, prepared.attemptId()));
            assertEquals("failed", outcome.status());
            assertEquals(422, outcome.httpStatus());
            assertEquals("ready", keys.list().getFirst().status());
            assertEquals(1, remote.writes);
        }
    }

    @Test
    void wrongRegistrationOrChangedConfigurationNeverClaimsSuccessfulSetupAndNeverRepeats()
            throws Exception {
        for (String fault : List.of("wrong-key", "wrong-configuration", "readback-denied")) {
            var remote = new Remote();
            remote.fault = fault;
            try (var adapters = registry();
                    var session = session(adapters, remote)) {
                var keys = new LocalTestKeys();
                String bundle = setup(keys, adapters, session);
                var creation = new DestinationProvisioning(keys, remote);
                var prepared =
                        adapters.withSession(
                                ApiVersion.V3,
                                session,
                                value -> creation.prepare(value, choices(bundle)));
                creation.markDispatch(prepared.attemptId());
                var outcome =
                        adapters.withSession(
                                ApiVersion.V3,
                                session,
                                value -> creation.execute(value, prepared.attemptId()));
                assertEquals("uncertain", outcome.status());
                assertEquals("unresolved", keys.list().getFirst().status());
                assertEquals(DEST, outcome.destinationId());
                assertEquals(1, remote.writes);
            }
        }
    }
}
