package org.fitconnect.integration.contract;

import java.net.*;
import java.net.http.HttpClient;
import java.util.*;

/**
 * Process-owned proxy policy. No credentials in arguments, URLs, diagnostics or application
 * headers.
 */
public final class NetworkProxy {
    private static String mode = "system", host = "", username = "", password = "";
    private static int port;

    private NetworkProxy() {}

    public static void initialize() {
        initialize(System.getenv(), ProxySelector.getDefault());
    }

    static void initialize(Map<String, String> values, ProxySelector selector) {
        configure(values);
        if (mode.equals("system")) {
            if (selector != null)
                for (var proxy :
                        selector.select(
                                URI.create(IntegrationEnvironment.current().tokenEndpoint()))) {
                    if (proxy.type() == Proxy.Type.HTTP
                            && proxy.address() instanceof InetSocketAddress address) {
                        host = address.getHostString();
                        port = address.getPort();
                        break;
                    }
                }
        }
        if (hasCredentials()) {
            System.setProperty("jdk.http.auth.tunneling.disabledSchemes", "");
            Authenticator.setDefault(authenticator());
        }
    }

    public static void configure(Map<String, String> values) {
        mode = values.getOrDefault("FBFORGE_PROXY_MODE", "system");
        if (!Set.of("system", "direct", "manual").contains(mode))
            throw new SessionException("proxy_invalid");
        // Saved manual settings are dormant in system/direct mode. A newly selected
        // system route must never inherit another proxy's credential or stale host.
        host = username = password = "";
        port = 0;
        if (!mode.equals("manual")) return;
        host = values.getOrDefault("FBFORGE_PROXY_HOST", "");
        username = values.getOrDefault("FBFORGE_PROXY_USERNAME", "");
        password = values.getOrDefault("FBFORGE_PROXY_PASSWORD", "");
        try {
            port = Integer.parseInt(values.getOrDefault("FBFORGE_PROXY_PORT", "0"));
        } catch (NumberFormatException e) {
            throw new SessionException("proxy_invalid");
        }
        if (host.isBlank()
                || host.length() > 253
                || !host.matches("[A-Za-z0-9.:-]+")
                || port < 1
                || port > 65535) throw new SessionException("proxy_invalid");
    }

    private static boolean hasCredentials() {
        return mode.equals("manual") && !username.isEmpty();
    }

    // Effective proxy route, including a route selected by the OS. Authentication
    // is independently restricted to explicit manual configuration.
    public static boolean manual() {
        return !mode.equals("direct") && !host.isEmpty() && port > 0;
    }

    public static boolean direct() {
        return mode.equals("direct");
    }

    public static String host() {
        return host;
    }

    public static int port() {
        return port;
    }

    public static String username() {
        return username;
    }

    public static String password() {
        return password;
    }

    public static Proxy proxy() {
        return manual()
                ? new Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(host, port))
                : Proxy.NO_PROXY;
    }

    public static HttpClient.Builder apply(HttpClient.Builder builder) {
        if (manual()) builder.proxy(ProxySelector.of(new InetSocketAddress(host, port)));
        if (direct())
            builder.proxy(
                    new ProxySelector() {
                        public List<Proxy> select(URI uri) {
                            return List.of(Proxy.NO_PROXY);
                        }

                        public void connectFailed(
                                URI uri, SocketAddress address, java.io.IOException e) {}
                    });
        if (hasCredentials()) builder.authenticator(authenticator());
        return builder;
    }

    private static Authenticator authenticator() {
        return new Authenticator() {
            protected PasswordAuthentication getPasswordAuthentication() {
                return hasCredentials()
                                && getRequestorType() == RequestorType.PROXY
                                && host.equalsIgnoreCase(getRequestingHost())
                                && port == getRequestingPort()
                        ? new PasswordAuthentication(username, password.toCharArray())
                        : null;
            }
        };
    }
}
