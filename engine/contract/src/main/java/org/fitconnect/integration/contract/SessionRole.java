package org.fitconnect.integration.contract;

/** Simulation role only, never a replacement for the server's OAuth permissions. */
public enum SessionRole {
    ONLINE_SERVICE("online-service"), ADMINISTRATIVE_SYSTEM("administrative-system");
    private final String value;
    SessionRole(String value) { this.value = value; }
    public String wireValue() { return value; }
    public static SessionRole parse(String value) {
        return switch (value) {
            case "online-service" -> ONLINE_SERVICE;
            case "administrative-system" -> ADMINISTRATIVE_SYSTEM;
            default -> throw new IllegalArgumentException("Unsupported role");
        };
    }
}
