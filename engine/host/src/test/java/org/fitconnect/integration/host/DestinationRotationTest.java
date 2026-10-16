package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;
import java.nio.file.Path;
import java.util.*;

/** Runs the real v3 SDK serializer/client against an authenticated, deterministic destination service. */
class DestinationRotationTest {
    private static final String FIRST = "11111111-1111-4111-8111-111111111111";
    private static final String SECOND = "22222222-2222-4222-8222-222222222222";
    private static final String ROOT = "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/";
    private static final List<GeneratedTestKey> material = new ArrayList<>();
    private static AdapterRegistry registry() throws Exception {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    private static AuthenticatedSession session(AdapterRegistry adapters, ResourceExchange remote) throws Exception {
        return adapters.openSession(ApiVersion.V3, "id", "secret", (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", remote);
    }
    @BeforeAll static void generate() throws Exception {
        try (var adapters = registry(); var session = session(adapters, (u,h) -> { fail("Generation must be local"); return null; })) {
            for (int index = 0; index < 3; index++) for (String purpose : List.of("decrypt", "sign"))
                material.add(adapters.withSession(ApiVersion.V3, session, s -> s.generateTestKey(purpose)));
        }
    }
    private static String bundle(LocalTestKeys bank, AdapterRegistry adapters, AuthenticatedSession session, int pair) {
        var id = UUID.randomUUID();
        for (int index = 0; index < 2; index++) {
            var key = material.get(pair * 2 + index);
            var item = new SessionKeyArchive(null, null, null, key.privateJwk(), null, null,
                    new GeneratedKeyReference(id, index == 0 ? "decrypt" : "sign", key.publicJwk(), null, "ready"));
            adapters.withSession(ApiVersion.V3, session, s -> { bank.restore(s, item); return null; });
        }
        return id.toString();
    }
    private static String choices(String... pairs) {
        var array = new JsonArray();
        for (int i = 0; i < pairs.length; i+=2) {
            var row = new JsonObject(); row.addProperty("destinationId", pairs[i]); row.addProperty("bundleId", pairs[i+1]); array.add(row);
        }
        var object = new JsonObject(); object.add("destinations", array); return object.toString();
    }
    private static final class Remote implements ResourceExchange {
        final Map<String,JsonObject> details = new LinkedHashMap<>();
        final Map<String,JsonArray> keys = new LinkedHashMap<>();
        final List<String> writes = new ArrayList<>();
        boolean loseSigningAcknowledgement, rejectSigning;
        Remote() {
            for (String id : List.of(FIRST, SECOND)) {
                var detail = new JsonObject(); detail.addProperty("destinationId", id); detail.addProperty("name", "TEST " + id);
                detail.addProperty("status", "active"); detail.addProperty("type", "A");
                detail.addProperty("encryptionKid", StrictJson.object(material.getFirst().publicJwk(), 32768).get("kid").getAsString());
                detail.add("metadataVersions", JsonParser.parseString("[\"3.0.0\"]"));
                detail.add("publicServices", new JsonArray()); detail.add("processMessages", new JsonArray());
                details.put(id, detail);
                var bank = new JsonArray(); bank.add(JsonParser.parseString(material.get(0).publicJwk())); bank.add(JsonParser.parseString(material.get(1).publicJwk())); keys.put(id, bank);
            }
        }
        private void authenticate(Map<String,String> headers) {
            assertTrue(headers.entrySet().stream().anyMatch(item -> item.getKey().equalsIgnoreCase("authorization") && item.getValue().equals("Bearer synthetic-token")));
        }
        public String get(String endpoint, Map<String,String> headers) {
            authenticate(headers);
            for (String id : details.keySet()) {
                if (endpoint.equals(ROOT + id)) return details.get(id).toString();
                if (endpoint.equals(ROOT + id + "/keys?offset=0&limit=50")) {
                    var page = new JsonObject(); page.addProperty("count", keys.get(id).size()); page.addProperty("totalCount", keys.get(id).size());
                    page.addProperty("offset", 0); page.add("keys", keys.get(id)); return page.toString();
                }
            }
            fail("Unexpected read: " + endpoint); return null;
        }
        public Response request(String method, String endpoint, Map<String,String> headers, String document) {
            authenticate(headers);
            String id = endpoint.substring(ROOT.length(), ROOT.length() + 36); var input = StrictJson.object(document, 65536);
            if (method.equals("POST")) {
                assertEquals(ROOT + id + "/keys", endpoint); assertFalse(input.has("d")); assertFalse(input.has("p"));
                boolean signing = input.get("alg").getAsString().equals("PS512");
                writes.add(id + (signing ? ":sign" : ":decrypt"));
                if (signing && rejectSigning) throw new SessionException("resource_denied", 403);
                assertTrue(keys.get(id).asList().stream().noneMatch(key -> key.getAsJsonObject().get("kid").equals(input.get("kid"))), "Never repeat a registered public key");
                keys.get(id).add(input);
                if (signing && loseSigningAcknowledgement) { loseSigningAcknowledgement = false; throw new SessionException("resource_unavailable"); }
                return new Response(201, "");
            }
            assertEquals("PATCH", method); assertEquals(ROOT + id, endpoint); assertEquals(Set.of("encryptionKid"), input.keySet());
            assertEquals(4, keys.get(id).size(), "Both new keys must be registered before encryption switches");
            writes.add(id + ":switch"); details.get(id).add("encryptionKid", input.get("encryptionKid")); return new Response(200, details.get(id).toString());
        }
    }
    @Test void registersBothKeysBeforeSwitchAndRetainsOldPublicAndPrivateKeys() throws Exception {
        var remote = new Remote();
        try (var adapters = registry(); var session = session(adapters, remote)) {
            var bank = new LocalTestKeys(); String old = bundle(bank, adapters, session, 0); bank.bind(old, FIRST);
            String first = bundle(bank, adapters, session, 1), second = bundle(bank, adapters, session, 2);
            var rotation = new DestinationRotation(bank, remote);
            var preview = adapters.withSession(ApiVersion.V3, session, s -> rotation.prepare(s, choices(FIRST, first, SECOND, second)));
            assertTrue(remote.writes.isEmpty()); assertThrows(SessionException.class, () -> rotation.execute(session, preview.attemptId()));
            rotation.markDispatch(preview.attemptId());
            var result = adapters.withSession(ApiVersion.V3, session, s -> rotation.execute(s, preview.attemptId()));
            assertEquals("completed", result.status()); assertEquals(List.of(FIRST+":decrypt", FIRST+":sign", FIRST+":switch", SECOND+":decrypt", SECOND+":sign", SECOND+":switch"), remote.writes);
            assertEquals(6, bank.archive().size()); assertTrue(bank.list().stream().allMatch(item -> item.status().equals("bound")));
            assertThrows(SessionException.class, () -> rotation.execute(session, preview.attemptId()));
        }
    }
    @Test void lostAcknowledgementStopsBulkAndRestartResumesOnlyMissingOperations() throws Exception {
        var remote = new Remote(); remote.loseSigningAcknowledgement = true;
        try (var adapters = registry(); var session = session(adapters, remote)) {
            var bank = new LocalTestKeys(); String first = bundle(bank, adapters, session, 1), second = bundle(bank, adapters, session, 2);
            var rotation = new DestinationRotation(bank, remote);
            var preview = adapters.withSession(ApiVersion.V3, session, s -> rotation.prepare(s, choices(FIRST, first, SECOND, second)));
            rotation.markDispatch(preview.attemptId());
            var result = adapters.withSession(ApiVersion.V3, session, s -> rotation.execute(s, preview.attemptId()));
            assertEquals("uncertain", result.status()); assertEquals("skipped", result.changes().get(1).status()); assertEquals(2, remote.writes.size());
            assertEquals("ready", bank.list().get(1).status());
            var restored = new LocalTestKeys();
            for (var item : bank.archive()) adapters.withSession(ApiVersion.V3, session, s -> { restored.restore(s, item); return null; });
            var restarted = new DestinationRotation(restored, remote);
            var resume = adapters.withSession(ApiVersion.V3, session, s -> restarted.prepare(s, choices(FIRST, first)));
            restarted.cancel(resume.attemptId()); assertEquals("unresolved", restored.list().getFirst().status());
            resume = adapters.withSession(ApiVersion.V3, session, s -> restarted.prepare(s, choices(FIRST, first)));
            String attempt = resume.attemptId(); restarted.markDispatch(attempt);
            assertEquals("completed", adapters.withSession(ApiVersion.V3, session, s -> restarted.execute(s, attempt)).status());
            assertEquals(List.of(FIRST+":decrypt", FIRST+":sign", FIRST+":switch"), remote.writes);
            assertEquals("bound", restored.list().getFirst().status());
        }
    }
    @Test void externalChangesAbortEveryTargetBeforeAnyWrite() throws Exception {
        var remote = new Remote();
        try (var adapters = registry(); var session = session(adapters, remote)) {
            var bank = new LocalTestKeys(); String first = bundle(bank, adapters, session, 1), second = bundle(bank, adapters, session, 2);
            var rotation = new DestinationRotation(bank, remote);
            var preview = adapters.withSession(ApiVersion.V3, session, s -> rotation.prepare(s, choices(FIRST, first, SECOND, second)));
            remote.details.get(SECOND).addProperty("name", "Extern geändert"); rotation.markDispatch(preview.attemptId());
            assertEquals("conflict", adapters.withSession(ApiVersion.V3, session, s -> rotation.execute(s, preview.attemptId())).status());
            assertTrue(remote.writes.isEmpty()); assertTrue(bank.list().stream().allMatch(item -> item.status().equals("ready")));
        }
    }
    @Test void rejectedSecondKeyRetainsPartialRegistrationAndCanResume() throws Exception {
        var remote = new Remote(); remote.rejectSigning = true;
        try (var adapters = registry(); var session = session(adapters, remote)) {
            var bank = new LocalTestKeys(); String first = bundle(bank, adapters, session, 1);
            var rotation = new DestinationRotation(bank, remote);
            var preview = adapters.withSession(ApiVersion.V3, session, s -> rotation.prepare(s, choices(FIRST, first)));
            rotation.markDispatch(preview.attemptId());
            var result = adapters.withSession(ApiVersion.V3, session, s -> rotation.execute(s, preview.attemptId()));
            assertEquals("partial", result.status()); assertEquals("partially_registered", result.changes().getFirst().stage()); assertEquals(403, result.changes().getFirst().httpStatus());
            assertEquals("unresolved", bank.list().getFirst().status()); assertEquals(3, remote.keys.get(FIRST).size());
        }
    }
}
