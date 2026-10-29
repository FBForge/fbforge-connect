package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonParser;
import java.util.*;
import java.util.function.UnaryOperator;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiverFailureDiagnosticTest extends ReceiverTestSupport {
    @Test
    void bothSdkPipelinesDistinguishMetadataFailuresWithoutReleasingPlaintext() throws Exception {
        var cases = new LinkedHashMap<String, UnaryOperator<String>>();
        cases.put(
                "receive_metadata_schema_unsupported",
                text -> text.replace("metadata/2.0.0/", "metadata/1.5.0/"));
        cases.put(
                "receive_metadata_schema_missing",
                text -> {
                    var document = JsonParser.parseString(text).getAsJsonObject();
                    document.remove("$schema");
                    return document.toString();
                });
        cases.put(
                "receive_filename_invalid",
                text -> text.replace("Anlage.txt", "../synthetic-private-marker.txt"));
        cases.put(
                "receive_metadata_invalid",
                text ->
                        text.replace(
                                "\"$schema\":",
                                "\"$schema\":\"synthetic-private-marker\",\"$schema\":"));
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    for (var item : cases.entrySet()) {
                        var fixture = new ReceiverFixture(api, false, false, item.getValue());
                        try (var source = new ReceiveAccess(api, DEST, SUB, fixture)) {
                            var failure =
                                    assertThrows(
                                            SessionException.class,
                                            () ->
                                                    session.receive(
                                                            DEST,
                                                            SUB,
                                                            source,
                                                            workspace,
                                                            fixture.schemas()));
                            assertEquals(item.getKey(), failure.code(), api + ": " + item.getKey());
                            assertEquals(item.getKey(), failure.getMessage());
                            assertNull(
                                    failure.getCause(),
                                    "Received fields and raw SDK messages must not cross IPC");
                            assertThrows(
                                    SessionException.class,
                                    () -> session.receiptEvidence(DEST, SUB));
                        }
                    }
                }
        }
    }
}
