package org.fitconnect.integration.contract;

/**
 * One immutable environment per native-owned engine process. Callers cannot supply service URLs.
 */
public enum IntegrationEnvironment {
    TEST(
            "test.fit-connect.fitko.dev",
            "auth-testing.fit-connect.fitko.dev",
            "submission-api-testing.fit-connect.fitko.dev"),
    STAGE(
            "stage.fit-connect.fitko.net",
            "auth-refz.fit-connect.fitko.net",
            "submission-api-refz.fit-connect.niedersachsen.de"),
    PROD(
            "prod.fit-connect.fitko.net",
            "auth-prod.fit-connect.fitko.net",
            "submission-api-prod.fit-connect.niedersachsen.de");

    private final String gateway;
    private final String auth;
    private final String issuer;

    IntegrationEnvironment(String gateway, String auth, String issuer) {
        this.gateway = gateway;
        this.auth = auth;
        this.issuer = issuer;
    }

    private static final class Runtime {
        static final IntegrationEnvironment VALUE =
                valueOf(System.getProperty("fbforge.environment", "TEST"));
    }

    public static IntegrationEnvironment current() {
        return Runtime.VALUE;
    }

    public String gatewayHost() {
        return gateway;
    }

    public String serviceRoot() {
        return "https://" + gateway;
    }

    public String submissionApi() {
        return serviceRoot() + "/submission-api";
    }

    public String destinationApi() {
        return serviceRoot() + "/destination-api";
    }

    public String authRoot() {
        return "https://" + auth;
    }

    public String tokenEndpoint() {
        return authRoot() + "/token";
    }

    public boolean requiresVpki() {
        return this != TEST;
    }

    public boolean submissionIssuer(String value) {
        return serviceRoot().equals(value)
                || submissionApi().equals(value)
                || ("https://" + issuer).equals(value);
    }
}
