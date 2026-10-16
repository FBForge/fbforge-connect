package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.*;
import java.math.BigInteger;
import java.nio.file.*;
import java.security.KeyStore;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class NativeResourceTest {
    private static final String DESTINATION = "05960a88-1b5e-4e2d-8a60-6df57699140d";
    private static RSAPrivateCrtKey privateKey;
    private static String certificate;
    private static String pem;

    @BeforeAll static void syntheticKey(@TempDir Path directory) throws Exception {
        Path store = directory.resolve("synthetic.p12");
        String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
        Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(),
                "-genkeypair", "-alias", "synthetic", "-keyalg", "RSA", "-keysize", "4096",
                "-sigalg", "SHA512withRSA", "-dname", "CN=Synthetic integration test", "-validity", "2",
                "-storetype", "PKCS12", "-keystore", store.toString(), "-storepass", "synthetic-test-only",
                "-keypass", "synthetic-test-only", "-noprompt")
                .redirectErrorStream(true).redirectOutput(directory.resolve("keytool.log").toFile()).start();
        if (!process.waitFor(45, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            fail("Synthetic test key generation timed out");
        }
        assertEquals(0, process.exitValue(), "JDK keytool must generate the synthetic local fixture");
        var keys = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(store)) { keys.load(input, "synthetic-test-only".toCharArray()); }
        privateKey = (RSAPrivateCrtKey) keys.getKey("synthetic", "synthetic-test-only".toCharArray());
        certificate = Base64.getEncoder().encodeToString(keys.getCertificate("synthetic").getEncoded());
        pem = "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder(64, new byte[]{'\n'}).encodeToString(privateKey.getEncoded())
                + "\n-----END PRIVATE KEY-----";
    }

    private AdapterRegistry adapters() {
        return new AdapterRegistry(Path.of("../adapter-v2/target/adapter-v2.jar"), Path.of("../adapter-v3/target/adapter-v3.jar"));
    }
    private static AuthenticatedSession open(AdapterRegistry registry, ApiVersion version, ResourceExchange resources) throws Exception {
        return registry.openSession(version, "synthetic-client", "synthetic-secret", (url, body) ->
                "{\"access_token\":\"synthetic-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}", resources);
    }
    private static <T> T call(AdapterRegistry registry, ApiVersion version, AuthenticatedSession session,
                              Function<AuthenticatedSession, T> operation) throws Exception {
        return registry.withSession(version, session, operation);
    }
    private static String authorization(Map<String, String> headers) {
        return headers.entrySet().stream().filter(entry -> "authorization".equalsIgnoreCase(entry.getKey()))
                .map(Map.Entry::getValue).findFirst().orElse(null);
    }

    @Test void bothSdkResourceReadersUseTheirVersionTestPathsAndPreservePagesWithoutSecrets() throws Exception {
        try (var registry = adapters()) {
            for (ApiVersion version : ApiVersion.values()) {
                var calls = new AtomicInteger();
                String api = version.wireValue();
                String query = version == ApiVersion.V2 ? "?limit=7&offset=3" : "?offset=3&limit=7";
                ResourceExchange exchange = (url, headers) -> {
                    calls.incrementAndGet();
                    String base = "https://test.fit-connect.fitko.dev";
                    if (url.equals(base + "/destination-api/" + api + "/destinations" + query)) {
                        assertEquals("Bearer synthetic-token", authorization(headers));
                        return "{\"count\":1,\"offset\":3,\"totalCount\":9,\"destinations\":[{\"destinationId\":\""
                                + DESTINATION + "\",\"name\":\"Synthetic destination\",\"status\":\"active\","
                                + "\"callback\":{\"url\":\"https://example.invalid/callback\",\"secret\":\"synthetic-callback-secret\"}}]}";
                    }
                    if (url.equals(base + "/destination-api/" + api + "/destinations/" + DESTINATION + "/keys" + query)) {
                        assertEquals("Bearer synthetic-token", authorization(headers));
                        return "{\"count\":1,\"offset\":3,\"totalCount\":9,\"keys\":[" + registration("decrypt") + "]}";
                    }
                    assertEquals(base + "/submission-api/" + api + "/destinations/" + DESTINATION, url);
                    if (version == ApiVersion.V2) assertEquals("Bearer synthetic-token", authorization(headers));
                    else assertNull(authorization(headers), "SDK4 public destination lookup must omit OAuth credentials");
                    return "{\"destinationId\":\"" + DESTINATION + "\",\"encryptionKid\":\"decrypt-key\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\"]}";
                };
                try (var session = open(registry, version, exchange)) {
                    String destinations = call(registry, version, session, s -> s.destinations(3, 7));
                    JsonObject page = JsonParser.parseString(destinations).getAsJsonObject();
                    assertPage(page);
                    assertEquals(DESTINATION, page.getAsJsonArray("destinations").get(0).getAsJsonObject().get("destinationId").getAsString());
                    assertFalse(destinations.contains("synthetic-callback-secret"));
                    assertFalse(destinations.contains("synthetic-token"));
                    page = JsonParser.parseString(call(registry, version, session, s -> s.destinationKeys(DESTINATION, 3, 7))).getAsJsonObject();
                    assertPage(page);
                    assertEquals("decrypt-key", page.getAsJsonArray("keys").get(0).getAsJsonObject().get("kid").getAsString());
                    assertEquals(DESTINATION, JsonParser.parseString(call(registry, version, session, s -> s.destination(DESTINATION)))
                            .getAsJsonObject().get("destinationId").getAsString());
                    assertEquals(3, calls.get());
                }
            }
        }
    }
    private static void assertPage(JsonObject page) {
        assertEquals(1, page.get("count").getAsInt());
        assertEquals(3, page.get("offset").getAsInt());
        assertEquals(9, page.get("totalCount").getAsInt());
    }

    @Test void bothAdaptersImportJwkJwksAndPemAndRetainOnlyNativeKeysUntilDiscardOrClose() throws Exception {
        try (var registry = adapters()) {
            for (ApiVersion version : ApiVersion.values()) {
                var session = open(registry, version, (url, headers) -> { throw new AssertionError("Key import must not perform network requests"); });
                var decrypt = call(registry, version, session, s -> s.importKey(DESTINATION, "decrypt", privateJwk().toString(), List.of(registration("decrypt"))));
                assertEquals(new KeyReference(DESTINATION, "decrypt-key", "decrypt"), decrypt);
                JsonObject set = new JsonObject(); var array = new JsonArray(); array.add(privateJwk()); set.add("keys", array);
                var sign = call(registry, version, session, s -> s.importKey(DESTINATION, "sign", set.toString(), List.of(registration("sign"))));
                assertEquals(new KeyReference(DESTINATION, "sign-key", "sign"), sign);
                assertEquals(Set.of(decrypt, sign), new HashSet<>(call(registry, version, session, AuthenticatedSession::loadedKeys)));
                call(registry, version, session, s -> { s.check(); return null; });
                assertEquals(2, call(registry, version, session, AuthenticatedSession::loadedKeys).size());
                call(registry, version, session, s -> { s.discardKeys(); return null; });
                assertTrue(call(registry, version, session, AuthenticatedSession::loadedKeys).isEmpty());
                assertEquals(decrypt, call(registry, version, session, s -> s.importKey(DESTINATION, "decrypt", pem, List.of(registration("decrypt")))));
                session.close();
                assertThrows(SessionException.class, () -> call(registry, version, session, AuthenticatedSession::loadedKeys));
                assertThrows(SessionException.class, () -> call(registry, version, session, s -> s.destination(DESTINATION)));
                assertThrows(SessionException.class, () -> call(registry, version, session, s -> s.importKey(DESTINATION, "decrypt", pem, List.of(registration("decrypt")))));
            }
        }
    }

    @Test void bothAdaptersRejectAmbiguousMismatchedAndIncorrectlyDeclaredPrivateKeysWithoutLosingLoadedKeys() throws Exception {
        try (var registry = adapters()) {
            for (ApiVersion version : ApiVersion.values()) {
                try (var session = open(registry, version, (url, headers) -> { throw new AssertionError("Unexpected network"); })) {
                    call(registry, version, session, s -> s.importKey(DESTINATION, "decrypt", privateJwk().toString(), List.of(registration("decrypt"))));
                    JsonObject publicOnly = publicJwk();
                    reject(registry, version, session, publicOnly.toString(), List.of(registration("decrypt")));
                    JsonObject wrongKid = privateJwk(); wrongKid.addProperty("kid", "different-key");
                    reject(registry, version, session, wrongKid.toString(), List.of(registration("decrypt")));
                    JsonObject wrongPurpose = privateJwk(); var ops = new JsonArray(); ops.add("sign"); wrongPurpose.add("key_ops", ops);
                    reject(registry, version, session, wrongPurpose.toString(), List.of(registration("decrypt")));
                    JsonObject wrongAlgorithm = privateJwk(); wrongAlgorithm.addProperty("alg", "PS512");
                    reject(registry, version, session, wrongAlgorithm.toString(), List.of(registration("decrypt")));
                    JsonObject mismatched = JsonParser.parseString(registration("decrypt")).getAsJsonObject(); mismatched.addProperty("n", unsigned(privateKey.getModulus().add(BigInteger.TWO)));
                    reject(registry, version, session, privateJwk().toString(), List.of(mismatched.toString()));
                    reject(registry, version, session, privateJwk().toString(), List.of(registration("decrypt"), registration("decrypt")));
                    JsonObject mismatchedChain = privateJwk(); var chain = new JsonArray(); chain.add("AQID"); mismatchedChain.add("x5c", chain);
                    reject(registry, version, session, mismatchedChain.toString(), List.of(registration("decrypt")));
                    JsonObject brokenPrivate = privateJwk(); brokenPrivate.addProperty("d", "AQAB"); brokenPrivate.remove("p"); brokenPrivate.remove("q"); brokenPrivate.remove("dp"); brokenPrivate.remove("dq"); brokenPrivate.remove("qi");
                    reject(registry, version, session, brokenPrivate.toString(), List.of(registration("decrypt")));
                    assertEquals(1, call(registry, version, session, AuthenticatedSession::loadedKeys).size());
                }
            }
        }
    }
    @Test void automaticImportUsesKeyOperationsOrTheUniqueRegistrationForJwkJwksAndPem() throws Exception {
        try (var registry = adapters()) {
            for (ApiVersion version : ApiVersion.values()) for (String purpose : List.of("decrypt", "sign")) {
                ResourceExchange transport = (url, headers) -> url.contains("/keys?")
                        ? "{\"offset\":0,\"count\":1,\"totalCount\":1,\"keys\":[" + registration(purpose) + "]}"
                        : "{\"destinationId\":\"" + DESTINATION + "\",\"status\":\"active\",\"metadataVersions\":[\"2.0.0\"]}";
                try (var session = open(registry, version, transport)) {
                    var access = new DestinationAccess();
                    call(registry, version, session, s -> access.load(s, DESTINATION));
                    var jwk = privateJwk(); var ops = new JsonArray(); ops.add(purpose.equals("decrypt") ? "unwrapKey" : "sign"); jwk.add("key_ops", ops);
                    var set = new JsonObject(); var members = new JsonArray(); members.add(jwk); set.add("keys", members);
                    for (String document : List.of(jwk.toString(), set.toString(), pem)) {
                        var state = call(registry, version, session, s -> access.importKey(s, DESTINATION, "auto", document));
                        assertEquals(List.of(new KeyReference(DESTINATION, purpose + "-key", purpose)), state.keys());
                        call(registry, version, session, s -> { s.discardKeys(); return null; });
                    }
                    var wrong = privateJwk(); var wrongOps = new JsonArray(); wrongOps.add(purpose.equals("decrypt") ? "sign" : "unwrapKey"); wrong.add("key_ops", wrongOps);
                    assertThrows(SessionException.class, () -> call(registry, version, session, s -> access.importKey(s, DESTINATION, "auto", wrong.toString())));
                    assertTrue(session.loadedKeys().isEmpty());
                }
            }
        }
    }

    private static void reject(AdapterRegistry registry, ApiVersion version, AuthenticatedSession session, String document, List<String> registrations) {
        var error = assertThrows(SessionException.class, () -> call(registry, version, session,
                s -> s.importKey(DESTINATION, "decrypt", document, registrations)));
        assertEquals("key_rejected", error.code());
    }
    private static JsonObject publicJwk() {
        JsonObject key = new JsonObject(); key.addProperty("kty", "RSA");
        key.addProperty("n", unsigned(privateKey.getModulus())); key.addProperty("e", unsigned(privateKey.getPublicExponent()));
        return key;
    }
    private static JsonObject privateJwk() {
        JsonObject key = publicJwk();
        key.addProperty("d", unsigned(privateKey.getPrivateExponent())); key.addProperty("p", unsigned(privateKey.getPrimeP()));
        key.addProperty("q", unsigned(privateKey.getPrimeQ())); key.addProperty("dp", unsigned(privateKey.getPrimeExponentP()));
        key.addProperty("dq", unsigned(privateKey.getPrimeExponentQ())); key.addProperty("qi", unsigned(privateKey.getCrtCoefficient()));
        return key;
    }
    private static String registration(String purpose) {
        JsonObject key = publicJwk(); key.addProperty("kid", purpose + "-key");
        key.addProperty("alg", "decrypt".equals(purpose) ? "RSA-OAEP-256" : "PS512");
        var ops = new JsonArray(); ops.add("decrypt".equals(purpose) ? "wrapKey" : "verify"); key.add("key_ops", ops);
        var chain = new JsonArray(); chain.add(certificate); key.add("x5c", chain);
        return key.toString();
    }
    private static String unsigned(BigInteger number) {
        byte[] bytes = number.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
