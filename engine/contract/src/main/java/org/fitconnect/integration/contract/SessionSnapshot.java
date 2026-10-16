package org.fitconnect.integration.contract;

public record SessionSnapshot(String sessionId, String apiVersion, String role,
                              String environment, boolean connected) {}
