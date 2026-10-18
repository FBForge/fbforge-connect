package org.fitconnect.integration.contract;

/** Narrow HTTP seam for SDK OAuth providers and offline contract tests. */
@FunctionalInterface
public interface TokenExchange {
    String post(String endpoint, String formBody);
}
