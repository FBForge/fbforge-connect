package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class EngineTest {
    @Test
    void framingRoundTripsUtf8AndDistinguishesCleanEof() throws Exception {
        var output = new ByteArrayOutputStream();
        FrameCodec.write(output, "{\"message\":\"Schlüssel geprüft\"}");
        var input = new ByteArrayInputStream(output.toByteArray());
        assertEquals("{\"message\":\"Schlüssel geprüft\"}", FrameCodec.read(input));
        assertNull(FrameCodec.read(input));
    }

    @Test
    void truncatedHeadersBodiesOversizedAndInvalidUtf8FailClosed() {
        for (byte[] bytes :
                new byte[][] {
                    {0, 0},
                    {0, 0, 0, 3, 65},
                    {0, 1, 0, 1},
                    {0, 0, 0, 2, (byte) 0xc3, 0x28},
                    {0, 0, 0, 0}
                }) {
            assertThrows(IOException.class, () -> FrameCodec.read(new ByteArrayInputStream(bytes)));
        }
    }

    @Test
    void unsupportedCommandsAndVersionsNeverEchoSuppliedData() {
        String marker = "synthetic-sensitive-marker";
        try (var registry = new AdapterRegistry(Path.of("missing-adapters"))) {
            var engine = new Engine(registry);
            for (String request :
                    new String[] {
                        "{\"protocolVersion\":1,\"id\":\"test-1\",\"command\":\""
                                + marker
                                + "\",\"apiVersion\":\"v2\"}",
                        "{\"protocolVersion\":1,\"id\":\"test-1\",\"command\":\"probe\",\"apiVersion\":\"prod\"}",
                        "{\"protocolVersion\":1,\"id\":\"test-1\",\"command\":\"probe\",\"apiVersion\":\"v2\",\"secret\":\""
                                + marker
                                + "\"}",
                        "{\"protocolVersion\":2,\"id\":\"test-1\",\"command\":\"probe\",\"apiVersion\":\"v3\"}"
                    }) {
                String response = engine.handle(request);
                assertTrue(response.contains("invalid_request"));
                assertFalse(response.contains(marker));
            }
        }
    }

    @Test
    void missingAdapterHasSafeErrorAndNeverFallsBackToOtherApi() {
        try (var registry = new AdapterRegistry(Path.of("missing-adapters"))) {
            String response =
                    new Engine(registry)
                            .handle(
                                    "{\"protocolVersion\":1,\"id\":\"test-2\",\"command\":\"probe\",\"apiVersion\":\"v3\"}");
            assertTrue(response.contains("adapter_unavailable"));
            assertFalse(response.contains("missing-adapters"));
        }
    }
}
