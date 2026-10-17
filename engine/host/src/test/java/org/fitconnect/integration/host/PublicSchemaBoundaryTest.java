package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.*;
import java.net.*;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.SessionException;
import org.junit.jupiter.api.Test;

/** Pure boundary tests against both packaged SDK adapters. No requests leave this test. */
class PublicSchemaBoundaryTest {
    private static Object call(
            ClassLoader loader, String name, String method, Class<?> argument, Object value)
            throws Exception {
        var operation = loader.loadClass(name).getDeclaredMethod(method, argument);
        operation.setAccessible(true);
        try {
            return operation.invoke(null, value);
        } catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException cause) throw cause;
            throw failure;
        }
    }

    @Test
    void bothAdaptersRejectPrivateAddressesAndNonHttpsSchemaTargetsWithoutNetwork()
            throws Exception {
        for (String version : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of(
                                                "../adapter-"
                                                        + version
                                                        + "/target/adapter-"
                                                        + version
                                                        + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                String type = "org.fitconnect.integration." + version + ".PublicSchemaHttp";
                for (String url :
                        List.of(
                                "file:///etc/passwd",
                                "http://example.invalid/schema",
                                "https://localhost/schema",
                                "https://127.0.0.1/schema",
                                "https://169.254.169.254/latest/meta-data/",
                                "https://user:password@example.invalid/schema"))
                    assertThrows(
                            SessionException.class,
                            () -> call(loader, type, "uri", String.class, url));
                for (String ip :
                        List.of(
                                "10.1.1.1",
                                "192.168.1.1",
                                "172.16.1.1",
                                "100.64.0.1",
                                "::1",
                                "fc00::1"))
                    assertThrows(
                            SessionException.class,
                            () ->
                                    call(
                                            loader,
                                            type,
                                            "checkedAddresses",
                                            List.class,
                                            List.of(InetAddress.getByName(ip))));
                assertEquals(
                        URI.create("https://example.invalid/schema"),
                        call(loader, type, "uri", String.class, "https://example.invalid/schema"));
            }
    }

    @Test
    void nestedReferencesCannotBypassTheBoundedSchemaTransportViaTheSdkValidator()
            throws Exception {
        for (String version : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of(
                                                "../adapter-"
                                                        + version
                                                        + "/target/adapter-"
                                                        + version
                                                        + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                String type = "org.fitconnect.integration." + version + ".SchemaSafety";
                String valid =
                        "{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$defs\":{\"x\":{\"type\":\"string\"}},\"$ref\":\"#/$defs/x\"}";
                assertEquals(valid, call(loader, type, "check", String.class, valid));
                for (String invalid :
                        List.of(
                                "{\"$schema\":\"https://example.invalid/dialect\"}",
                                "<!DOCTYPE x><x/>"))
                    assertThrows(
                            SessionException.class,
                            () -> call(loader, type, "check", String.class, invalid));
            }
    }
}
