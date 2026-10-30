package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

/**
 * Explicit acceptance only (-Dtest=RealScannerAcceptance), against our owned live test endpoints.
 */
class RealScannerAcceptance {
    @Test
    void actualEngineDetectsEicarThroughBothHostProtocolsAndWithholdsOnlyTheAffectedAttachment() {
        byte[] eicar =
                String.join(
                                "",
                                "X5O",
                                "!P%@AP",
                                "[4",
                                "\\",
                                "PZX54(P^)7CC)7}",
                                "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!",
                                "$H+H*")
                        .getBytes(StandardCharsets.US_ASCII);
        UUID cleanId = UUID.randomUUID(), blockedId = UUID.randomUUID();
        var data =
                new ReceivedContent(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "{}".getBytes(StandardCharsets.UTF_8),
                        "{\"synthetic\":true}".getBytes(StandardCharsets.UTF_8),
                        "application/json",
                        List.of(
                                new ReceivedContent.Attachment(
                                        cleanId,
                                        "Sauber.txt",
                                        "text/plain",
                                        null,
                                        "Fiktiver sauberer Text".getBytes(StandardCharsets.UTF_8)),
                                new ReceivedContent.Attachment(
                                        blockedId,
                                        "EICAR-Test.txt",
                                        "text/plain",
                                        "Standardisierte Testdatei",
                                        eicar)),
                        List.of(new ReceivedContent.Issue("MALWARE_SCAN_NOT_CONFIGURED", false)));
        for (String kind : List.of("clamav", "icap")) {
            String key =
                    kind.equals("clamav") ? "FBFC_SCANNER_CLAMD_PORT" : "FBFC_SCANNER_ICAP_PORT";
            int port =
                    Integer.parseInt(
                            Objects.requireNonNull(
                                    System.getenv(key),
                                    "Owned scanner acceptance endpoint required"));
            var scanner =
                    new MalwareScanner(
                            new MalwareScanner.Config(kind, "127.0.0.1", port, "/avscan"));
            var result = scanner.scan(data);
            assertEquals(
                    List.of(cleanId),
                    result.attachments().stream().map(ReceivedContent.Attachment::id).toList());
            assertEquals(
                    List.of(new BlockedAttachment(blockedId, "EICAR-Test.txt")),
                    ScanFindings.blocked(result.issues()));
            var outgoing =
                    new SubmissionInput(
                            null,
                            UUID.randomUUID(),
                            "urn:test:service",
                            "Synthetisch",
                            null,
                            java.net.URI.create("urn:test:schema"),
                            "application/json",
                            "{}".getBytes(StandardCharsets.UTF_8),
                            List.of(
                                    new SubmissionInput.Attachment(
                                            "EICAR-Test.txt", "text/plain", null, eicar)),
                            null,
                            null);
            assertEquals(
                    "malware_detected",
                    assertThrows(SessionException.class, () -> scanner.scan(outgoing)).code());
        }
    }
}
