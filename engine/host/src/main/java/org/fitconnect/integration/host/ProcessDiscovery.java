package org.fitconnect.integration.host;

import com.google.gson.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;

/**
 * Read-only v3 process-message discovery. TEST currently requires the native session bearer for
 * this otherwise public search; the credential is restricted to the exact search endpoint and
 * query.
 */
final class ProcessDiscovery {
    record Schema(String schemaUri, String mimeType) {}

    record Destination(
            String destinationId,
            String type,
            List<Schema> schemas,
            List<String> serviceIdentifiers) {}

    record Page(
            String processModelId,
            String messageId,
            String region,
            int offset,
            int totalCount,
            List<Destination> destinations) {}

    private static final String ENDPOINT =
            "https://test.fit-connect.fitko.dev/submission-api/v3/search-destinations/by-process-message";

    static Page search(AuthenticatedSession session, String document, ResourceExchange remote) {
        var input = StrictJson.object(document, 12000);
        if (!input.keySet().equals(Set.of("processModelId", "messageId", "region", "offset")))
            throw new SessionException("invalid_input");
        String model = DestinationConfiguration.text(input.get("processModelId"), 1024),
                message = DestinationConfiguration.text(input.get("messageId"), 1024);
        String region = DestinationConfiguration.text(input.get("region"), 32);
        int offset = integer(input.get("offset"), 10000);
        if (!region.matches("DE[0-9]{0,12}") || offset % 20 != 0)
            throw new SessionException("invalid_input");
        var expected =
                Map.of(
                        "processModelId",
                        model,
                        "messageId",
                        message,
                        "region",
                        region,
                        "offset",
                        String.valueOf(offset),
                        "limit",
                        "20");
        ResourceExchange gate =
                (url, headers) -> {
                    allowed(url, headers);
                    if (!parameters(url).equals(expected))
                        throw new SessionException("endpoint_blocked");
                    return remote.get(url, headers);
                };
        var value =
                StrictJson.object(
                        session.processDestinations(model, message, region, offset, 20, gate),
                        1024 * 1024);
        if (!value.has("destinations") || !value.get("destinations").isJsonArray())
            throw new SessionException("invalid_resource");
        var rows = value.getAsJsonArray("destinations");
        int total = integer(value.get("totalCount"), 1000000);
        if (integer(value.get("offset"), 10000) != offset
                || integer(value.get("count"), 20) != rows.size()
                || rows.size() > 20
                || offset + rows.size() > total
                || rows.isEmpty() && offset < total) throw new SessionException("invalid_resource");
        var destinations = new ArrayList<Destination>();
        var ids = new HashSet<String>();
        for (var element : rows) {
            if (!element.isJsonObject()) throw new SessionException("invalid_resource");
            var row = element.getAsJsonObject();
            String id =
                    DestinationAccess.id(
                            DestinationConfiguration.text(row.get("destinationId"), 36));
            if (!ids.add(id)
                    || !"active".equals(DestinationConfiguration.text(row.get("status"), 32))
                    || !"A".equals(DestinationConfiguration.text(row.get("type"), 1)))
                throw new SessionException("invalid_resource");
            if (!row.has("processMessages")
                    || !row.get("processMessages").isJsonArray()
                    || row.getAsJsonArray("processMessages").size() > 128)
                throw new SessionException("invalid_resource");
            var matches = new ArrayList<JsonObject>();
            for (var offer : row.getAsJsonArray("processMessages"))
                if (offer.isJsonObject()
                        && offer.getAsJsonObject().has("processModelId")
                        && offer.getAsJsonObject().has("messageId")
                        && model.equals(offer.getAsJsonObject().get("processModelId").getAsString())
                        && message.equals(offer.getAsJsonObject().get("messageId").getAsString()))
                    matches.add(offer.getAsJsonObject());
            if (matches.size() != 1) throw new SessionException("invalid_resource");
            DestinationConfiguration.schemas(matches.getFirst().get("schemas"));
            var schemas = new ArrayList<Schema>();
            for (var item : matches.getFirst().getAsJsonArray("schemas"))
                schemas.add(
                        new Schema(
                                item.getAsJsonObject().get("schemaUri").getAsString(),
                                item.getAsJsonObject().get("mimeType").getAsString()));
            var services = new ArrayList<String>();
            if (row.has("publicServices") && row.get("publicServices").isJsonArray())
                for (var service : row.getAsJsonArray("publicServices")) {
                    if (services.size() >= 128) throw new SessionException("invalid_resource");
                    String identifier =
                            DestinationConfiguration.text(
                                    service.getAsJsonObject().get("identifier"), 512);
                    if (identifier.matches("urn:de:fim:leika:leistung:[0-9]{14}")
                            && !services.contains(identifier)) services.add(identifier);
                }
            destinations.add(new Destination(id, "A", List.copyOf(schemas), List.copyOf(services)));
        }
        return new Page(model, message, region, offset, total, List.copyOf(destinations));
    }

    static URI allowed(String endpoint) {
        parameters(endpoint);
        return URI.create(endpoint);
    }

    static URI allowed(String endpoint, Map<String, String> headers) {
        var uri = allowed(endpoint);
        var checked = ReceiveAccess.safeHeaders(headers, false);
        if (checked.entrySet().stream()
                .noneMatch(
                        entry ->
                                entry.getKey().equalsIgnoreCase("authorization")
                                        && entry.getValue().matches("Bearer [\\x21-\\x7e]+")))
            throw new SessionException("endpoint_blocked");
        return uri;
    }

    private static Map<String, String> parameters(String endpoint) {
        try {
            var uri = URI.create(endpoint);
            if (!ENDPOINT.equals(
                            new URI(
                                            uri.getScheme(),
                                            uri.getRawAuthority(),
                                            uri.getRawPath(),
                                            null,
                                            null)
                                    .toString())
                    || uri.getRawFragment() != null
                    || uri.getRawQuery() == null) throw new IllegalArgumentException();
            var values = new HashMap<String, String>();
            for (String pair : uri.getRawQuery().split("&", -1)) {
                var parts = pair.split("=", -1);
                if (parts.length != 2) throw new IllegalArgumentException();
                String name = URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
                        value = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
                if (values.putIfAbsent(name, value) != null) throw new IllegalArgumentException();
            }
            if (!values.keySet()
                            .equals(
                                    Set.of(
                                            "processModelId",
                                            "messageId",
                                            "region",
                                            "offset",
                                            "limit"))
                    || !values.get("region").matches("DE[0-9]{0,12}")
                    || !values.get("limit").equals("20")
                    || !values.get("offset").matches("0|[1-9][0-9]{0,4}")
                    || Integer.parseInt(values.get("offset")) > 10000
                    || Integer.parseInt(values.get("offset")) % 20 != 0)
                throw new IllegalArgumentException();
            for (String key : List.of("processModelId", "messageId"))
                DestinationConfiguration.text(new JsonPrimitive(values.get(key)), 1024);
            return Map.copyOf(values);
        } catch (Exception failure) {
            throw new SessionException("endpoint_blocked");
        }
    }

    private static int integer(JsonElement value, int max) {
        try {
            if (value == null
                    || !value.isJsonPrimitive()
                    || !value.getAsJsonPrimitive().isNumber()
                    || !value.getAsString().matches("0|[1-9][0-9]*"))
                throw new IllegalArgumentException();
            int number = Integer.parseInt(value.getAsString());
            if (number < 0 || number > max) throw new IllegalArgumentException();
            return number;
        } catch (Exception failure) {
            throw new SessionException("invalid_resource");
        }
    }
}
