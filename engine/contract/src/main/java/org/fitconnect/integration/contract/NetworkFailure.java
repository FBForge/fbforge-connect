package org.fitconnect.integration.contract;

/** Fixed diagnostic codes only. Transport messages may contain proxy credentials or URLs. */
public final class NetworkFailure {
    private NetworkFailure() {}

    public static String code(Throwable failure) {
        boolean connection = false;
        for (int depth = 0; failure != null && depth < 16; depth++, failure = failure.getCause()) {
            if (failure instanceof javax.net.ssl.SSLException) return "network_tls_error";
            if (failure instanceof java.net.UnknownHostException
                    || failure instanceof java.nio.channels.UnresolvedAddressException)
                return "network_dns_error";
            if (failure instanceof java.net.http.HttpTimeoutException
                    || failure instanceof java.net.SocketTimeoutException) return "network_timeout";
            if (failure instanceof java.io.IOException
                    && failure.getMessage() != null
                    && failure.getMessage().length() < 4096
                    && failure.getMessage()
                            .matches(
                                    "(?s).*(?:HTTP/1\\.[01] 407|status code: 407|statusCode=407|407 Proxy Authentication Required).*"))
                return "proxy_authentication_required";
            if (failure instanceof java.net.ConnectException) connection = true;
        }
        return connection ? "network_connection_failed" : "auth_unavailable";
    }
}
