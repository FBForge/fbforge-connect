package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ScannerReceiveBoundaryTest extends ReceiverTestSupport {
    @Test
    void scannerFailureRevokesCurrentPlaintextAndReceiptEvidenceInBothSdkAdapters()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var fixture = new ReceiverFixture(api, false, false);
            ResourceExchange remote =
                    (url, headers) ->
                            url.contains("/destination-api/") && url.contains("/keys?")
                                    ? "{\"keys\":["
                                            + registration
                                            + "],\"offset\":0,\"count\":1,\"totalCount\":1}"
                                    : fixture.get(url, headers);
            try (var registry = registry();
                    var content = new ContentStore(workspace);
                    var state =
                            new SessionState(
                                    registry,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content)) {
                String owner =
                        state.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "synthetic", "synthetic")
                                .sessionId();
                state.destinationsFlow.resource(
                        api, owner, "load_destination", DEST, 0, null, null);
                state.destinationsFlow.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                byte[] schema =
                        fixture.schemas()
                                .get(ReceiverFixture.SCHEMA)
                                .getBytes(StandardCharsets.UTF_8);
                String handle = content.begin(owner, schema.length).contentId();
                content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
                String catalog =
                        new com.google.gson.Gson()
                                .toJson(
                                        Map.of(
                                                "schemas",
                                                List.of(
                                                        Map.of(
                                                                "uri",
                                                                ReceiverFixture.SCHEMA,
                                                                "contentId",
                                                                handle))));
                var summary =
                        (ReceiveStore.Summary)
                                state.receiveFlow.verify(api, owner, DEST, SUB, catalog).data();
                assertEquals(
                        2, state.received.parts(api, owner, summary.proofId(), 0).parts().size());
                int unavailablePort;
                try (var listener = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
                    unavailablePort = listener.getLocalPort();
                }
                state.scanners.put(
                        owner,
                        new MalwareScanner(
                                new MalwareScanner.Config(
                                        "clamav", "127.0.0.1", unavailablePort, "")));
                assertEquals(
                        "malware_scan_failed",
                        assertThrows(
                                        SessionException.class,
                                        () ->
                                                state.receiveFlow.verify(
                                                        api, owner, DEST, SUB, catalog))
                                .code());
                assertThrows(
                        SessionException.class,
                        () -> state.received.parts(api, owner, summary.proofId(), 0));
                var entry = state.find(api, owner);
                assertThrows(
                        SessionException.class,
                        () ->
                                registry.withSession(
                                        api, entry.session(), s -> s.receiptEvidence(DEST, SUB)));
            }
        }
    }
}
