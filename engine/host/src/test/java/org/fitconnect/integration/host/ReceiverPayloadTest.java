package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverPayloadTest extends ReceiverTestSupport {
    @Test
    void v3ReceivesMetadataThreeAndCanReadAgainWithoutReimportingTheKey() throws Exception {
        try (var registry = registry();
                var session = open(registry, ApiVersion.V3)) {
            registry.withSession(
                    ApiVersion.V3,
                    session,
                    s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
            var fixture =
                    new ReceiverFixture(
                            ApiVersion.V3,
                            false,
                            false,
                            s -> s.replace("metadata/2.0.0/", "metadata/3.0.0/"));
            for (int i = 0; i < 2; i++)
                try (var scope = new ReceiveAccess(ApiVersion.V3, DEST, SUB, fixture)) {
                    var result =
                            registry.withSession(
                                    ApiVersion.V3,
                                    session,
                                    s -> s.receive(DEST, SUB, scope, workspace, fixture.schemas()));
                    assertArrayEquals(fixture.metadata, result.metadata());
                    byte[] copy = result.data();
                    copy[0] = 0;
                    assertArrayEquals(fixture.data, result.data());
                }
            assertEquals(1, session.loadedKeys().size());
        }
    }

    @Test
    void compressedDataCannotExpandBeyondTheNativeFileLimit() throws Exception {
        String large = "x".repeat(32 * 1024 * 1024);
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new ReceiverFixture(api, true, false, s -> s, large);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST,
                                                                SUB,
                                                                scope,
                                                                workspace,
                                                                fixture.schemas())));
                    }
                }
        }
    }

    @Test
    void bothSdkPipelinesReassembleOnlyTheAnnouncedFragmentsAndVerifyTheirCombinedHash()
            throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    registry.withSession(
                            api,
                            session,
                            s ->
                                    s.importKey(
                                            DEST,
                                            "sign",
                                            pem,
                                            List.of(signingRegistration("synthetic-sign"))));
                    var fixture = new ReceiverFragmentFixture(api, "Anlage.txt");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        fixture.parent.schemas()));
                        assertEquals(1, result.attachments().size());
                        assertArrayEquals(
                                "Testanlage".getBytes(StandardCharsets.UTF_8),
                                result.attachments().getFirst().bytes());
                        assertEquals("Anlage.txt", result.attachments().getFirst().fileName());
                        assertEquals(2, fixture.downloads.get());
                        var evidence =
                                registry.withSession(
                                        api, session, s -> s.receiptEvidence(DEST, SUB));
                        assertEquals(
                                Map.of(
                                        UUID.fromString(ReceiverFragmentFixture.FIRST),
                                        fixture.first.split("\\.")[4],
                                        UUID.fromString(ReceiverFragmentFixture.SECOND),
                                        fixture.second.split("\\.")[4]),
                                evidence.attachments());
                        var request =
                                new ReceiptRequest(
                                        UUID.fromString(DEST),
                                        UUID.fromString(SUB),
                                        UUID.fromString(CASE),
                                        "accept",
                                        null,
                                        null,
                                        null,
                                        null);
                        var claims =
                                checkedReceipt(
                                        registry.withSession(
                                                api,
                                                session,
                                                s -> s.signReceipt(request, workspace)),
                                        "accept");
                        var tags =
                                claims.getAsJsonObject("events")
                                        .getAsJsonObject(
                                                "https://schema.fitko.de/fit-connect/events/accept-submission")
                                        .getAsJsonObject("authenticationTags")
                                        .getAsJsonObject("attachments");
                        assertEquals(
                                Set.of(
                                        ReceiverFragmentFixture.FIRST,
                                        ReceiverFragmentFixture.SECOND),
                                tags.keySet());
                        assertEquals(
                                fixture.first.split("\\.")[4],
                                tags.get(ReceiverFragmentFixture.FIRST).getAsString());
                        assertEquals(
                                fixture.second.split("\\.")[4],
                                tags.get(ReceiverFragmentFixture.SECOND).getAsString());
                    }
                }
        }
    }

    @Test
    void unsafeFragmentFilenamesAreRejectedBeforeTheSdkWritesAnyFragment() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (String filename : List.of("../../../../outside.txt", "NUL.txt")) {
                        var fixture = new ReceiverFragmentFixture(api, filename);
                        try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST,
                                                                    SUB,
                                                                    scope,
                                                                    workspace,
                                                                    fixture.parent.schemas())));
                        }
                        assertEquals(0, fixture.downloads.get());
                    }
                }
        }
    }
}
