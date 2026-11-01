package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.core.http.config.*;
import dev.fitko.fitconnect.sdk.config.settings.SdkSettings;
import org.fitconnect.integration.contract.NetworkProxy;

final class SdkNetwork {
    static SdkSettings.Builder settings() {
        var proxy = ProxyConfig.builder();
        if (NetworkProxy.manual())
            proxy.host(NetworkProxy.host())
                    .port(NetworkProxy.port())
                    .basicAuth(new ProxyAuth(NetworkProxy.username(), NetworkProxy.password()));
        return SdkSettings.builder()
                .httpConfig(HttpConfig.builder().proxyConfig(proxy.build()).build());
    }

    private SdkNetwork() {}
}
