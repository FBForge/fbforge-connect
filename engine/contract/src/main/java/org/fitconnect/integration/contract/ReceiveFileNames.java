package org.fitconnect.integration.contract;

/**
 * SDK3 uses the metadata filename when merging fragments. Reject paths before it can create a file.
 */
public final class ReceiveFileNames {
    private ReceiveFileNames() {}

    public static void check(String name) {
        if (name == null
                || name.isBlank()
                || name.length() > 255
                || name.endsWith(".")
                || name.endsWith(" ")
                || name.chars().anyMatch(c -> c < 32 || c == 127 || "<>:\"/\\|?*".indexOf(c) >= 0)
                || name.matches("(?i)(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\\..*)?"))
            throw new SessionException("invalid_resource");
    }
}
