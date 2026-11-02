package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.fitconnect.integration.contract.ApiVersion;
import org.junit.jupiter.api.Test;

class AdapterIsolationTest {
    @Test
    void sharedSchemaTransportStaysPrivateToEachSdkClassloader() throws Exception {
        try (var registry =
                new AdapterRegistry(
                        Path.of("../adapter-v2/target/adapter-v2.jar"),
                        Path.of("../adapter-v3/target/adapter-v3.jar"))) {
            var v2 = registry.dependencyClass(ApiVersion.V2).getClassLoader();
            var v3 = registry.dependencyClass(ApiVersion.V3).getClassLoader();
            String name = "org.fitconnect.integration.adapters.PublicSchemaHttp";
            var first = v2.loadClass(name);
            var second = v3.loadClass(name);
            assertNotSame(first, second);
            assertSame(v2, first.getClassLoader());
            assertSame(v3, second.getClassLoader());
            assertSame(
                    org.fitconnect.integration.contract.SessionException.class,
                    v2.loadClass("org.fitconnect.integration.contract.SessionException"));
            assertThrows(
                    ClassNotFoundException.class,
                    () -> getClass().getClassLoader().loadClass(name));
            String resource = name.replace('.', '/') + ".class";
            try (var left = v2.getResourceAsStream(resource);
                    var right = v3.getResourceAsStream(resource)) {
                assertNotNull(left);
                assertNotNull(right);
                assertArrayEquals(left.readAllBytes(), right.readAllBytes());
            }
        }
    }

    @Test
    void bothPackagedSdksLinkWithoutSharingTheirDependencyClasses() throws Exception {
        // Earlier reactor modules are packaged before the host tests start.
        try (var registry =
                new AdapterRegistry(
                        Path.of("../adapter-v2/target/adapter-v2.jar"),
                        Path.of("../adapter-v3/target/adapter-v3.jar"))) {
            var v2 = registry.probe(ApiVersion.V2);
            var v3 = registry.probe(ApiVersion.V3);
            assertEquals("v2", v2.apiVersion());
            assertEquals("3.5.2", v2.sdkVersion());
            assertEquals("v3", v3.apiVersion());
            assertEquals("4.0.0", v3.sdkVersion());
            assertEquals("TEST", v2.environment());
            assertEquals("TEST", v3.environment());
            assertTrue(v2.isolated());
            assertTrue(v3.isolated());
            assertNotSame(
                    registry.dependencyClass(ApiVersion.V2),
                    registry.dependencyClass(ApiVersion.V3));
            assertNotSame(
                    registry.dependencyClass(ApiVersion.V2).getClassLoader(),
                    getClass().getClassLoader());
            assertNotSame(
                    registry.dependencyClass(ApiVersion.V3).getClassLoader(),
                    getClass().getClassLoader());
            assertEquals(v2, registry.probe(ApiVersion.V2));
        }
    }
}
