package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

/** Exercise the actual shared client under each isolated SDK's HTTP runtime. No network. */
class PublicSchemaProxyTest {
    private static Object get(Object object, String method) throws Exception {
        return object.getClass().getMethod(method).invoke(object);
    }

    private static Object route(ClassLoader loader, Object client, Proxy proxy) throws Exception {
        var address = loader.loadClass("okhttp3.Address");
        var constructor =
                Arrays.stream(address.getConstructors())
                        .filter(value -> value.getParameterCount() == 12)
                        .findFirst()
                        .orElseThrow();
        Object configured =
                constructor.newInstance(
                        "schema.example.test",
                        443,
                        get(client, "dns"),
                        get(client, "socketFactory"),
                        get(client, "sslSocketFactory"),
                        get(client, "hostnameVerifier"),
                        get(client, "certificatePinner"),
                        get(client, "proxyAuthenticator"),
                        proxy,
                        get(client, "protocols"),
                        get(client, "connectionSpecs"),
                        get(client, "proxySelector"));
        return loader.loadClass("okhttp3.Route")
                .getConstructor(address, Proxy.class, InetSocketAddress.class)
                .newInstance(configured, proxy, new InetSocketAddress("127.0.0.1", 8080));
    }

    private static Object challenge(ClassLoader loader, String method, boolean authorized)
            throws Exception {
        var builderType = loader.loadClass("okhttp3.Request$Builder");
        Object builder = builderType.getConstructor().newInstance();
        builderType
                .getMethod("url", String.class)
                .invoke(builder, "https://schema.example.test/schema");
        builderType
                .getMethod("method", String.class, loader.loadClass("okhttp3.RequestBody"))
                .invoke(builder, method, null);
        if (authorized)
            builderType
                    .getMethod("header", String.class, String.class)
                    .invoke(builder, "Proxy-Authorization", "existing");
        Object request = get(builder, "build");
        var responseType = loader.loadClass("okhttp3.Response$Builder");
        Object response = responseType.getConstructor().newInstance();
        responseType
                .getMethod("request", loader.loadClass("okhttp3.Request"))
                .invoke(response, request);
        responseType
                .getMethod("protocol", loader.loadClass("okhttp3.Protocol"))
                .invoke(
                        response,
                        loader.loadClass("okhttp3.Protocol").getField("HTTP_1_1").get(null));
        responseType.getMethod("code", int.class).invoke(response, 407);
        responseType.getMethod("message", String.class).invoke(response, "Fixture challenge");
        return get(response, "build");
    }

    @Test
    void credentialsBelongOnlyToConnectAtTheConfiguredProxyForBothSdkRuntimes() throws Exception {
        NetworkProxy.configure(
                Map.of(
                        "FBFORGE_PROXY_MODE",
                        "manual",
                        "FBFORGE_PROXY_HOST",
                        "127.0.0.1",
                        "FBFORGE_PROXY_PORT",
                        "8080",
                        "FBFORGE_PROXY_USERNAME",
                        "fixture-user",
                        "FBFORGE_PROXY_PASSWORD",
                        "fixture-password"));
        try (var adapters = ReceiverTestSupport.registry()) {
            for (var api : ApiVersion.values()) {
                var loader = adapters.dependencyClass(api).getClassLoader();
                var type = loader.loadClass("org.fitconnect.integration.adapters.PublicSchemaHttp");
                var dns = loader.loadClass("okhttp3.Dns").getField("SYSTEM").get(null);
                Object client =
                        type.getMethod("client", loader.loadClass("okhttp3.Dns")).invoke(null, dns);
                Object authenticator = get(client, "proxyAuthenticator");
                var authenticate =
                        loader.loadClass("okhttp3.Authenticator")
                                .getMethod(
                                        "authenticate",
                                        loader.loadClass("okhttp3.Route"),
                                        loader.loadClass("okhttp3.Response"));
                Object expectedRoute = route(loader, client, NetworkProxy.proxy());
                Object result =
                        authenticate.invoke(
                                authenticator, expectedRoute, challenge(loader, "CONNECT", false));
                assertNotNull(result, api.toString());
                assertEquals(
                        "Basic "
                                + Base64.getEncoder()
                                        .encodeToString(
                                                "fixture-user:fixture-password"
                                                        .getBytes(
                                                                java.nio.charset.StandardCharsets
                                                                        .ISO_8859_1)),
                        result.getClass()
                                .getMethod("header", String.class)
                                .invoke(result, "Proxy-Authorization"));
                assertNull(
                        authenticate.invoke(
                                authenticator, expectedRoute, challenge(loader, "GET", false)));
                assertNull(
                        authenticate.invoke(
                                authenticator, null, challenge(loader, "CONNECT", false)));
                assertNull(
                        authenticate.invoke(
                                authenticator, expectedRoute, challenge(loader, "CONNECT", true)));
                for (Proxy wrong :
                        List.of(
                                Proxy.NO_PROXY,
                                new Proxy(
                                        Proxy.Type.HTTP,
                                        InetSocketAddress.createUnresolved(
                                                "other.example.test", 8080)),
                                new Proxy(
                                        Proxy.Type.HTTP,
                                        InetSocketAddress.createUnresolved("127.0.0.1", 8081))))
                    assertNull(
                            authenticate.invoke(
                                    authenticator,
                                    route(loader, client, wrong),
                                    challenge(loader, "CONNECT", false)));
            }
        } finally {
            NetworkProxy.configure(Map.of());
        }
    }
}
