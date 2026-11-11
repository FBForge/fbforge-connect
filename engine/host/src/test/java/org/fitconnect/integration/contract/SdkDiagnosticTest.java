package org.fitconnect.integration.contract;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class SdkDiagnosticTest {
    @Test
    void reasonsStayReadableWhileCredentialsSourceBodiesAndKeysAreRedacted() {
        var detail =
                new SdkDiagnostic(
                        "EVENT_LOG",
                        "EventLogException",
                        "Inconsistent event log. clientSecret=synthetic-secret password=synthetic-password "
                                + "Authorization: Bearer synthetic-token https://name:synthetic-url-secret@example.invalid/path?token=synthetic-query "
                                + "-----BEGIN PRIVATE KEY-----synthetic-key-----END PRIVATE KEY-----");
        assertTrue(detail.message().contains("Inconsistent event log."));
        for (String secret :
                List.of(
                        "synthetic-secret",
                        "synthetic-password",
                        "synthetic-token",
                        "synthetic-url-secret",
                        "synthetic-query",
                        "synthetic-key"))
            assertFalse(detail.message().contains(secret), detail.message());
        var source =
                new SdkDiagnostic(
                        "METADATA",
                        "MappingException",
                        "Reply channel is unsupported [Source: secret applicant data]");
        assertTrue(source.message().contains("Reply channel is unsupported"));
        assertFalse(source.message().contains("secret applicant"));
        var jwk =
                new SdkDiagnostic(
                        "METADATA",
                        "KeyValidationException",
                        "Private key rejected: {\"d\":\"private-jwk-value\",\"p\":\"private-prime-value\"}");
        assertFalse(jwk.message().contains("private-jwk-value"));
        assertFalse(jwk.message().contains("private-prime-value"));
        var truncated =
                new SdkDiagnostic(
                        "METADATA", "KeyValidationException", "{\"d\":\"" + "s".repeat(20000));
        assertFalse(truncated.message().contains("s".repeat(32)));
        assertTrue(truncated.message().contains("ausgeblendet"));
    }

    @Test
    void errorChainsAreBoundedDeduplicatedAndNeverExposedAsThrowableCauses() {
        var root = new IllegalArgumentException("Reply channel is not supported.");
        var failure =
                SdkDiagnostic.failure(
                        "verification_failed",
                        "METADATA",
                        new IllegalStateException("Metadata validation failed.", root));
        assertEquals("verification_failed", failure.code());
        assertEquals(2, failure.diagnostics().size());
        assertEquals(root.getMessage(), failure.diagnostics().get(1).message());
        assertNull(failure.getCause());
        var value = new SdkDiagnostic("METADATA", "ValidationIssue", "👩".repeat(1500));
        assertTrue(value.message().length() <= 1024);
        assertTrue(Character.isSurrogatePair(value.message().charAt(0), value.message().charAt(1)));
        assertEquals(1, SdkDiagnostic.bounded(Collections.nCopies(40, value)).size());
        var many = new ArrayList<SdkDiagnostic>();
        for (int i = 0; i < 30; i++)
            many.add(new SdkDiagnostic("DATA", "ValidationIssue", "Problem " + i));
        assertEquals(8, SdkDiagnostic.bounded(many).size());
    }
}
