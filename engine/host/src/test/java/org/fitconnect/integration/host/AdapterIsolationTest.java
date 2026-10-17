package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.fitconnect.integration.contract.ApiVersion;
import org.junit.jupiter.api.Test;

class AdapterIsolationTest {
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
            assertEquals("4.0.0-rc.2", v3.sdkVersion());
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
