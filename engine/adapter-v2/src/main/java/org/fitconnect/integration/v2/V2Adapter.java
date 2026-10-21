package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.domain.sender.SendableSubmission;
import dev.fitko.fitconnect.client.SenderClient;
import dev.fitko.fitconnect.client.SubscriberClient;
import dev.fitko.fitconnect.core.auth.DefaultOAuthApiService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.fitconnect.integration.contract.*;

public final class V2Adapter implements SdkAdapter {
    public ProbeResult probe() {
        // Resolve method signatures as well as entry classes without creating a network client.
        SenderClient.class.getDeclaredMethods();
        SubscriberClient.class.getDeclaredMethods();
        SendableSubmission.Builder();
        boolean isolated =
                SenderClient.class.getClassLoader() == getClass().getClassLoader()
                        && dependencyClass().getClassLoader() == getClass().getClassLoader();
        return new ProbeResult("v2", "3.5.2", "TEST", SenderClient.class.getName(), isolated);
    }

    public Class<?> dependencyClass() {
        return com.networknt.schema.SchemaRegistry.class;
    }

    public AuthenticatedSession openSession(
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources) {
        // SDK 3.5.2 joins form parameters without encoding. Escape at this pinned adapter boundary.
        var http = new OAuthTransport(transport, resources);
        var provider =
                new DefaultOAuthApiService(
                        http,
                        URLEncoder.encode(clientId, StandardCharsets.UTF_8),
                        URLEncoder.encode(clientSecret, StandardCharsets.UTF_8),
                        "https://auth-testing.fit-connect.fitko.dev");
        return new TokenSession(provider, http, transport, resources);
    }
}
