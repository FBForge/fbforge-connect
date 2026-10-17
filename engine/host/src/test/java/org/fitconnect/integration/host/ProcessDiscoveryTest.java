package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ProcessDiscoveryTest {
    private static final String ROOT =
            "https://test.fit-connect.fitko.dev/submission-api/v3/search-destinations/by-process-message";

    private static String query(String model, String message) {
        var input = new JsonObject();
        input.addProperty("processModelId", model);
        input.addProperty("messageId", message);
        input.addProperty("region", "DE");
        input.addProperty("offset", 0);
        return input.toString();
    }

    private static JsonObject response(String model, String message) {
        var result =
                JsonParser.parseString(
                                "{\"count\":1,\"offset\":0,\"totalCount\":1,\"destinations\":[{\"destinationId\":\""
                                        + DestinationManagementTest.A
                                        + "\",\"type\":\"A\",\"status\":\"active\",\"metadataVersions\":[\"3.0.0\"],\"publicServices\":[{\"identifier\":\"urn:de:fim:leika:leistung:99008001014002\",\"regions\":[\"DE\"],\"submissionSchemas\":[]}],\"processMessages\":[{\"processModelId\":\"placeholder\",\"messageId\":\"placeholder\",\"regions\":[\"DE\"],\"schemas\":[{\"schemaUri\":\"urn:test:process\",\"mimeType\":\"application/json\"}]}]}]}")
                        .getAsJsonObject();
        var offer =
                result.getAsJsonArray("destinations")
                        .get(0)
                        .getAsJsonObject()
                        .getAsJsonArray("processMessages")
                        .get(0)
                        .getAsJsonObject();
        offer.addProperty("processModelId", model);
        offer.addProperty("messageId", message);
        return result;
    }

    @Test
    void actualSdkUsesPublicTestSearchAndEncodesExactProcessAndMessageOnce() throws Exception {
        String model = "urn:test:model/a & b", message = "Nachforderung + Beleg";
        var reply = response(model, message);
        var urls = new ArrayList<String>();
        ResourceExchange remote =
                (endpoint, headers) -> {
                    urls.add(endpoint);
                    assertEquals(ProcessDiscovery.allowed(endpoint).toString(), endpoint);
                    assertTrue(
                            headers.keySet().stream()
                                    .noneMatch(key -> key.equalsIgnoreCase("authorization")));
                    assertTrue(
                            endpoint.contains(
                                    "processModelId="
                                            + URLEncoder.encode(model, StandardCharsets.UTF_8)));
                    assertTrue(
                            endpoint.contains(
                                    "messageId="
                                            + URLEncoder.encode(message, StandardCharsets.UTF_8)));
                    return reply.toString();
                };
        try (var adapters = DestinationManagementTest.registry();
                var session =
                        DestinationManagementTest.session(
                                adapters, ApiVersion.V3, new DestinationManagementTest.Remote())) {
            var page =
                    adapters.withSession(
                            ApiVersion.V3,
                            session,
                            s -> ProcessDiscovery.search(s, query(model, message), remote));
            assertEquals(model, page.processModelId());
            assertEquals(message, page.messageId());
            assertEquals(1, urls.size());
            assertEquals(
                    "urn:test:process",
                    page.destinations().getFirst().schemas().getFirst().schemaUri());
            assertEquals(
                    List.of("urn:de:fim:leika:leistung:99008001014002"),
                    page.destinations().getFirst().serviceIdentifiers());
        }
    }

    @Test
    void wrongOfferInactiveDestinationOrMalformedPagingNeverBecomesASelectableRecipient()
            throws Exception {
        for (String fault : List.of("message", "status", "total", "offset")) {
            var reply = response("model", "message");
            var destination = reply.getAsJsonArray("destinations").get(0).getAsJsonObject();
            switch (fault) {
                case "message" ->
                        destination
                                .getAsJsonArray("processMessages")
                                .get(0)
                                .getAsJsonObject()
                                .addProperty("messageId", "other");
                case "status" -> destination.addProperty("status", "inactive");
                case "total" -> reply.addProperty("totalCount", 4294967297L);
                default -> reply.addProperty("offset", 20);
            }
            try (var adapters = DestinationManagementTest.registry();
                    var session =
                            DestinationManagementTest.session(
                                    adapters,
                                    ApiVersion.V3,
                                    new DestinationManagementTest.Remote())) {
                assertThrows(
                        SessionException.class,
                        () ->
                                adapters.withSession(
                                        ApiVersion.V3,
                                        session,
                                        s ->
                                                ProcessDiscovery.search(
                                                        s,
                                                        query("model", "message"),
                                                        (u, h) -> reply.toString())));
            }
        }
    }

    @Test
    void processSearchPolicyRejectsOtherHostsVersionsDuplicateQueryAndExcessivePaging() {
        String query = "?processModelId=model&messageId=message&region=DE&offset=0&limit=20";
        assertEquals(ROOT + query, ProcessDiscovery.allowed(ROOT + query).toString());
        for (String url :
                List.of(
                        ROOT.replace("test.", "prod.") + query,
                        ROOT.replace("v3", "v2") + query,
                        ROOT + query + "&messageId=other",
                        ROOT + query + "#fragment",
                        ROOT + query.replace("offset=0", "offset=10020"),
                        ROOT + query.replace("limit=20", "limit=100")))
            assertThrows(SessionException.class, () -> ProcessDiscovery.allowed(url));
    }
}
