package org.fitconnect.integration.contract;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.net.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class NetworkProxyCredentialsTest {
    static Map<String, String> settings(String mode) {
        return Map.of(
                "FBFORGE_PROXY_MODE",
                mode,
                "FBFORGE_PROXY_HOST",
                "192.0.2.1",
                "FBFORGE_PROXY_PORT",
                "18080",
                "FBFORGE_PROXY_USERNAME",
                "synthetic-proxy-user",
                "FBFORGE_PROXY_PASSWORD",
                "synthetic-proxy-secret");
    }

    static ProxySelector selector(boolean useProxy) {
        return new ProxySelector() {
            public List<Proxy> select(URI uri) {
                return List.of(
                        useProxy
                                ? new Proxy(
                                        Proxy.Type.HTTP,
                                        InetSocketAddress.createUnresolved("192.0.2.2", 18081))
                                : Proxy.NO_PROXY);
            }

            public void connectFailed(URI uri, SocketAddress address, IOException error) {
                fail("No network connection is part of this test");
            }
        };
    }

    static PasswordAuthentication authentication(
            String host, int port, Authenticator.RequestorType type) throws Exception {
        return Authenticator.requestPasswordAuthentication(
                host,
                InetAddress.getLoopbackAddress(),
                port,
                "http",
                "synthetic-proxy-challenge",
                "basic",
                URI.create("https://example.invalid/").toURL(),
                type);
    }

    @Test
    void systemAndDirectModesNeverInheritSavedManualSecretsOrStaleRoutes() throws Exception {
        Authenticator previous = Authenticator.getDefault();
        try {
            for (String mode : List.of("system", "direct"))
                for (boolean useProxy : List.of(false, true)) {
                    Authenticator.setDefault(null);
                    NetworkProxy.initialize(settings(mode), selector(useProxy));
                    assertEquals("", NetworkProxy.username());
                    assertEquals("", NetworkProxy.password());
                    assertNull(
                            authentication("192.0.2.2", 18081, Authenticator.RequestorType.PROXY));
                    assertNull(
                            authentication("192.0.2.1", 18080, Authenticator.RequestorType.PROXY));
                    if (mode.equals("system") && useProxy) {
                        assertTrue(NetworkProxy.manual());
                        assertEquals("192.0.2.2", NetworkProxy.host());
                        assertEquals(18081, NetworkProxy.port());
                    } else {
                        assertFalse(NetworkProxy.manual());
                        assertEquals(Proxy.NO_PROXY, NetworkProxy.proxy());
                    }
                }
        } finally {
            NetworkProxy.configure(Map.of());
            Authenticator.setDefault(previous);
        }
    }

    @Test
    void explicitManualAuthenticationRemainsBoundToItsOwnProxyAndNeverAnOrigin() throws Exception {
        Authenticator previous = Authenticator.getDefault();
        try {
            Authenticator.setDefault(null);
            NetworkProxy.initialize(settings("manual"), selector(true));
            var accepted = authentication("192.0.2.1", 18080, Authenticator.RequestorType.PROXY);
            assertNotNull(accepted);
            assertEquals("synthetic-proxy-user", accepted.getUserName());
            assertArrayEquals("synthetic-proxy-secret".toCharArray(), accepted.getPassword());
            assertNull(authentication("192.0.2.2", 18081, Authenticator.RequestorType.PROXY));
            assertNull(authentication("192.0.2.1", 18081, Authenticator.RequestorType.PROXY));
            assertNull(authentication("192.0.2.1", 18080, Authenticator.RequestorType.SERVER));
            // An existing authenticator also loses access after an in-process policy change.
            NetworkProxy.configure(settings("system"));
            assertNull(authentication("192.0.2.1", 18080, Authenticator.RequestorType.PROXY));
        } finally {
            NetworkProxy.configure(Map.of());
            Authenticator.setDefault(previous);
        }
    }
}
