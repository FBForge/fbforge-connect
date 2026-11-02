package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.net.http.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class NetworkProxyTest {
    @Test
    void configuredProxyCarriesRequestsWithoutLeakingCredentialsToTheOrigin() throws Exception {
        var server =
                com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var observed = new java.util.concurrent.atomic.AtomicReference<String>();
        server.createContext(
                "/resource",
                exchange -> {
                    observed.set(exchange.getRequestURI().toString());
                    assertNull(exchange.getRequestHeaders().getFirst("Authorization"));
                    assertNull(exchange.getRequestHeaders().getFirst("Proxy-Authorization"));
                    byte[] body = "proxied".getBytes();
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
        server.start();
        try {
            NetworkProxy.configure(
                    Map.of(
                            "FBFORGE_PROXY_MODE",
                            "manual",
                            "FBFORGE_PROXY_HOST",
                            "127.0.0.1",
                            "FBFORGE_PROXY_PORT",
                            String.valueOf(server.getAddress().getPort()),
                            "FBFORGE_PROXY_USERNAME",
                            "proxy-user",
                            "FBFORGE_PROXY_PASSWORD",
                            "synthetic-proxy-password"));
            try (var client = NetworkProxy.apply(HttpClient.newBuilder()).build()) {
                var response =
                        client.send(
                                HttpRequest.newBuilder(
                                                URI.create("http://unresolvable.invalid/resource"))
                                        .GET()
                                        .build(),
                                HttpResponse.BodyHandlers.ofString());
                assertEquals("proxied", response.body());
                assertEquals("http://unresolvable.invalid/resource", observed.get());
            }

            try (var adapters = ReceiverTestSupport.registry()) {
                for (var api : ApiVersion.values()) {
                    var loader = adapters.dependencyClass(api).getClassLoader();
                    String prefix = "org.fitconnect.integration." + api.wireValue() + ".";
                    var type = loader.loadClass(prefix + "SdkNetwork");
                    var method = type.getDeclaredMethod(api == ApiVersion.V2 ? "http" : "settings");
                    method.setAccessible(true);
                    Object config = method.invoke(null);
                    if (api == ApiVersion.V3) {
                        config = config.getClass().getMethod("build").invoke(config);
                        config = config.getClass().getMethod("httpConfig").invoke(config);
                    }
                    Object proxyConfig =
                            config.getClass()
                                    .getMethod(
                                            api == ApiVersion.V2 ? "getProxyConfig" : "proxyConfig")
                                    .invoke(config);
                    Proxy proxy =
                            (Proxy)
                                    proxyConfig
                                            .getClass()
                                            .getMethod("getHttpProxy")
                                            .invoke(proxyConfig);
                    assertEquals(
                            server.getAddress().getPort(),
                            ((InetSocketAddress) proxy.address()).getPort());
                    var schemaType =
                            loader.loadClass(
                                    "org.fitconnect.integration.adapters.PublicSchemaHttp");
                    var http = schemaType.getDeclaredField("HTTP");
                    http.setAccessible(true);
                    Object client = http.get(null);
                    Proxy schemaProxy = (Proxy) client.getClass().getMethod("proxy").invoke(client);
                    assertEquals(
                            server.getAddress().getPort(),
                            ((InetSocketAddress) schemaProxy.address()).getPort());
                }
            }

        } finally {
            NetworkProxy.configure(Map.of());
            server.stop(0);
        }
    }

    @Test
    void directModeAndInvalidProxyConfigurationAreExplicit() {
        try {
            NetworkProxy.configure(Map.of("FBFORGE_PROXY_MODE", "direct"));
            try (var client = NetworkProxy.apply(HttpClient.newBuilder()).build()) {
                assertEquals(
                        Proxy.NO_PROXY,
                        client.proxy()
                                .orElseThrow()
                                .select(URI.create("https://example.org"))
                                .getFirst());
            }
            assertThrows(
                    SessionException.class,
                    () ->
                            NetworkProxy.configure(
                                    Map.of(
                                            "FBFORGE_PROXY_MODE",
                                            "manual",
                                            "FBFORGE_PROXY_HOST",
                                            "http://bad/",
                                            "FBFORGE_PROXY_PORT",
                                            "8080")));
        } finally {
            NetworkProxy.configure(Map.of());
        }
    }
}
