package org.fitconnect.integration.contract;

import java.util.List;
import java.util.Set;

public final class SessionException extends RuntimeException {
    private static final Set<String> CODES =
            Set.of(
                    "authentication_failed",
                    "auth_unavailable",
                    "network_tls_error",
                    "network_dns_error",
                    "network_timeout",
                    "network_connection_failed",
                    "proxy_authentication_required",
                    "network_trust_unavailable",
                    "endpoint_blocked",
                    "session_missing",
                    "invalid_credentials",
                    "invalid_resource",
                    "malware_detected",
                    "malware_scan_failed",
                    "receive_response_invalid",
                    "receive_message_mismatch",
                    "receive_message_changed",
                    "receive_attachments_invalid",
                    "receive_key_mismatch",
                    "receive_payload_invalid",
                    "receive_metadata_invalid",
                    "receive_metadata_schema_missing",
                    "receive_metadata_schema_unsupported",
                    "receive_filename_invalid",
                    "resource_denied",
                    "resource_missing",
                    "resource_unavailable",
                    "key_rejected",
                    "key_missing",
                    "test_certificate_required",
                    "vpki_certificate_required",
                    "certificate_status_unknown",
                    "environment_mismatch",
                    "invalid_input",
                    "content_limit",
                    "case_limit",
                    "destination_conflict",
                    "destination_update_locked",
                    "destination_no_keys",
                    "reply_metadata_required",
                    "reply_channel_missing",
                    "verification_failed",
                    "schema_required",
                    "schema_id_mismatch",
                    "data_schema_invalid",
                    "schema_unavailable",
                    "schema_consent_required",
                    "schema_tls_error",
                    "schema_network_error",
                    "schema_http_error",
                    "schema_archive_invalid",
                    "send_locked",
                    "invalid_submission",
                    "data_format_invalid");
    private final Integer httpStatus;
    private final String problemType;
    private final List<SdkDiagnostic> diagnostics;

    public SessionException(String code) {
        this(code, null, null);
    }

    public SessionException(String code, Integer httpStatus) {
        this(code, httpStatus, null);
    }

    public SessionException(String code, Integer httpStatus, String problemType) {
        super(CODES.contains(code) ? code : "authentication_failed");
        this.httpStatus =
                httpStatus != null && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null;
        this.problemType =
                problemType != null
                                && problemType.matches(
                                        "https://schema\\.fitko\\.de/fit-connect/(?:submission-api|destination-api)/problems/[a-z][a-z0-9-]{0,127}")
                        ? problemType.substring(problemType.lastIndexOf('/') + 1)
                        : null;
        this.diagnostics = List.of();
    }

    private SessionException(SessionException original, List<SdkDiagnostic> diagnostics) {
        super(original.code());
        this.httpStatus = original.httpStatus;
        this.problemType = original.problemType;
        this.diagnostics = SdkDiagnostic.bounded(diagnostics);
    }

    public SessionException withDiagnostics(List<SdkDiagnostic> details) {
        return new SessionException(this, details);
    }

    public List<SdkDiagnostic> diagnostics() {
        return diagnostics;
    }

    public String code() {
        return getMessage();
    }

    public Integer httpStatus() {
        return httpStatus;
    }

    public String problemType() {
        return problemType;
    }
}
