package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ScannerSendBoundaryTest extends ReceiverTestSupport {
    @Test
    void enablingScannerAfterPreparationStillPreventsBothSdkWritesAndRetiresTheAttempt()
            throws Exception {
        for (var api : ApiVersion.values())
            for (String error : List.of("malware_detected", "malware_scan_failed")) {
                var calls = new AtomicInteger();
                ResourceExchange remote =
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                calls.incrementAndGet();
                                throw new AssertionError("No SDK call before a successful scan");
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                calls.incrementAndGet();
                                throw new AssertionError("No SDK write before a successful scan");
                            }
                        };
                try (var registry = registry();
                        var content = new ContentStore(workspace);
                        var server =
                                new MalwareScannerTest.ScannerServer(
                                        "clamav",
                                        bytes ->
                                                Arrays.equals(bytes, new byte[] {1, 2, 3})
                                                        ? error.equals("malware_detected")
                                                                ? "stream: Eicar FOUND\0"
                                                                : "stream: ERROR\0"
                                                        : "stream: OK\0");
                        var state =
                                new SessionState(
                                        registry,
                                        (url, body) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        ignored -> remote,
                                        content)) {
                    for (boolean reply : List.of(false, true)) {
                        String owner =
                                state.open(
                                                api,
                                                reply
                                                        ? SessionRole.ADMINISTRATIVE_SYSTEM
                                                        : SessionRole.ONLINE_SERVICE,
                                                "synthetic",
                                                "synthetic")
                                        .sessionId();
                        var entry = state.find(api, owner);
                        var files =
                                List.of(
                                        new SubmissionInput.Attachment(
                                                "Synthetisch.txt",
                                                "text/plain",
                                                null,
                                                new byte[] {1, 2, 3}));
                        byte[] data = "{}".getBytes(StandardCharsets.UTF_8);
                        var schema = URI.create("urn:test:schema");
                        String attempt;
                        if (reply) {
                            var input =
                                    new ReplyInput(
                                            UUID.fromString(DEST),
                                            UUID.fromString(SUB),
                                            UUID.fromString(CASE),
                                            schema,
                                            "application/json",
                                            data,
                                            files,
                                            null);
                            var recipient =
                                    new ReplyRecipient(
                                            input.destinationId(),
                                            input.submissionId(),
                                            input.caseId(),
                                            UUID.randomUUID(),
                                            "synthetic-public-key",
                                            List.of(
                                                    new ReplyRecipient.Schema(
                                                            schema, "application/json")));
                            attempt = entry.replySender().prepare(input, recipient).attemptId();
                            state.pendingReplies.put(
                                    owner,
                                    new ReplyDraft.Summary(
                                            UUID.randomUUID().toString(),
                                            DEST,
                                            SUB,
                                            CASE,
                                            "schema",
                                            schema.toString(),
                                            "application/json",
                                            null,
                                            2,
                                            List.of()));
                        } else {
                            var input =
                                    new SubmissionInput(
                                            api == ApiVersion.V3 ? UUID.randomUUID() : null,
                                            UUID.fromString(DEST),
                                            "urn:test:service",
                                            "Synthetisch",
                                            null,
                                            schema,
                                            "application/json",
                                            data,
                                            files,
                                            null,
                                            null);
                            attempt = entry.sender().prepare(input).attemptId();
                        }
                        // The same immutable attempt was prepared before the scanner was enabled.
                        state.scanners.put(
                                owner,
                                new MalwareScanner(
                                        new MalwareScanner.Config(
                                                "clamav", "127.0.0.1", server.port(), "")));
                        assertEquals(
                                error,
                                assertThrows(
                                                SessionException.class,
                                                () -> {
                                                    if (reply)
                                                        state.repliesFlow.replySend(
                                                                api,
                                                                owner,
                                                                "execute_reply",
                                                                attempt);
                                                    else
                                                        state.sendFlow.send(
                                                                api,
                                                                owner,
                                                                "execute_send",
                                                                attempt);
                                                })
                                        .code());
                        assertEquals(
                                "cancelled",
                                reply
                                        ? entry.replySender().state().status()
                                        : entry.sender().state().status());
                        assertEquals(0, calls.get());
                    }
                }
            }
    }
}
