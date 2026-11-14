package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** A later malware verdict must revoke every local read path for the same message. */
class ScannerCaseQuarantineTest extends ReceiverTestSupport {
    private static final Gson JSON = new Gson();

    @ParameterizedTest
    @EnumSource(ApiVersion.class)
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void laterMetadataFindingRevokesProofAndRetainedCaseBytes(ApiVersion api) throws Exception {
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
                                (url, body) ->
                                        "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                ignored -> remote,
                                content);
                var scanner = new BoundedClam(fixture.metadata, fixture.data)) {
            String owner =
                    state.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "synthetic", "synthetic")
                            .sessionId();
            state.destinationsFlow.resource(api, owner, "load_destination", DEST, 0, null, null);
            state.destinationsFlow.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
            state.scanners.put(
                    owner,
                    new MalwareScanner(
                            new MalwareScanner.Config("clamav", "127.0.0.1", scanner.port(), "")));
            byte[] schema =
                    fixture.schemas().get(ReceiverFixture.SCHEMA).getBytes(StandardCharsets.UTF_8);
            String handle = content.begin(owner, schema.length).contentId();
            content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
            String catalog =
                    JSON.toJson(
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
            assertEquals(2, state.received.parts(api, owner, summary.proofId(), 0).parts().size());
            JsonObject original = record(state, api, owner);
            String recordId = original.get("recordId").getAsString();
            assertEquals("verified", original.get("status").getAsString());
            assertTrue(
                    original.getAsJsonArray("warnings").toString().contains("MALWARE_SCAN_PASSED"));
            var originalParts =
                    (CaseRepository.Page)
                            state.receiveFlow
                                    .caseWorkspace(api, owner, request("parts", recordId, ""))
                                    .data();
            var metadata =
                    originalParts.parts().stream()
                            .filter(p -> p.kind().equals("metadata"))
                            .findFirst()
                            .orElseThrow();
            var data =
                    originalParts.parts().stream()
                            .filter(p -> p.kind().equals("data"))
                            .findFirst()
                            .orElseThrow();
            assertTrue(
                    Arrays.equals(
                            fixture.metadata,
                            read(state, api, owner, recordId, metadata.contentId())));
            assertTrue(
                    Arrays.equals(
                            fixture.data, read(state, api, owner, recordId, data.contentId())));

            var finding =
                    assertThrows(
                            SessionException.class,
                            () -> state.receiveFlow.verify(api, owner, DEST, SUB, catalog));
            assertEquals("malware_detected", finding.code());
            scanner.verifyComplete();
            assertThrows(
                    SessionException.class,
                    () ->
                            state.receiveFlow.received(
                                    api,
                                    owner,
                                    "list_received_contents",
                                    summary.proofId(),
                                    "",
                                    0));
            var entry = state.find(api, owner);
            assertThrows(
                    SessionException.class,
                    () ->
                            registry.withSession(
                                    api,
                                    entry.session(),
                                    session -> session.receiptEvidence(DEST, SUB)));

            for (String operation : List.of("parts", "read")) {
                var blocked =
                        assertThrows(
                                SessionException.class,
                                () ->
                                        state.receiveFlow.caseWorkspace(
                                                api,
                                                owner,
                                                request(operation, recordId, data.contentId())));
                assertEquals("malware_detected", blocked.code());
            }
            var blocked = record(state, api, owner);
            assertEquals("blocked", blocked.get("status").getAsString());
            assertEquals("[\"MALWARE_DETECTED\"]", blocked.get("warnings").toString());
            assertNotEquals(original.get("revision"), blocked.get("revision"));
            assertEquals(0, blocked.get("totalBytes").getAsLong());
            assertEquals(0, blocked.get("attachmentCount").getAsInt());
        }
    }

    private static String request(String operation, String record, String content) {
        return JSON.toJson(
                Map.of(
                        "operation",
                        operation,
                        "recordId",
                        record,
                        "contentId",
                        content,
                        "offset",
                        0));
    }

    private static JsonObject record(SessionState state, ApiVersion api, String owner) {
        var result =
                JSON.toJsonTree(
                                state.receiveFlow
                                        .caseWorkspace(api, owner, request("list", "", ""))
                                        .data())
                        .getAsJsonObject();
        assertEquals(1, result.get("total").getAsInt());
        return result.getAsJsonArray("records").get(0).getAsJsonObject();
    }

    private static byte[] read(
            SessionState state, ApiVersion api, String owner, String record, String part) {
        var chunk =
                (CaseRepository.Chunk)
                        state.receiveFlow
                                .caseWorkspace(api, owner, request("read", record, part))
                                .data();
        assertTrue(chunk.complete());
        assertTrue(chunk.totalBytes() <= 4096);
        return Base64.getDecoder().decode(chunk.chunk());
    }

    /** Four fixed loopback requests, maximum 4096 body bytes each; never parses a target URL. */
    private static final class BoundedClam implements AutoCloseable {
        private final ServerSocket listener;
        private final Thread worker;
        private final AtomicReference<Throwable> failure = new AtomicReference<>();
        private volatile int completed;

        BoundedClam(byte[] metadata, byte[] data) throws IOException {
            listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            listener.setSoTimeout(10000);
            byte[][] expected = {
                metadata, data, "Testanlage".getBytes(StandardCharsets.UTF_8), metadata
            };
            worker =
                    new Thread(
                            () -> {
                                try {
                                    for (int index = 0; index < expected.length; index++) {
                                        try (var socket = listener.accept()) {
                                            socket.setSoTimeout(3000);
                                            var input =
                                                    new DataInputStream(socket.getInputStream());
                                            byte[] command = input.readNBytes(10);
                                            if (!Arrays.equals(
                                                    command,
                                                    "zINSTREAM\0"
                                                            .getBytes(StandardCharsets.US_ASCII)))
                                                throw new IOException("Unexpected scanner command");
                                            var body = new ByteArrayOutputStream();
                                            for (int chunks = 0; chunks < 8; chunks++) {
                                                int count = input.readInt();
                                                if (count == 0) break;
                                                if (count < 0
                                                        || count > 4096
                                                        || body.size() + count > 4096)
                                                    throw new IOException(
                                                            "Scanner body bound exceeded");
                                                byte[] bytes = input.readNBytes(count);
                                                if (bytes.length != count)
                                                    throw new IOException("Short scanner body");
                                                body.write(bytes);
                                                if (chunks == 7)
                                                    throw new IOException(
                                                            "Scanner chunk bound exceeded");
                                            }
                                            if (!Arrays.equals(expected[index], body.toByteArray()))
                                                throw new IOException(
                                                        "Dummy scanner bytes mismatch");
                                            String verdict =
                                                    index == 3
                                                            ? "stream: Synthetic.Test.Found FOUND\0"
                                                            : "stream: OK\0";
                                            socket.getOutputStream()
                                                    .write(
                                                            verdict.getBytes(
                                                                    StandardCharsets.US_ASCII));
                                            socket.getOutputStream().flush();
                                            completed++;
                                        }
                                    }
                                } catch (Throwable problem) {
                                    failure.set(problem);
                                }
                            },
                            "bounded-test-loopback-clam");
            worker.setDaemon(true);
            worker.start();
        }

        int port() {
            return listener.getLocalPort();
        }

        void verifyComplete() throws InterruptedException {
            worker.join(4000);
            assertFalse(worker.isAlive(), "Bounded scanner did not finish");
            assertNull(failure.get(), "Bounded scanner fixture failed");
            assertEquals(4, completed);
        }

        @Override
        public void close() throws Exception {
            listener.close();
            worker.join(4000);
            assertFalse(worker.isAlive(), "Bounded scanner did not terminate");
        }
    }
}
