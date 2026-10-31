package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ScannerPreparationStatusTest extends SenderTestSupport {
    @Test
    void preparationReportsOnlyAnActualSuccessfulScanInBothAdapters() throws Exception {
        for (var api : ApiVersion.values()) {
            try (var adapters = registry();
                    var store = new ContentStore(workspace);
                    var server = new MalwareScannerTest.ScannerServer("clamav", "stream: OK\0");
                    var sessions =
                            new SessionManager(
                                    adapters,
                                    (url, body) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored ->
                                            (url, headers) -> {
                                                throw new AssertionError(
                                                        "No remote call during preparation");
                                            },
                                    store)) {
                var active = sessions.open(api, SessionRole.ONLINE_SERVICE, "id", "secret");
                var handle = staged(store, active.sessionId(), DATA);
                var prepared =
                        (SessionManager.Prepared)
                                sessions.prepareSend(
                                                api, active.sessionId(), draftDocument(api, handle))
                                        .data();
                assertEquals("not_configured", prepared.scanStatus());
                sessions.configureScanner(
                        api,
                        active.sessionId(),
                        "{\"kind\":\"clamav\",\"host\":\"127.0.0.1\",\"port\":"
                                + server.port()
                                + ",\"service\":\"\"}");
                prepared =
                        (SessionManager.Prepared)
                                sessions.prepareSend(
                                                api, active.sessionId(), draftDocument(api, handle))
                                        .data();
                assertEquals("passed", prepared.scanStatus());
                assertArrayEquals(DATA, server.payloads.getFirst());
                sessions.configureScanner(
                        api,
                        active.sessionId(),
                        "{\"kind\":\"off\",\"host\":\"\",\"port\":0,\"service\":\"\"}");
                prepared =
                        (SessionManager.Prepared)
                                sessions.prepareSend(
                                                api, active.sessionId(), draftDocument(api, handle))
                                        .data();
                assertEquals("not_configured", prepared.scanStatus());
                assertEquals(1, server.payloads.size());
            }
        }
    }
}
