package org.fitconnect.integration.contract;

import java.util.Set;

public final class SessionException extends RuntimeException {
    private static final Set<String> CODES = Set.of("authentication_failed", "auth_unavailable",
            "endpoint_blocked", "session_missing", "invalid_credentials", "invalid_resource", "resource_denied",
            "resource_missing", "resource_unavailable", "key_rejected", "key_missing", "test_certificate_required", "invalid_input", "content_limit",
            "verification_failed", "schema_unavailable", "schema_consent_required", "schema_tls_error", "schema_network_error", "schema_http_error", "schema_archive_invalid", "send_locked", "invalid_submission", "data_format_invalid");
    private final Integer httpStatus;
    private final String problemType;
    public SessionException(String code) { this(code, null, null); }
    public SessionException(String code, Integer httpStatus) { this(code, httpStatus, null); }
    public SessionException(String code, Integer httpStatus, String problemType) {
        super(CODES.contains(code) ? code : "authentication_failed");
        this.httpStatus = httpStatus != null && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null;
        this.problemType = problemType != null && problemType.matches("https://schema\\.fitko\\.de/fit-connect/(?:submission-api|destination-api)/problems/[a-z][a-z0-9-]{0,127}")
                ? problemType.substring(problemType.lastIndexOf('/') + 1) : null;
    }
    public String code() { return getMessage(); }
    public Integer httpStatus() { return httpStatus; }
    public String problemType() { return problemType; }
}
