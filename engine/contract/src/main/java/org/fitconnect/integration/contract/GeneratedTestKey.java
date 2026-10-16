package org.fitconnect.integration.contract;

/** SDK-generated TEST material. Private part is native-only and must be saved before public registration. */
public record GeneratedTestKey(String publicJwk, String privateJwk) {
    public GeneratedTestKey {
        if (publicJwk == null || privateJwk == null || publicJwk.length() > 24000 || privateJwk.length() > 24000)
            throw new SessionException("invalid_resource");
    }
    @Override public String toString() { return "GeneratedTestKey[private material omitted]"; }
}
