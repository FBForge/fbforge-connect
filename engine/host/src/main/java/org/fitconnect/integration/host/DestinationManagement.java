package org.fitconnect.integration.host;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/** Session-local previews for existing owned destinations. No live write occurs during prepare. */
final class DestinationManagement {
    record Detail(
            String destinationId,
            String name,
            String status,
            String contactJson,
            List<String> metadataVersions,
            List<String> possibleNextStatus,
            String type,
            String offersJson) {}

    record Change(
            String destinationId,
            String name,
            String beforeJson,
            String afterJson,
            String status,
            String error) {}

    record Preview(String attemptId, String status, List<Change> changes) {}

    private record Pending(String id, JsonObject snapshot, JsonObject patch, Change view) {}

    private final ApiVersion api;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private List<Pending> pending = List.of();
    private Preview state = new Preview(null, "idle", List.of());
    private long expires;
    private static final Set<String> CONTACT =
            Set.of("legalName", "address", "phone", "email", "unit");

    DestinationManagement(ApiVersion api, ResourceExchange remote) {
        this(api, remote, () -> System.nanoTime() / 1_000_000);
    }

    DestinationManagement(ApiVersion api, ResourceExchange remote, LongSupplier clock) {
        this.api = api;
        this.remote = remote;
        this.clock = clock;
    }

    Preview state() {
        return state;
    }

    private JsonObject read(AuthenticatedSession session, String id) {
        var value = StrictJson.object(session.ownDestination(id), 64 * 1024);
        if (!id.equals(text(value.get("destinationId"), 36))) throw error("invalid_resource");
        return value;
    }

    Detail load(AuthenticatedSession session, String value) {
        String id = DestinationAccess.id(value);
        var current = read(session, id);
        return new Detail(
                id,
                optional(current, "name"),
                optional(current, "status"),
                contact(current).toString(),
                strings(current.get("metadataVersions"), false),
                strings(current.get("possibleNextStatus"), false),
                optional(current, "type"),
                offers(current));
    }

    private static String offers(JsonObject current) {
        var result = new JsonObject();
        for (String field : List.of("publicServices", "processMessages"))
            result.add(
                    field,
                    current.has(field) && !current.get(field).isJsonNull()
                            ? current.get(field).deepCopy()
                            : new JsonArray());
        return result.toString();
    }

    Preview prepare(AuthenticatedSession session, String document) {
        if (api != ApiVersion.V3) throw error("invalid_input");
        if (Set.of("running", "uncertain").contains(state.status()))
            throw error("destination_update_locked");
        // Any new attempt retires an old preview, even when parsing or a refresh fails.
        pending = List.of();
        state = new Preview(null, "idle", List.of());
        var request = StrictJson.object(document, 24 * 1024);
        if (!request.keySet().equals(Set.of("destinationIds", "changes"))
                || !request.get("destinationIds").isJsonArray()
                || !request.get("changes").isJsonObject()) throw error("invalid_input");
        var ids = request.getAsJsonArray("destinationIds");
        var changes = request.getAsJsonObject("changes");
        if (ids.isEmpty()
                || ids.size() > 10
                || changes.isEmpty()
                || !Set.of(
                                "name",
                                "status",
                                "contactInformation",
                                "metadataVersions",
                                "publicServices",
                                "processMessages")
                        .containsAll(changes.keySet())) throw error("invalid_input");
        var rows = new ArrayList<Pending>();
        var seen = new HashSet<String>();
        for (var value : ids) {
            String id = DestinationAccess.id(text(value, 36));
            if (!seen.add(id)) throw error("invalid_input");
            var snapshot = read(session, id);
            var patch = patch(snapshot, changes);
            if (!patch.isEmpty())
                patch =
                        StrictJson.object(
                                session.canonicalDestinationMutation("patch", patch.toString()),
                                24576);
            var before = new JsonObject();
            patch.keySet()
                    .forEach(
                            key ->
                                    before.add(
                                            key,
                                            snapshot.has(key)
                                                    ? snapshot.get(key)
                                                    : JsonNull.INSTANCE));
            var row =
                    new Change(
                            id,
                            optional(snapshot, "name"),
                            before.toString(),
                            patch.toString(),
                            patch.isEmpty() ? "unchanged" : "prepared",
                            null);
            rows.add(new Pending(id, snapshot, patch, row));
        }
        var views = rows.stream().map(Pending::view).toList();
        if (new Gson().toJson(views).getBytes(StandardCharsets.UTF_8).length > 44 * 1024)
            throw error("content_limit");
        pending = List.copyOf(rows);
        expires = clock.getAsLong() + 120000;
        state = new Preview(UUID.randomUUID().toString(), "prepared", views);
        return state;
    }

    private static JsonObject patch(JsonObject current, JsonObject changes) {
        var result = new JsonObject();
        if (changes.has("name")) {
            String name =
                    text(changes.get("name"), 256)
                            .replace("{name}", Objects.toString(optional(current, "name"), ""));
            if (name.isBlank() || name.length() > 256) throw error("invalid_input");
            result.addProperty("name", name);
        }
        if (changes.has("status")) {
            String next = text(changes.get("status"), 32);
            if (!Set.of("active", "inactive").contains(next)
                    || !next.equals(optional(current, "status"))
                            && !strings(current.get("possibleNextStatus"), false).contains(next))
                throw error("invalid_input");
            result.addProperty("status", next);
        }
        if (changes.has("metadataVersions")) {
            var versions = strings(changes.get("metadataVersions"), true);
            if (versions.isEmpty()
                    || versions.size() > 16
                    || new HashSet<>(versions).size() != versions.size()
                    || versions.stream()
                            .anyMatch(v -> !v.matches("[123]\\.[0-9]{1,3}\\.[0-9]{1,3}")))
                throw error("invalid_input");
            result.add("metadataVersions", new Gson().toJsonTree(versions));
        }
        if (changes.has("contactInformation")) {
            if (!changes.get("contactInformation").isJsonObject()) throw error("invalid_input");
            var updates = changes.getAsJsonObject("contactInformation");
            if (updates.isEmpty() || !CONTACT.containsAll(updates.keySet()))
                throw error("invalid_input");
            var next = contact(current);
            for (String field : updates.keySet()) {
                var value = updates.get(field);
                if (!value.isJsonNull())
                    text(value, field.equals("address") ? 2048 : 256, field.equals("address"));
                next.add(field, value);
            }
            result.add("contactInformation", next);
        }
        if (changes.has("publicServices") || changes.has("processMessages")) {
            for (String field : List.of("publicServices", "processMessages"))
                if (changes.has(field)) {
                    DestinationConfiguration.offers(
                            changes.get(field), field.equals("processMessages"));
                    result.add(field, changes.get(field).deepCopy());
                }
            int services =
                    (result.has("publicServices") ? result : current)
                            .getAsJsonArray("publicServices")
                            .size();
            int messages =
                    (result.has("processMessages") ? result : current)
                            .getAsJsonArray("processMessages")
                            .size();
            String type = optional(current, "type");
            if ("C".equals(type)
                    ? services + messages != 0
                    : !"A".equals(type) || services + messages == 0) throw error("invalid_input");
        }
        for (String field : List.copyOf(result.keySet()))
            if (Objects.equals(result.get(field), current.get(field))) result.remove(field);
        return result;
    }

    private static JsonObject contact(JsonObject current) {
        var value = current.get("contactInformation");
        var result = new JsonObject();
        for (String key : List.of("legalName", "address", "phone", "email", "unit", "cc")) {
            var field =
                    value != null && value.isJsonObject() ? value.getAsJsonObject().get(key) : null;
            if (field != null && !field.isJsonNull()) {
                if (key.equals("cc")) strings(field, true);
                else text(field, key.equals("address") ? 2048 : 256, key.equals("address"));
            }
            result.add(key, field == null ? JsonNull.INSTANCE : field.deepCopy());
        }
        return result;
    }

    Preview cancel(String id) {
        requirePrepared(id);
        pending = List.of();
        state = new Preview(id, "cancelled", List.of());
        return state;
    }

    private void requirePrepared(String id) {
        if (!"prepared".equals(state.status()) || !Objects.equals(id, state.attemptId()))
            throw error("destination_update_locked");
    }

    Preview execute(AuthenticatedSession session, String id) {
        requirePrepared(id);
        var work = pending;
        pending = List.of();
        var rows = new ArrayList<>(state.changes());
        state = new Preview(id, "running", List.copyOf(rows));
        if (clock.getAsLong() >= expires)
            return finish(id, "expired", rows, "confirmation_expired");
        // Refresh every selected destination before the first PATCH. No PUT can overwrite unrelated
        // fields.
        try {
            for (var row : work)
                if (!read(session, row.id()).equals(row.snapshot()))
                    return finish(id, "conflict", rows, "destination_conflict");
        } catch (SessionException failure) {
            return finish(id, "failed", rows, failure.code());
        }
        boolean uncertain = false, failed = false;
        long deadline = clock.getAsLong() + 180000;
        for (int i = 0; i < work.size(); i++) {
            var row = work.get(i);
            if (row.patch().isEmpty()) continue;
            if (uncertain || clock.getAsLong() >= deadline) {
                rows.set(i, outcome(row.view(), "skipped", "resource_unavailable"));
                failed = true;
                continue;
            }
            boolean[] dispatched = {false};
            ResourceExchange oneShot =
                    new ResourceExchange() {
                        public String get(String u, Map<String, String> h) {
                            throw error("endpoint_blocked");
                        }

                        public Response request(
                                String method,
                                String url,
                                Map<String, String> headers,
                                String body) {
                            SendHttpTransport.allowedDestination(api, method, url);
                            if (dispatched[0]
                                    || !url.endsWith("/" + row.id())
                                    || !row.patch().equals(StrictJson.object(body, 24 * 1024)))
                                throw error("endpoint_blocked");
                            var safe = ReceiveAccess.safeHeaders(headers, false);
                            if (safe.entrySet().stream()
                                    .noneMatch(
                                            h ->
                                                    h.getKey().equalsIgnoreCase("authorization")
                                                            && h.getValue().startsWith("Bearer ")
                                                            && !h.getValue()
                                                                    .substring(7)
                                                                    .isBlank()))
                                throw error("endpoint_blocked");
                            dispatched[0] = true;
                            var response = remote.request(method, url, safe, body);
                            if (response.status() != 200)
                                throw new SessionException(
                                        response.status() == 401 || response.status() == 403
                                                ? "resource_denied"
                                                : "resource_unavailable",
                                        response.status());
                            return response;
                        }
                    };
            try {
                var result =
                        StrictJson.object(
                                session.patchOwnDestination(
                                        row.id(), row.patch().toString(), oneShot),
                                64 * 1024);
                if (!dispatched[0] || !row.id().equals(optional(result, "destinationId")))
                    throw error("invalid_resource");
                for (String field : row.patch().keySet()) {
                    if (Set.of("publicServices", "processMessages", "metadataVersions")
                            .contains(field)) {
                        var projected = new JsonObject();
                        projected.add(field, result.get(field));
                        var returned =
                                StrictJson.object(
                                        session.canonicalDestinationMutation(
                                                "patch", projected.toString()),
                                        65536);
                        var intended =
                                StrictJson.object(
                                        session.canonicalDestinationMutation(
                                                "patch",
                                                "{\""
                                                        + field
                                                        + "\":"
                                                        + row.patch().get(field)
                                                        + "}"),
                                        65536);
                        if (!normalizedReplyStandards(returned)
                                .equals(normalizedReplyStandards(intended)))
                            throw error("invalid_resource");
                    } else if (!Objects.equals(row.patch().get(field), result.get(field)))
                        throw error("invalid_resource");
                }
                rows.set(i, outcome(row.view(), "updated", null));
            } catch (Exception failure) {
                var known =
                        failure instanceof SessionException s ? s : error("resource_unavailable");
                if (known.httpStatus() != null && Set.of(409, 412).contains(known.httpStatus()))
                    known = new SessionException("destination_conflict", known.httpStatus());
                boolean rejected =
                        DestinationWriteAccess.definitelyDeclined(known)
                                || known.httpStatus() != null
                                        && Set.of(409, 412).contains(known.httpStatus());
                boolean unknown = dispatched[0] && !rejected;
                uncertain |= unknown;
                failed = true;
                rows.set(i, outcome(row.view(), unknown ? "uncertain" : "failed", known.code()));
            }
            state = new Preview(id, "running", List.copyOf(rows));
        }
        state =
                new Preview(
                        id,
                        uncertain ? "uncertain" : failed ? "partial" : "completed",
                        List.copyOf(rows));
        return state;
    }

    // Supported reply schemas are membership, not preference. Keep the dispatched request exact,
    // but accept a server ordering change in this advertised list. Sorting preserves duplicates:
    // missing, added or changed standards still fail verification and never cause an automatic
    // retry.
    private static JsonObject normalizedReplyStandards(JsonObject value) {
        var copy = value.deepCopy();
        if (!(copy.get("publicServices") instanceof JsonArray services)) return copy;
        for (var service : services) {
            if (!(service instanceof JsonObject object)
                    || !(object.get("replyChannels") instanceof JsonObject channels)
                    || !(channels.get("fitConnect") instanceof JsonObject fit)
                    || !(fit.get("processStandards") instanceof JsonArray standards)) continue;
            var sorted = new JsonArray();
            standards.asList().stream()
                    .sorted(Comparator.comparing(JsonElement::toString))
                    .forEach(sorted::add);
            fit.add("processStandards", sorted);
        }
        // Normalized reply lists also change a Service record's hash and thus SDK Set iteration.
        var sortedServices = new JsonArray();
        services.asList().stream()
                .sorted(Comparator.comparing(JsonElement::toString))
                .forEach(sortedServices::add);
        copy.add("publicServices", sortedServices);
        return copy;
    }

    private Preview finish(String id, String status, List<Change> rows, String code) {
        state =
                new Preview(
                        id,
                        status,
                        rows.stream()
                                .map(
                                        r ->
                                                r.status().equals("unchanged")
                                                        ? r
                                                        : outcome(r, "skipped", code))
                                .toList());
        return state;
    }

    private static Change outcome(Change row, String status, String error) {
        return new Change(
                row.destinationId(), row.name(), row.beforeJson(), row.afterJson(), status, error);
    }

    private static String optional(JsonObject o, String field) {
        var value = o.get(field);
        return value == null || value.isJsonNull() ? null : text(value, 512);
    }

    private static List<String> strings(JsonElement value, boolean required) {
        if (!required && (value == null || value.isJsonNull())) return List.of();
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > 64)
            throw error("invalid_input");
        var result = new ArrayList<String>();
        for (var entry : value.getAsJsonArray()) result.add(text(entry, 256));
        return List.copyOf(result);
    }

    private static String text(JsonElement value, int max) {
        return text(value, max, false);
    }

    private static String text(JsonElement value, int max, boolean multiline) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            throw error("invalid_input");
        String s = value.getAsString();
        if (s.length() > max
                || s.chars()
                        .anyMatch(c -> c == 127 || c < 32 && !(multiline && (c == 10 || c == 13))))
            throw error("invalid_input");
        return s;
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
