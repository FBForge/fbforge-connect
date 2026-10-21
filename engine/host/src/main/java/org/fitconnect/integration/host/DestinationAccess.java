package org.fitconnect.integration.host;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Session-owned directory snapshots. Public-key eligibility is never supplied by the renderer. */
final class DestinationAccess {
    record Summary(String destinationId, String name, String status, String type) {}

    record Page(
            List<Summary> destinations,
            int offset,
            int totalCount,
            Boolean canManageDestinations) {}

    record Eligibility(
            String kid,
            String purpose,
            boolean eligible,
            String reason,
            String certificateSha256,
            String expiresAt) {}

    record Context(String destinationId, String detailsJson, List<Eligibility> keys) {}

    record KeyState(List<KeyReference> keys) {}

    private record Registration(Context context, Map<String, List<String>> eligible) {}

    private final Map<String, Registration> registrations = new LinkedHashMap<>();

    Page list(AuthenticatedSession session, int offset) {
        if (offset < 0 || offset > 10000 || offset % 20 != 0)
            throw new SessionException("invalid_input");
        var page = StrictJson.object(session.destinations(offset, 20), 1024 * 1024);
        var rows = array(page, "destinations");
        if (rows.size() > 20) throw new SessionException("invalid_resource");
        int total = integer(page, "totalCount", 1000000);
        validatePage(page, offset, rows.size(), total);
        var result = new ArrayList<Summary>();
        var seen = new HashSet<String>();
        for (JsonElement row : rows) {
            var value = row.getAsJsonObject();
            String id = id(text(value, "destinationId", 36, false));
            if (!seen.add(id)) throw new SessionException("invalid_resource");
            result.add(
                    new Summary(
                            id,
                            text(value, "name", 512, true),
                            text(value, "status", 64, true),
                            text(value, "type", 64, true)));
        }
        return new Page(List.copyOf(result), offset, total, session.canManageDestinations());
    }

    Context load(AuthenticatedSession session, String destinationId) {
        return load(session, destinationId, false);
    }

    Context loadOwned(AuthenticatedSession session, String destinationId) {
        return load(session, destinationId, true);
    }

    private Context load(AuthenticatedSession session, String destinationId, boolean owned) {
        String id = id(destinationId);
        registrations.remove(
                id); // Failed refresh cannot leave an apparently current registration snapshot.
        var detail =
                StrictJson.object(
                        owned ? session.ownDestination(id) : session.destination(id), 24 * 1024);
        if (!id.equals(id(text(detail, "destinationId", 36, false))))
            throw new SessionException("invalid_resource");
        var summaries = new ArrayList<Eligibility>();
        var eligible = new HashMap<String, List<String>>();
        var seen = new HashSet<String>();
        int offset = 0, bytes = 0, expectedTotal = -1;
        while (true) {
            var page =
                    StrictJson.object(
                            owned
                                    ? session.ownDestinationKeys(id, offset, 50)
                                    : session.destinationKeys(id, offset, 50),
                            1024 * 1024);
            var keys = array(page, "keys");
            int total = integer(page, "totalCount", 128);
            if (expectedTotal < 0) expectedTotal = total;
            else if (total != expectedTotal) throw new SessionException("invalid_resource");
            if (keys.size() > 50) throw new SessionException("invalid_resource");
            validatePage(page, offset, keys.size(), total);
            for (var value : keys) {
                if (!value.isJsonObject()) throw new SessionException("invalid_resource");
                var key = value.getAsJsonObject();
                String kid = text(key, "kid", 512, false);
                if (!seen.add(kid)) throw new SessionException("invalid_resource");
                String purpose =
                        "RSA-OAEP-256".equals(text(key, "alg", 64, true))
                                ? "decrypt"
                                : "PS512".equals(text(key, "alg", 64, true))
                                        ? "sign"
                                        : "unsupported";
                try {
                    if (purpose.equals("unsupported")) throw new IllegalArgumentException();
                    var accepted =
                            TestCertificatePolicy.validate(
                                    key,
                                    purpose.equals("decrypt")
                                            ? TestCertificatePolicy.Purpose.ENCRYPTION
                                            : TestCertificatePolicy.Purpose.SIGNING,
                                    Instant.now());
                    String encoded = key.toString();
                    bytes += encoded.getBytes(StandardCharsets.UTF_8).length;
                    if (bytes > 512 * 1024) throw new SessionException("invalid_resource");
                    eligible.computeIfAbsent(purpose, ignored -> new ArrayList<>()).add(encoded);
                    summaries.add(
                            new Eligibility(
                                    kid,
                                    purpose,
                                    true,
                                    null,
                                    accepted.certificateSha256(),
                                    accepted.expiresAt().toString()));
                } catch (TestCertificatePolicy.Rejected | IllegalArgumentException rejected) {
                    summaries.add(
                            new Eligibility(
                                    kid, purpose, false, "test_certificate_required", null, null));
                }
            }
            offset += keys.size();
            if (offset == total) break;
            if (keys.isEmpty() || summaries.size() > 128)
                throw new SessionException("invalid_resource");
        }
        if (registrations.size() >= 8) throw new SessionException("invalid_resource");
        var context = new Context(id, detail.toString(), List.copyOf(summaries));
        registrations.put(id, new Registration(context, eligible));
        return context;
    }

    KeyState importKey(
            AuthenticatedSession session, String destinationId, String purpose, String document) {
        String id = id(destinationId);
        if (!Set.of("decrypt", "sign", "auto").contains(purpose)
                || document == null
                || document.getBytes(StandardCharsets.UTF_8).length > 32768)
            throw new SessionException("key_rejected");
        Registration registration = registrations.get(id);
        if (registration == null) throw new SessionException("key_missing");
        if ("auto".equals(purpose)) purpose = keyPurpose(document, registration);
        List<String> keys = registration.eligible().getOrDefault(purpose, List.of());
        if (keys.isEmpty()) throw new SessionException("test_certificate_required");
        try {
            for (String key : keys)
                TestCertificatePolicy.validate(
                        StrictJson.object(key, 65536),
                        purpose.equals("decrypt")
                                ? TestCertificatePolicy.Purpose.ENCRYPTION
                                : TestCertificatePolicy.Purpose.SIGNING,
                        Instant.now());
        } catch (TestCertificatePolicy.Rejected e) {
            throw new SessionException("test_certificate_required");
        }
        if (!document.stripLeading().startsWith("-----BEGIN PRIVATE KEY-----")) {
            try {
                var parsed = StrictJson.object(document, 32768);
                if (parsed.has("keys")) {
                    if (parsed.size() != 1
                            || array(parsed, "keys").size() != 1
                            || !array(parsed, "keys").get(0).isJsonObject())
                        throw new IllegalArgumentException();
                    parsed = array(parsed, "keys").get(0).getAsJsonObject();
                }
                if (parsed.has("x5c")) {
                    var chain = array(parsed, "x5c");
                    if (chain.size() != 1
                            || !chain.get(0).isJsonPrimitive()
                            || !chain.get(0).getAsJsonPrimitive().isString())
                        throw new IllegalArgumentException();
                }
            } catch (Exception e) {
                throw new SessionException("key_rejected");
            }
        }
        session.importKey(id, purpose, document, List.copyOf(keys));
        return new KeyState(session.loadedKeys());
    }

    /**
     * Registration matching selects a purpose. The SDK still validates and proves the private key.
     */
    private static String keyPurpose(String document, Registration registration) {
        try {
            String modulus, exponent;
            Set<String> hinted = new HashSet<>(Set.of("decrypt", "sign"));
            String source = document.trim();
            if (source.startsWith("-----BEGIN PRIVATE KEY-----")) {
                if (!source.endsWith("-----END PRIVATE KEY-----"))
                    throw new IllegalArgumentException();
                byte[] der =
                        Base64.getDecoder()
                                .decode(
                                        source.substring(27, source.length() - 25)
                                                .replaceAll("\\s", ""));
                try {
                    var key =
                            java.security.KeyFactory.getInstance("RSA")
                                    .generatePrivate(
                                            new java.security.spec.PKCS8EncodedKeySpec(der));
                    if (!(key instanceof java.security.interfaces.RSAPrivateCrtKey rsa))
                        throw new IllegalArgumentException();
                    modulus = unsigned(rsa.getModulus());
                    exponent = unsigned(rsa.getPublicExponent());
                } finally {
                    Arrays.fill(der, (byte) 0);
                }
            } else {
                var key = StrictJson.object(source, 32768);
                if (key.has("keys")) {
                    var keys = array(key, "keys");
                    if (key.size() != 1 || keys.size() != 1 || !keys.get(0).isJsonObject())
                        throw new IllegalArgumentException();
                    key = keys.get(0).getAsJsonObject();
                }
                modulus = text(key, "n", 2048, false);
                exponent = text(key, "e", 32, false);
                if (key.has("alg")) {
                    String alg = text(key, "alg", 64, false);
                    hinted.retainAll(
                            "RSA-OAEP-256".equals(alg)
                                    ? Set.of("decrypt")
                                    : "PS512".equals(alg) ? Set.of("sign") : Set.of());
                }
                if (key.has("key_ops")) {
                    var ops = array(key, "key_ops");
                    var operations = new HashSet<String>();
                    for (var op : ops) operations.add(op.getAsString());
                    if (operations.isEmpty()) hinted.clear();
                    else if (Set.of("unwrapKey", "decrypt").containsAll(operations))
                        hinted.retainAll(Set.of("decrypt"));
                    else if (Set.of("sign").equals(operations)) hinted.retainAll(Set.of("sign"));
                    else hinted.clear();
                }
            }
            var matches = new ArrayList<String>();
            for (String purpose : hinted)
                for (String encoded : registration.eligible().getOrDefault(purpose, List.of())) {
                    var registered = StrictJson.object(encoded, 65536);
                    if (modulus.equals(text(registered, "n", 2048, false))
                            && exponent.equals(text(registered, "e", 32, false)))
                        matches.add(purpose);
                }
            if (matches.size() != 1) throw new IllegalArgumentException();
            return matches.getFirst();
        } catch (Exception failure) {
            throw new SessionException("key_rejected");
        }
    }

    private static String unsigned(java.math.BigInteger number) {
        byte[] bytes = number.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    void refreshKeys(AuthenticatedSession session, String destinationId) {
        String id = id(destinationId);
        try {
            load(session, id);
            session.retainKeys(
                    id,
                    registrations.get(id).eligible().values().stream()
                            .flatMap(List::stream)
                            .toList());
        } catch (Exception failure) {
            session.retainKeys(id, List.of());
            throw failure;
        }
    }

    private static void validatePage(JsonObject page, int offset, int count, int total) {
        if (integer(page, "offset", 10000) != offset
                || integer(page, "count", 1000) != count
                || offset + count > total
                || (count == 0 && offset < total)) throw new SessionException("invalid_resource");
    }

    static String id(String value) {
        try {
            if (value == null || value.length() != 36) throw new IllegalArgumentException();
            String id = UUID.fromString(value).toString();
            if (!id.equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (Exception e) {
            throw new SessionException("invalid_input");
        }
    }

    private static JsonArray array(JsonObject value, String name) {
        if (!value.has(name) || !value.get(name).isJsonArray())
            throw new SessionException("invalid_resource");
        return value.getAsJsonArray(name);
    }

    private static String text(JsonObject value, String name, int max, boolean optional) {
        var element = value.get(name);
        if (optional && (element == null || element.isJsonNull())) return null;
        if (element == null
                || !element.isJsonPrimitive()
                || !element.getAsJsonPrimitive().isString()
                || element.getAsString().length() > max
                || (!optional && element.getAsString().isBlank()))
            throw new SessionException("invalid_resource");
        return element.getAsString();
    }

    private static int integer(JsonObject value, String name, int max) {
        var element = value.get(name);
        if (element == null
                || !element.isJsonPrimitive()
                || !element.getAsJsonPrimitive().isNumber()
                || !element.getAsString().matches("[0-9]{1,7}"))
            throw new SessionException("invalid_resource");
        int number = element.getAsInt();
        if (number > max) throw new SessionException("invalid_resource");
        return number;
    }
}
