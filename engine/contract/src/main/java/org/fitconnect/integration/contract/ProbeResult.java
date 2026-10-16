package org.fitconnect.integration.contract;

/** Only public diagnostics cross the isolated SDK boundary. */
public record ProbeResult(String apiVersion, String sdkVersion, String environment,
                          String entrypoint, boolean isolated) {}
