package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.rest.client.config.FitConnectEnvironment;
import org.fitconnect.integration.contract.IntegrationEnvironment;

final class SdkEnvironment {
    private SdkEnvironment() {}

    static FitConnectEnvironment current() {
        return switch (IntegrationEnvironment.current()) {
            case TEST -> FitConnectEnvironment.TEST;
            case STAGE -> FitConnectEnvironment.STAGE;
            case PROD -> FitConnectEnvironment.PROD;
        };
    }
}
