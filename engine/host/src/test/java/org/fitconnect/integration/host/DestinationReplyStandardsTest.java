package org.fitconnect.integration.host;

import static org.fitconnect.integration.host.DestinationManagementTest.*;
import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DestinationReplyStandardsTest {
    static String replyOfferChanges() {
        return "{\"publicServices\":[{\"identifier\":\"urn:de:fim:leika:leistung:99008001014002\",\"regions\":[\"DE\"],\"submissionSchemas\":[{\"schemaUri\":\"urn:test:application\",\"mimeType\":\"application/json\"}],\"replyChannels\":{\"fitConnect\":{\"processStandards\":[\"urn:test:reply\",\"urn:test:custom\"]}}}]}";
    }

    static JsonArray replyStandards(JsonObject destination) {
        return destination
                .getAsJsonArray("publicServices")
                .get(0)
                .getAsJsonObject()
                .getAsJsonObject("replyChannels")
                .getAsJsonObject("fitConnect")
                .getAsJsonArray("processStandards");
    }

    @Test
    void reorderedSupportedReplyStandardsConfirmTheSameOfferWithoutRepeatingTheWrite()
            throws Exception {
        var remote = new Remote();
        remote.normalizeResponse =
                value -> {
                    var standards = replyStandards(value);
                    var first = standards.get(0);
                    standards.set(0, standards.get(1));
                    standards.set(1, first);
                };
        var manager = new DestinationManagement(ApiVersion.V3, remote);
        try (var registry = registry();
                var session = session(registry, ApiVersion.V3, remote)) {
            var preview = manager.prepare(session, request(replyOfferChanges(), A));
            var result = manager.execute(session, preview.attemptId());
            assertEquals("completed", result.status());
            assertEquals("updated", result.changes().getFirst().status());
            assertEquals(1, remote.patches.size());
            assertEquals(2, replyStandards(remote.documents.get(A)).size());
        }
    }

    @Test
    void supportedReplyStandardOrderingDoesNotChangeMultiServiceMembership() throws Exception {
        for (int count = 2; count <= 5; count++) {
            var remote = new Remote();
            remote.normalizeResponse =
                    value -> {
                        for (var entry : value.getAsJsonArray("publicServices")) {
                            var standards =
                                    entry.getAsJsonObject()
                                            .getAsJsonObject("replyChannels")
                                            .getAsJsonObject("fitConnect")
                                            .getAsJsonArray("processStandards");
                            var first = standards.get(0);
                            standards.set(0, standards.get(1));
                            standards.set(1, first);
                        }
                    };
            var changes = JsonParser.parseString(replyOfferChanges()).getAsJsonObject();
            var template = changes.getAsJsonArray("publicServices").get(0).getAsJsonObject();
            var services = new JsonArray();
            for (int index = 0; index < count; index++) {
                var service = template.deepCopy();
                service.addProperty(
                        "identifier", "urn:de:fim:leika:leistung:9900800101400" + index);
                services.add(service);
            }
            changes.add("publicServices", services);
            var manager = new DestinationManagement(ApiVersion.V3, remote);
            try (var registry = registry();
                    var session = session(registry, ApiVersion.V3, remote)) {
                var preview = manager.prepare(session, request(changes.toString(), A));
                assertEquals("completed", manager.execute(session, preview.attemptId()).status());
                assertEquals(1, remote.patches.size());
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"replaced", "missing", "duplicate"})
    void changedReplyStandardMembershipStillLeavesTheWriteUncertainAndLocked(String change)
            throws Exception {
        var remote = new Remote();
        remote.normalizeResponse =
                value -> {
                    var standards = replyStandards(value);
                    switch (change) {
                        case "replaced" ->
                                standards.set(1, new JsonPrimitive("urn:test:unexpected"));
                        case "missing" -> standards.remove(1);
                        case "duplicate" -> standards.add(standards.get(0));
                        default -> throw new AssertionError("invalid test case");
                    }
                };
        var manager = new DestinationManagement(ApiVersion.V3, remote);
        try (var registry = registry();
                var session = session(registry, ApiVersion.V3, remote)) {
            var preview = manager.prepare(session, request(replyOfferChanges(), A));
            var result = manager.execute(session, preview.attemptId());
            assertEquals("uncertain", result.status());
            assertEquals("invalid_resource", result.changes().getFirst().error());
            assertEquals(1, remote.patches.size());
            assertThrows(
                    SessionException.class, () -> manager.execute(session, preview.attemptId()));
            assertEquals(1, remote.patches.size());
        }
    }
}
