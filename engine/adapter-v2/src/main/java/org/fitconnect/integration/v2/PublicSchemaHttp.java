package org.fitconnect.integration.v2;

import java.io.IOException;
import java.net.*;
import java.util.List;
import okhttp3.*;

/** SDK-local facade. Shared transport code is shaded into each isolated adapter. */
final class PublicSchemaHttp {
    static OkHttpClient client(Dns resolver) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.client(resolver);
    }

    static String text(String value) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.text(
                value, SchemaSafety::check);
    }

    static byte[] archive(String value) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.archive(value);
    }

    static URI uri(String value) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.uri(value);
    }

    static List<InetAddress> checkedAddresses(List<InetAddress> addresses) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.checkedAddresses(addresses);
    }

    static boolean isPublic(InetAddress address) {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.isPublic(address);
    }

    static byte[] fetch(URI value, int limit) throws IOException {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.fetch(value, limit);
    }

    static byte[] fetch(URI value, int limit, Call.Factory calls) throws IOException {
        return org.fitconnect.integration.adapters.PublicSchemaHttp.fetch(value, limit, calls);
    }
}
