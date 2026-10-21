package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.rest.client.services.auth.ClientCredentials;
import dev.fitko.fitconnect.rest.client.services.auth.OAuthProvider;
import dev.fitko.fitconnect.sdk.FitConnectSdk;
import dev.fitko.fitconnect.sdk.api.OutgoingReply;
import dev.fitko.fitconnect.sdk.api.OutgoingSubmission;
import dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveReport;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.contract.ProbeResult;
import org.fitconnect.integration.contract.SdkAdapter;

public final class V3Adapter implements SdkAdapter {
    public ProbeResult probe() {
        FitConnectSdk.fromConfigBuilder();
        OutgoingSubmission.class.getDeclaredMethods();
        OutgoingReply.class.getDeclaredMethods();
        ReceiveReport.class.getDeclaredMethods();
        boolean isolated =
                FitConnectSdk.class.getClassLoader() == getClass().getClassLoader()
                        && dependencyClass().getClassLoader() == getClass().getClassLoader();
        return new ProbeResult("v3", "4.0.0-rc.2", "TEST", FitConnectSdk.class.getName(), isolated);
    }

    public Class<?> dependencyClass() {
        return com.networknt.schema.SchemaRegistry.class;
    }

    public AuthenticatedSession openSession(
            String clientId,
            String clientSecret,
            TokenExchange transport,
            ResourceExchange resources) {
        // OAuthProvider is an internal SDK API, deliberately confined to the pinned RC2 adapter.
        // RC2 uses UrlBuilder.add(), which does not encode form values. Encode exactly once here.
        var http = new OAuthTransport(transport, resources);
        String encodedId = URLEncoder.encode(clientId, StandardCharsets.UTF_8);
        String encodedSecret = URLEncoder.encode(clientSecret, StandardCharsets.UTF_8);
        var provider =
                new OAuthProvider(
                        http,
                        new ClientCredentials(encodedId, encodedSecret),
                        TestTokenTransport.ENDPOINT);
        return new TokenSession(provider, http, transport, resources);
    }
}
