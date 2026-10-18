package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import java.net.URI;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KeyInventoryTest {
    @TempDir Path workspace;
    private static final String OWNER = "00000000-0000-4000-8000-000000000001";
    private static final String DEST = "00000000-0000-4000-8000-000000000002";
    private static final String OTHER = "00000000-0000-4000-8000-000000000003";
    private static final ResourceExchange OFFLINE =
            (u, h) -> {
                throw new AssertionError("Inventory must never call TEST");
            };

    private static AuthenticatedSession open(AdapterRegistry registry, ApiVersion api)
            throws Exception {
        return registry.openSession(
                api,
                "synthetic-id",
                "synthetic-secret",
                (u, b) -> "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                OFFLINE);
    }

    @Test
    void
            generatedPairRemovalAlsoRemovesLoadedCopiesButPreservesOtherDestinationsAndBlocksUncertainKeys()
                    throws Exception {
        try (var registry = DestinationManagementTest.registry();
                var session = open(registry, ApiVersion.V3)) {
            registry.withSession(
                    ApiVersion.V3,
                    session,
                    value -> {
                        var bank = new LocalTestKeys();
                        var pair = bank.generate(value);
                        bank.bind(pair.bundleId(), DEST);
                        for (String purpose : List.of("decrypt", "sign")) {
                            var key = bank.key(pair.bundleId(), purpose);
                            value.importKey(
                                    DEST, purpose, key.privateJwk(), List.of(key.publicJwk()));
                        }
                        var material = bank.key(pair.bundleId(), "decrypt");
                        value.importKey(
                                OTHER,
                                "decrypt",
                                material.privateJwk(),
                                List.of(material.publicJwk()));
                        var page = KeyInventory.list(OWNER, value, bank, 0);
                        assertEquals(4, page.total());
                        assertEquals(
                                2,
                                page.items().stream()
                                        .filter(item -> "managed_pair".equals(item.blockedReason()))
                                        .count());
                        var pairRow =
                                page.items().stream()
                                        .filter(item -> item.kind().equals("generated"))
                                        .findFirst()
                                        .orElseThrow();
                        String publicJson = new Gson().toJson(page);
                        for (var privateItem : bank.archive()) {
                            var privateJson =
                                    com.google.gson.JsonParser.parseString(privateItem.privateJwk())
                                            .getAsJsonObject();
                            assertFalse(publicJson.contains(privateJson.get("d").getAsString()));
                        }
                        assertFalse(publicJson.contains("privateJwk"));
                        assertFalse(publicJson.contains("synthetic-secret"));
                        assertNotNull(pairRow.expiresAt());
                        assertTrue(pairRow.removable());
                        assertThrows(
                                SessionException.class,
                                () -> KeyInventory.remove(OTHER, value, bank, pairRow.itemId()));
                        var managed =
                                page.items().stream()
                                        .filter(item -> "managed_pair".equals(item.blockedReason()))
                                        .findFirst()
                                        .orElseThrow();
                        assertThrows(
                                SessionException.class,
                                () -> KeyInventory.remove(OWNER, value, bank, managed.itemId()));
                        bank.unresolved(pair.bundleId());
                        assertFalse(
                                KeyInventory.list(OWNER, value, bank, 0).items().stream()
                                        .filter(item -> item.kind().equals("generated"))
                                        .findFirst()
                                        .orElseThrow()
                                        .removable());
                        assertThrows(
                                SessionException.class,
                                () -> KeyInventory.remove(OWNER, value, bank, pairRow.itemId()));
                        bank.bind(pair.bundleId(), DEST);
                        KeyInventory.remove(OWNER, value, bank, pairRow.itemId());
                        assertTrue(bank.archive().isEmpty());
                        assertEquals(1, value.archiveKeys().size());
                        assertEquals(OTHER, value.loadedKeys().getFirst().destinationId());
                        assertThrows(
                                SessionException.class,
                                () -> KeyInventory.remove(OWNER, value, bank, pairRow.itemId()));
                        return null;
                    });
        }
    }

    @Test
    void importedAndReplyRemovalUseTheActualSdkStoresAndRetainUnrelatedAndUnresolvedKeys()
            throws Exception {
        try (var registry = DestinationManagementTest.registry();
                var generator = open(registry, ApiVersion.V3)) {
            var material =
                    registry.withSession(
                            ApiVersion.V3, generator, value -> value.generateTestKey("decrypt"));
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            value -> {
                                value.importKey(
                                        DEST,
                                        "decrypt",
                                        material.privateJwk(),
                                        List.of(material.publicJwk()));
                                value.importKey(
                                        OTHER,
                                        "decrypt",
                                        material.privateJwk(),
                                        List.of(material.publicJwk()));
                                var first =
                                        KeyInventory.list(OWNER, value, null, 0).items().getFirst();
                                KeyInventory.remove(OWNER, value, null, first.itemId());
                                assertEquals(OTHER, value.loadedKeys().getFirst().destinationId());
                                var input =
                                        new SubmissionInput(
                                                api == ApiVersion.V3
                                                        ? UUID.fromString(OTHER)
                                                        : null,
                                                UUID.fromString(DEST),
                                                "urn:test:service",
                                                "Test",
                                                "DE",
                                                URI.create("urn:test:application"),
                                                "application/json",
                                                "{}".getBytes(),
                                                List.of(),
                                                null,
                                                null,
                                                new SubmissionInput.ReplyOffer(
                                                        URI.create("urn:test:reply"),
                                                        "application/json"));
                                var attempt = UUID.randomUUID();
                                value.prepareReplyChannel(attempt, input, workspace);
                                var pending =
                                        KeyInventory.list(OWNER, value, null, 0).items().stream()
                                                .filter(item -> item.kind().equals("reply"))
                                                .findFirst()
                                                .orElseThrow();
                                assertFalse(pending.removable());
                                assertThrows(
                                        SessionException.class,
                                        () -> value.discardReplyChannel(attempt));
                                value.completeReplyChannel(
                                        attempt, UUID.randomUUID(), UUID.randomUUID(), true);
                                var bound =
                                        KeyInventory.list(OWNER, value, null, 0).items().stream()
                                                .filter(item -> item.kind().equals("reply"))
                                                .findFirst()
                                                .orElseThrow();
                                assertTrue(bound.removable());
                                assertNotNull(bound.caseId());
                                assertNull(bound.expiresAt());
                                var unresolved = UUID.randomUUID();
                                value.prepareReplyChannel(unresolved, input, workspace);
                                value.completeReplyChannel(unresolved, null, null, true);
                                assertThrows(
                                        SessionException.class,
                                        () -> value.discardReplyChannel(unresolved));
                                KeyInventory.remove(OWNER, value, null, bound.itemId());
                                assertEquals(1, value.replyChannels().size());
                                assertEquals(
                                        "unresolved", value.replyChannels().getFirst().status());
                                assertEquals(OTHER, value.loadedKeys().getFirst().destinationId());
                                return null;
                            });
                }
        }
    }
}
