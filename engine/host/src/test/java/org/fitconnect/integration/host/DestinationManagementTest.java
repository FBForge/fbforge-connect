package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

class DestinationManagementTest {
    static final String A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
    static AdapterRegistry registry() { return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar")); }
    static AuthenticatedSession session(AdapterRegistry registry, ApiVersion api, Remote remote) throws Exception {
        return registry.openSession(api, "id", "secret", (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", remote);
    }
    static String request(String changes, String... ids) { return "{\"destinationIds\":" + new Gson().toJson(ids) + ",\"changes\":" + changes + "}"; }
    static class Remote implements ResourceExchange {
        final Map<String,JsonObject> documents = new HashMap<>();
        final List<String> calls = new ArrayList<>(), patches = new ArrayList<>();
        int denyAt = -1, uncertainAt = -1, deniedStatus = 403;
        Remote() { for (String id : List.of(A,B)) documents.put(id, JsonParser.parseString("{\"destinationId\":\""+id+"\",\"name\":\"Test "+id.charAt(0)+"\",\"type\":\"A\",\"status\":\"active\",\"possibleNextStatus\":[\"inactive\"],\"metadataVersions\":[\"2.0.0\"],\"contactInformation\":{\"legalName\":\"Testorganisation\",\"address\":null,\"phone\":\"123\",\"email\":\"old@example.invalid\",\"unit\":null,\"cc\":[\"cc@example.invalid\"]},\"callback\":{\"url\":\"https://example.invalid/callback\"},\"encryptionKid\":\"keep-key\",\"publicServices\":[],\"processMessages\":[]}").getAsJsonObject()); }
        public String get(String url, Map<String,String> headers) {
            assertTrue(url.startsWith("https://test.fit-connect.fitko.dev/destination-api/"), "Management must load the authenticated private view");
            assertTrue(headers.entrySet().stream().anyMatch(h -> h.getKey().equalsIgnoreCase("authorization") && h.getValue().equals("Bearer synthetic-token")));
            String id = url.substring(url.lastIndexOf('/')+1); calls.add("GET " + id);
            if (!documents.containsKey(id)) throw new SessionException("resource_denied",403);
            return documents.get(id).toString();
        }
        public Response request(String method, String url, Map<String,String> headers, String body) {
            assertEquals(url, SendHttpTransport.allowedDestination(ApiVersion.V3, method, url).toString());
            assertTrue(headers.entrySet().stream().anyMatch(h -> h.getKey().equalsIgnoreCase("authorization") && h.getValue().equals("Bearer synthetic-token")));
            String id = url.substring(url.lastIndexOf('/')+1); calls.add("PATCH " + id); patches.add(body);
            if (patches.size() == denyAt) return new Response(deniedStatus,"{}");
            var patch = JsonParser.parseString(body).getAsJsonObject();
            assertTrue(Set.of("name","contactInformation","metadataVersions","status").containsAll(patch.keySet()));
            patch.entrySet().forEach(entry -> documents.get(id).add(entry.getKey(), entry.getValue()));
            if (patches.size() == uncertainAt) throw new SessionException("resource_unavailable");
            return new Response(200,documents.get(id).toString());
        }
    }
    @Test void bulkPreviewDoesNotWriteAndSdkPatchPreservesUntargetedConfiguration() throws Exception {
        var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V3,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            var detail = manager.load(session,A); assertEquals("Test 1",detail.name());
            var preview = manager.prepare(session,request("{\"name\":\"{name} – Alpha\",\"contactInformation\":{\"email\":\"new@example.invalid\"},\"metadataVersions\":[\"2.0.0\",\"3.0.0\"],\"status\":\"inactive\"}",A,B));
            assertEquals(0,remote.patches.size()); assertEquals(2,preview.changes().size());
            remote.calls.clear(); var result = manager.execute(session,preview.attemptId());
            assertEquals("completed",result.status()); assertTrue(result.changes().stream().allMatch(row -> row.status().equals("updated")));
            assertEquals(List.of("GET "+A,"GET "+B,"PATCH "+A,"PATCH "+B),remote.calls);
            for (var document : remote.documents.values()) {
                assertTrue(document.get("name").getAsString().endsWith(" – Alpha"));
                assertEquals("keep-key",document.get("encryptionKid").getAsString()); assertTrue(document.has("callback"));
                assertEquals("123",document.getAsJsonObject("contactInformation").get("phone").getAsString());
                assertEquals("cc@example.invalid",document.getAsJsonObject("contactInformation").getAsJsonArray("cc").get(0).getAsString());
            }
            assertThrows(SessionException.class,() -> manager.execute(session,preview.attemptId())); assertEquals(2,remote.patches.size());
        }
    }
    @Test void preflightConflictOrLostPermissionOnAnyMemberPreventsEveryWrite() throws Exception {
        for (boolean denied : List.of(false,true)) {
            var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V3,remote);
            try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
                var preview = manager.prepare(session,request("{\"name\":\"{name} test\"}",A,B));
                if (denied) remote.documents.remove(B); else remote.documents.get(B).addProperty("name","Changed elsewhere");
                assertEquals(denied ? "failed" : "conflict",manager.execute(session,preview.attemptId()).status());
                assertTrue(remote.patches.isEmpty());
            }
        }
    }
    @Test void knownRejectionIsReportedPerMemberAndNeverReplaysTheBatch() throws Exception {
        var remote = new Remote(); remote.denyAt=2; var manager = new DestinationManagement(ApiVersion.V3,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            var preview = manager.prepare(session,request("{\"name\":\"{name} test\"}",A,B));
            var result = manager.execute(session,preview.attemptId());
            assertEquals("partial",result.status()); assertEquals(List.of("updated","failed"),result.changes().stream().map(DestinationManagement.Change::status).toList());
            assertThrows(SessionException.class,() -> manager.execute(session,preview.attemptId())); assertEquals(2,remote.patches.size());
        }
    }
    @Test void uncertainWriteStopsTheRemainingBatchAndLocksNewWritesButAllowsReadback() throws Exception {
        var remote = new Remote(); remote.uncertainAt=1; var manager = new DestinationManagement(ApiVersion.V3,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            var preview = manager.prepare(session,request("{\"name\":\"{name} test\"}",A,B));
            var result = manager.execute(session,preview.attemptId()); assertEquals("uncertain",result.status());
            assertEquals(List.of("uncertain","skipped"),result.changes().stream().map(DestinationManagement.Change::status).toList());
            assertEquals("Test 1 test",manager.load(session,A).name()); assertEquals(result,manager.state());
            assertEquals("destination_update_locked",assertThrows(SessionException.class,() -> manager.prepare(session,request("{\"name\":\"retry\"}",A))).code());
            assertEquals(1,remote.patches.size());
        }
    }
    @Test void expiryCancellationAndChangedConfirmationIdsCannotWrite() throws Exception {
        var clock = new AtomicLong(); var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V3,remote,clock::get);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            var first = manager.prepare(session,request("{\"name\":\"new\"}",A));
            assertThrows(SessionException.class,() -> manager.execute(session,UUID.randomUUID().toString()));
            clock.set(120000); assertEquals("expired",manager.execute(session,first.attemptId()).status());
            var second = manager.prepare(session,request("{\"name\":\"new\"}",A)); manager.cancel(second.attemptId());
            assertThrows(SessionException.class,() -> manager.execute(session,second.attemptId())); assertTrue(remote.patches.isEmpty());
        }
    }
    @Test void multilineAddressesAndExplicitClearingPreserveTheOtherContactFields() throws Exception {
        var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V3,remote);
        remote.documents.get(A).getAsJsonObject("contactInformation").addProperty("address","Teststraße 1\n12345 Teststadt");
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            assertTrue(manager.load(session,A).contactJson().contains("Teststraße"));
            var preview = manager.prepare(session,request("{\"contactInformation\":{\"email\":null}}",A));
            assertEquals("completed",manager.execute(session,preview.attemptId()).status());
            assertTrue(remote.documents.get(A).getAsJsonObject("contactInformation").get("email").isJsonNull());
            assertEquals("Teststraße 1\n12345 Teststadt",remote.documents.get(A).getAsJsonObject("contactInformation").get("address").getAsString());
        }
    }
    @Test void serverConflictIsAKnownRejectionWithoutAnAutomaticRetry() throws Exception {
        var remote = new Remote(); remote.denyAt=1; remote.deniedStatus=409;
        var manager = new DestinationManagement(ApiVersion.V3,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            var preview = manager.prepare(session,request("{\"name\":\"new\"}",A));
            var result = manager.execute(session,preview.attemptId()); assertEquals("partial",result.status());
            assertEquals("failed",result.changes().getFirst().status()); assertEquals("destination_conflict",result.changes().getFirst().error());
            assertEquals(1,remote.patches.size());
        }
    }
    @Test void v2CanReadOwnedDetailsButCannotDispatchV3Writes() throws Exception {
        var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V2,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V2,remote)) {
            assertEquals(A,manager.load(session,A).destinationId());
            assertThrows(SessionException.class,() -> manager.prepare(session,request("{\"name\":\"new\"}",A))); assertTrue(remote.patches.isEmpty());
        }
    }
    @Test void invalidFieldsDuplicateIdsUnsupportedStatusAndForeignDestinationsRetireOldPreviews() throws Exception {
        var remote = new Remote(); var manager = new DestinationManagement(ApiVersion.V3,remote);
        try (var registry = registry(); var session = session(registry,ApiVersion.V3,remote)) {
            for (String invalid : List.of(request("{\"name\":\"new\"}",A,A), request("{\"clientSecret\":\"x\"}",A), request("{\"status\":\"decommissioned\"}",A),
                    request("{\"metadataVersions\":[\"bad\"]}",A),request("{\"contactInformation\":{\"secret\":\"x\"}}",A),request("{\"name\":\"new\"}",UUID.randomUUID().toString()))) {
                var old = manager.prepare(session,request("{\"name\":\"new\"}",A));
                assertThrows(SessionException.class,() -> manager.prepare(session,invalid));
                assertThrows(SessionException.class,() -> manager.execute(session,old.attemptId()));
            }
            assertTrue(remote.patches.isEmpty());
        }
    }
    @Test void strictIpcBindsPreviewExecutionAndRecoveryToTheOwningSession() throws Exception {
        var remote = new Remote();
        try (var registry = registry(); var manager = new SessionManager(registry,
                (u,b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}", api -> remote);
                var engine = new Engine(registry,manager)) {
            var session = manager.open(ApiVersion.V3,SessionRole.ONLINE_SERVICE,"id","secret");
            var request = new JsonObject(); request.addProperty("protocolVersion",1); request.addProperty("id","management-test");
            request.addProperty("apiVersion","v3"); request.addProperty("sessionId",session.sessionId());
            request.addProperty("command","prepare_destination_update"); request.addProperty("destinationDocument",request("{\"name\":\"new\"}",A));
            var prepared = JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject(); assertTrue(prepared.get("ok").getAsBoolean(),prepared.toString());
            String attempt = prepared.getAsJsonObject("result").getAsJsonObject("data").get("attemptId").getAsString();
            request.remove("destinationDocument"); request.addProperty("command","execute_destination_update"); request.addProperty("attemptId",attempt);
            request.addProperty("sessionId",UUID.randomUUID().toString());
            assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean()); assertTrue(remote.patches.isEmpty());
            request.addProperty("sessionId",session.sessionId());
            var result = JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject(); assertTrue(result.get("ok").getAsBoolean(),result.toString());
            assertEquals("completed",result.getAsJsonObject("result").getAsJsonObject("data").get("status").getAsString());
            assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean());
            assertEquals(1,remote.patches.size());
            request.remove("attemptId"); request.addProperty("command","destination_update_state");
            assertTrue(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean());
            request.addProperty("unexpected","value");
            assertFalse(JsonParser.parseString(engine.handle(request.toString())).getAsJsonObject().get("ok").getAsBoolean());
        }
    }

    @Test void nativeManagementRoutesCannotWidenExistingSendProfiles() {
        String target="https://test.fit-connect.fitko.dev/destination-api/v3/destinations/"+A;
        assertEquals(target,SendHttpTransport.allowedDestination(ApiVersion.V3,"PATCH",target).toString());
        for (String method : List.of("GET","POST","PUT","DELETE")) assertThrows(SessionException.class,() -> SendHttpTransport.allowedDestination(ApiVersion.V3,method,target));
        for (String url : List.of(target+"?x=1",target+"#x",target+"/keys",target.replace("https:","http:"),target.replace("test.fit-connect.fitko.dev","prod.fit-connect.fitko.net"),target.replace("/v3/","/v2/")))
            assertThrows(SessionException.class,() -> SendHttpTransport.allowedDestination(ApiVersion.V3,"PATCH",url));
        assertThrows(SessionException.class,() -> SendHttpTransport.allowedDestination(ApiVersion.V2,"PATCH",target));
        assertThrows(SessionException.class,() -> SendHttpTransport.allowed(ApiVersion.V3,"PATCH",target));
    }
}
