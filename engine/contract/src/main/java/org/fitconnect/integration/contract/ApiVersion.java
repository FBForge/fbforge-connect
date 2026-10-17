package org.fitconnect.integration.contract;

public enum ApiVersion {
    V2("v2"),
    V3("v3");
    private final String wireValue;

    ApiVersion(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }

    public static ApiVersion parse(String value) {
        return switch (value) {
            case "v2" -> V2;
            case "v3" -> V3;
            default -> throw new IllegalArgumentException("Unsupported API version");
        };
    }
}
