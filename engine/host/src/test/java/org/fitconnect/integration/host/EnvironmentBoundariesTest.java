package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Separate JVMs prove immutable configuration without changing process-global state in tests. */
class EnvironmentBoundariesTest {
    @TempDir Path directory;

    @Test
    void environmentsPinBothSdksAndRejectForeignEndpointsAndTestCertificates() throws Exception {
        Path fixture = directory.resolve("synthetic-material.json");
        try (var adapters = registry();
                var session = session(adapters, ApiVersion.V3)) {
            var key =
                    adapters.withSession(
                            ApiVersion.V3, session, value -> value.generateTestKey("decrypt"));
            Files.writeString(fixture, key.publicJwk());
        }
        for (var environment : IntegrationEnvironment.values()) {
            var child =
                    new ProcessBuilder(
                                    java(),
                                    "-Dfbforge.environment=" + environment.name(),
                                    "-cp",
                                    System.getProperty("java.class.path"),
                                    getClass().getName(),
                                    fixture.toString())
                            .redirectError(ProcessBuilder.Redirect.DISCARD)
                            .start();
            assertTrue(child.waitFor(60, TimeUnit.SECONDS), "Environment probe timed out");
            assertEquals(0, child.exitValue(), environment.name());
            assertEquals(
                    "verified",
                    new String(
                            child.getInputStream().readAllBytes(),
                            java.nio.charset.StandardCharsets.UTF_8));
        }
        var invalid =
                new ProcessBuilder(
                                java(),
                                "-Dfbforge.environment=LOCAL",
                                "-cp",
                                System.getProperty("java.class.path"),
                                getClass().getName(),
                                fixture.toString())
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start();
        assertTrue(invalid.waitFor(10, TimeUnit.SECONDS));
        assertNotEquals(0, invalid.exitValue());
    }

    public static void main(String[] args) throws Exception {
        var environment = IntegrationEnvironment.current();
        var key = JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        assertEquals(environment.tokenEndpoint(), TestTokenTransport.ENDPOINT);
        try (var token = new TestTokenTransport();
                var resources = new TestResourceTransport();
                var adapters = registry()) {
            for (var other : IntegrationEnvironment.values()) {
                if (other == environment) continue;
                assertEquals(
                        "endpoint_blocked",
                        assertThrows(
                                        SessionException.class,
                                        () -> token.post(other.tokenEndpoint(), ""))
                                .code());
                for (var api : ApiVersion.values()) {
                    assertEquals(
                            "endpoint_blocked",
                            assertThrows(
                                            SessionException.class,
                                            () ->
                                                    resources
                                                            .forVersion(api)
                                                            .get(
                                                                    other.destinationApi()
                                                                            + "/"
                                                                            + api.wireValue()
                                                                            + "/destinations",
                                                                    Map.of()))
                                    .code());
                }
                assertFalse(environment.submissionIssuer(other.submissionApi()));
            }
            for (var api : ApiVersion.values()) {
                assertEquals(environment.name(), adapters.probe(api).environment());
                try (var session = session(adapters, api)) {
                    if (environment.requiresVpki()) {
                        assertEquals(
                                "vpki_certificate_required",
                                assertThrows(
                                                SessionException.class,
                                                () ->
                                                        adapters.withSession(
                                                                api,
                                                                session,
                                                                value -> {
                                                                    value.validatePublicKey(
                                                                            key.toString(),
                                                                            "decrypt");
                                                                    return null;
                                                                }))
                                        .code());
                        assertThrows(
                                TestCertificatePolicy.Rejected.class,
                                () ->
                                        TestCertificatePolicy.validate(
                                                key,
                                                TestCertificatePolicy.Purpose.ENCRYPTION,
                                                Instant.now()));
                        assertEquals(
                                "vpki_certificate_required",
                                assertThrows(
                                                SessionException.class,
                                                () -> new LocalTestKeys().generate(session))
                                        .code());
                    } else {
                        assertNotNull(
                                TestCertificatePolicy.validate(
                                        key,
                                        TestCertificatePolicy.Purpose.ENCRYPTION,
                                        Instant.now()));
                    }
                }
            }
        }
        System.out.print("verified");
    }

    private static AdapterRegistry registry() {
        return new AdapterRegistry(
                Path.of("../adapter-v2/target/adapter-v2.jar"),
                Path.of("../adapter-v3/target/adapter-v3.jar"));
    }

    private static AuthenticatedSession session(AdapterRegistry registry, ApiVersion api)
            throws Exception {
        return registry.openSession(
                api,
                "synthetic-client",
                "synthetic-secret",
                (url, body) -> {
                    assertEquals(IntegrationEnvironment.current().tokenEndpoint(), url);
                    return "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}";
                });
    }

    private static String java() {
        return Path.of(
                        System.getProperty("java.home"),
                        "bin",
                        System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java")
                .toString();
    }
}
