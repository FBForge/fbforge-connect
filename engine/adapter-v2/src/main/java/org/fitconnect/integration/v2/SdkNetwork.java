package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.api.config.http.*;
import org.fitconnect.integration.contract.NetworkProxy;

final class SdkNetwork {
    static HttpConfig http() {
        var proxy = ProxyConfig.builder();
        if (NetworkProxy.manual())
            proxy.host(NetworkProxy.host())
                    .port(NetworkProxy.port())
                    .basicAuth(new ProxyAuth(NetworkProxy.username(), NetworkProxy.password()));
        return HttpConfig.builder().proxyConfig(proxy.build()).build();
    }

    private SdkNetwork() {}
}
