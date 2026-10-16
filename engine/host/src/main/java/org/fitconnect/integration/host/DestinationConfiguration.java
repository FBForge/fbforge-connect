package org.fitconnect.integration.host;

import com.google.gson.*;
import org.fitconnect.integration.contract.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Bounded, explicit v3 offer configuration shared by setup and editing. No arbitrary API fields. */
final class DestinationConfiguration {
    static final Set<String> CONFIG_FIELDS = Set.of("name", "type", "contactInformation", "metadataVersions", "publicServices", "processMessages");
    static JsonObject create(JsonObject choices, String encryptionKey, String signingKey) {
        if (!choices.keySet().equals(CONFIG_FIELDS)) throw invalid();
        text(choices.get("name"), 256);
        String type = text(choices.get("type"), 1);
        if (!Set.of("A", "C").contains(type)) throw invalid();
        contact(choices.get("contactInformation")); versions(choices.get("metadataVersions"));
        offers(choices.get("publicServices"), false); offers(choices.get("processMessages"), true);
        int services = choices.getAsJsonArray("publicServices").size(), messages = choices.getAsJsonArray("processMessages").size();
        if (type.equals("C") ? services != 0 || messages != 0 : services + messages == 0) throw invalid();
        var encryption = StrictJson.object(encryptionKey, 32768); var signing = StrictJson.object(signingKey, 32768);
        var result = choices.deepCopy();
        result.addProperty("status", "created"); result.addProperty("encryptionKid", text(encryption.get("kid"), 512));
        result.add("encryptionPublicKey", encryption); result.add("signingPublicKey", signing);
        // A new TEST destination is not advertised via the public routing directory by default.
        result.addProperty("publicForRouting", false);
        if (result.toString().getBytes(StandardCharsets.UTF_8).length > 44000) throw new SessionException("content_limit");
        return result;
    }
    static void contact(JsonElement value) {
        if (value == null || !value.isJsonObject()) throw invalid();
        var contact = value.getAsJsonObject();
        if (!Set.of("legalName", "address", "phone", "email", "unit", "cc").containsAll(contact.keySet())) throw invalid();
        text(contact.get("legalName"), 256);
        String email = text(contact.get("email"), 256);
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw invalid();
        for (String key : contact.keySet()) if (!Set.of("legalName", "email", "cc").contains(key) && !contact.get(key).isJsonNull())
            { var item = contact.get(key); if (key.equals("address")) {
                if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString() || item.getAsString().length() > 2048
                        || item.getAsString().chars().anyMatch(c -> c == 127 || c < 32 && c != 10 && c != 13)) throw invalid();
            } else text(item, 256); }
        if (contact.has("cc") && !contact.get("cc").isJsonNull()) strings(contact.get("cc"), 10, 256);
    }
    static void versions(JsonElement value) {
        var versions = strings(value, 2, 16);
        if (versions.isEmpty() || !Set.of("2.0.0", "3.0.0").containsAll(versions)) throw invalid();
    }
    static void offers(JsonElement value, boolean process) {
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > 32) throw invalid();
        var ids = new HashSet<String>();
        for (var element : value.getAsJsonArray()) {
            if (!element.isJsonObject()) throw invalid();
            var offer = element.getAsJsonObject();
            var allowed = process ? Set.of("processModelId", "messageId", "regions", "schemas") : Set.of("identifier", "regions", "submissionSchemas", "replyChannels");
            if (!allowed.containsAll(offer.keySet())) throw invalid();
            String identity;
            if (process) identity = text(offer.get("processModelId"), 1024) + "\n" + text(offer.get("messageId"), 1024);
            else {
                identity = text(offer.get("identifier"), 512);
                if (!identity.matches("urn:de:fim:leika:leistung:[0-9]{14}")) throw invalid();
            }
            if (!ids.add(identity)) throw invalid();
            var regions = strings(offer.get("regions"), 32, 32);
            if (regions.isEmpty() || regions.stream().anyMatch(region -> !region.matches("DE[0-9]{0,12}"))) throw invalid();
            schemas(offer.get(process ? "schemas" : "submissionSchemas"));
            if (!process && offer.has("replyChannels") && !offer.get("replyChannels").isJsonNull()) {
                var channels = offer.get("replyChannels");
                if (!channels.isJsonObject() || !channels.getAsJsonObject().keySet().equals(Set.of("fitConnect"))) throw invalid();
                var fitConnect = channels.getAsJsonObject().get("fitConnect");
                if (!fitConnect.isJsonObject() || !fitConnect.getAsJsonObject().keySet().equals(Set.of("processStandards"))) throw invalid();
                for (String schema : strings(fitConnect.getAsJsonObject().get("processStandards"), 16, 4096)) uri(new JsonPrimitive(schema));
            }
        }
    }
    static void schemas(JsonElement value) {
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().isEmpty() || value.getAsJsonArray().size() > 16) throw invalid();
        var seen = new HashSet<String>();
        for (var element : value.getAsJsonArray()) {
            if (!element.isJsonObject() || !element.getAsJsonObject().keySet().equals(Set.of("schemaUri", "mimeType"))) throw invalid();
            var schema = element.getAsJsonObject(); String id = uri(schema.get("schemaUri"));
            String mime = text(schema.get("mimeType"), 64);
            if (!Set.of("application/json", "application/xml").contains(mime) || !seen.add(id + "\n" + mime)) throw invalid();
        }
    }
    static List<String> strings(JsonElement value, int maximum, int length) {
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > maximum) throw invalid();
        var result = new ArrayList<String>();
        for (var item : value.getAsJsonArray()) { String text = text(item, length); if (result.contains(text)) throw invalid(); result.add(text); }
        return List.copyOf(result);
    }
    static String text(JsonElement value, int maximum) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw invalid();
        String result = value.getAsString();
        if (result.isBlank() || result.length() > maximum || result.chars().anyMatch(c -> c < 32 || c == 127)) throw invalid();
        return result;
    }
    private static String uri(JsonElement value) {
        String result = text(value, 4096);
        try { var uri = URI.create(result); if (!uri.isAbsolute() || !Set.of("https", "urn").contains(uri.getScheme())) throw invalid(); }
        catch (IllegalArgumentException failure) { throw invalid(); }
        return result;
    }
    private static SessionException invalid() { return new SessionException("invalid_input"); }
    private DestinationConfiguration() {}
}
