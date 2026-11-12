package org.fitconnect.integration.host;

import com.google.gson.*;
import java.net.URI;
import java.util.*;
import org.fitconnect.integration.contract.SessionException;

/**
 * Shared optional destination fields. Secrets may be written but never journaled or verified by
 * GET.
 */
final class DestinationExtras {
    static final Set<String> FIELDS =
            Set.of("callback", "senderAccessRestricted", "publicForRouting");

    static void copy(JsonObject source, JsonObject target, JsonObject current) {
        if (source.has("publicForRouting")) {
            if (!source.get("publicForRouting").isJsonPrimitive()
                    || !source.getAsJsonPrimitive("publicForRouting").isBoolean()) invalid();
            target.add("publicForRouting", source.get("publicForRouting").deepCopy());
        }
        if (source.has("callback")) {
            var value = source.get("callback");
            if (!value.isJsonNull()) {
                if (!value.isJsonObject()
                        || !Set.of("url", "secret").containsAll(value.getAsJsonObject().keySet()))
                    invalid();
                var callback = value.getAsJsonObject();
                String url = DestinationConfiguration.text(callback.get("url"), 4096);
                try {
                    var uri = URI.create(url);
                    if (!"https".equals(uri.getScheme())
                            || uri.getHost() == null
                            || uri.getUserInfo() != null
                            || uri.getFragment() != null) invalid();
                } catch (IllegalArgumentException failure) {
                    invalid();
                }
                if (callback.has("secret")) {
                    String secret = DestinationConfiguration.text(callback.get("secret"), 512);
                    if (secret.length() < 32) invalid();
                }
            }
            target.add("callback", value.deepCopy());
        }
        if (source.has("senderAccessRestricted")) {
            var value = source.get("senderAccessRestricted");
            if (!value.isJsonObject()) invalid();
            var access = value.getAsJsonObject();
            if (!Set.of("enabled", "allowedSenders", "allowedSenderDestinations")
                            .containsAll(access.keySet())
                    || !access.has("enabled")
                    || !access.get("enabled").isJsonPrimitive()
                    || !access.getAsJsonPrimitive("enabled").isBoolean()) invalid();
            for (String field : List.of("allowedSenders", "allowedSenderDestinations")) {
                if (!access.has(field) || access.get(field).isJsonNull()) continue;
                var ids = DestinationConfiguration.strings(access.get(field), 128, 36);
                ids.forEach(DestinationAccess::id);
                if (field.equals("allowedSenders")) {
                    var previous =
                            current == null
                                            || !current.has("senderAccessRestricted")
                                            || current.get("senderAccessRestricted").isJsonNull()
                                    ? null
                                    : current.getAsJsonObject("senderAccessRestricted")
                                            .get("allowedSenders");
                    var allowed =
                            previous == null || previous.isJsonNull()
                                    ? List.<String>of()
                                    : DestinationConfiguration.strings(previous, 128, 36);
                    if (!allowed.containsAll(ids)) invalid();
                }
            }
            target.add("senderAccessRestricted", value.deepCopy());
        }
    }

    static JsonObject readable(JsonObject value) {
        var copy = value.deepCopy();
        if (copy.has("callback") && copy.get("callback").isJsonObject())
            copy.getAsJsonObject("callback").remove("secret");
        return copy;
    }

    private static void invalid() {
        throw new SessionException("invalid_input");
    }
}
