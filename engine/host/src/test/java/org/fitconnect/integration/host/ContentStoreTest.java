package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.fitconnect.integration.contract.SessionException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ContentStoreTest {
    private static final String OWNER = "00000000-0000-4000-8000-000000000001";
    private static final String OTHER = "00000000-0000-4000-8000-000000000002";
    @TempDir Path temporary;
    private static String encoded(byte[] bytes) { return Base64.getEncoder().encodeToString(bytes); }
    private static void error(String code, org.junit.jupiter.api.function.Executable operation) {
        assertEquals(code, assertThrows(SessionException.class, operation).code());
    }

    @Test void completeOrderedChunksPreserveEveryByteAndFinishedContentIsImmutable() throws Exception {
        byte[] bytes = new byte[ContentStore.CHUNK_BYTES + 7];
        new Random(17).nextBytes(bytes);
        try (var store = new ContentStore(temporary)) {
            var initial = store.begin(OWNER, bytes.length);
            assertEquals(0, initial.receivedBytes()); assertFalse(initial.complete());
            error("invalid_input", () -> store.open(OWNER, initial.contentId()));
            var first = store.append(OWNER, initial.contentId(), 0, encoded(Arrays.copyOf(bytes, ContentStore.CHUNK_BYTES)));
            assertEquals(ContentStore.CHUNK_BYTES, first.receivedBytes()); assertFalse(first.complete());
            var finished = store.append(OWNER, initial.contentId(), first.receivedBytes(),
                    encoded(Arrays.copyOfRange(bytes, ContentStore.CHUNK_BYTES, bytes.length)));
            assertEquals(bytes.length, finished.totalBytes()); assertTrue(finished.complete());
            try (var input = store.open(OWNER, initial.contentId())) { assertArrayEquals(bytes, input.readAllBytes()); }
            error("invalid_input", () -> store.append(OWNER, initial.contentId(), bytes.length, encoded(new byte[]{1})));
        }
        try (var children = Files.list(temporary)) { assertEquals(0, children.count()); }
    }

    @Test void otherSessionsCannotReadAppendOrDiscardKnownContentIds() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var initial = store.begin(OWNER, 1);
            error("resource_missing", () -> store.append(OTHER, initial.contentId(), 0, "AA=="));
            error("resource_missing", () -> store.open(OTHER, initial.contentId()));
            error("resource_missing", () -> store.discard(OTHER, initial.contentId()));
            assertTrue(store.append(OWNER, initial.contentId(), 0, "AA==").complete());
            try (var input = store.open(OWNER, initial.contentId())) { assertArrayEquals(new byte[]{0}, input.readAllBytes()); }
        }
    }

    @Test void rejectedChunksLeaveAcknowledgedPrefixUsableWithoutGapsOrReplay() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var item = store.begin(OWNER, 3);
            store.append(OWNER, item.contentId(), 0, "AQ==");
            for (long offset : new long[]{-1, 0, 2, Long.MAX_VALUE})
                error("invalid_input", () -> store.append(OWNER, item.contentId(), offset, "Ag=="));
            for (String malformed : List.of("", "AA", "AR==", " AA==", "AA==\n", "-w==", "AAAA", "?"))
                error("invalid_input", () -> store.append(OWNER, item.contentId(), 1, malformed));
            error("invalid_input", () -> store.append(OWNER, item.contentId(), 1, encoded(new byte[ContentStore.CHUNK_BYTES + 1])));
            assertTrue(store.append(OWNER, item.contentId(), 1, "AgM=").complete());
            try (var input = store.open(OWNER, item.contentId())) { assertArrayEquals(new byte[]{1, 2, 3}, input.readAllBytes()); }
        }
    }

    @Test void declaredSizesReserveGlobalCapacityAndDiscardReturnsItAcrossSessions() throws Exception {
        try (var store = new ContentStore(temporary)) {
            error("invalid_input", () -> store.begin(OWNER, -1));
            error("invalid_input", () -> store.begin(OWNER, ContentStore.FILE_BYTES + 1));
            var first = store.begin(OWNER, ContentStore.FILE_BYTES);
            var second = store.begin(OTHER, ContentStore.FILE_BYTES);
            error("content_limit", () -> store.begin(OWNER, 1));
            store.discard(OWNER, first.contentId());
            var available = store.begin(OTHER, ContentStore.FILE_BYTES);
            error("content_limit", () -> store.begin(OWNER, 1));
            store.discard(OTHER, second.contentId()); store.discard(OTHER, available.contentId());
            assertNotNull(store.begin(OWNER, 1));
        }
    }

    @Test void zeroByteFilesAreCompleteButStillCountTowardFileLimit() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var files = new ArrayList<ContentStore.Snapshot>();
            for (int i = 0; i < ContentStore.MAX_FILES; i++) files.add(store.begin(OWNER, 0));
            error("content_limit", () -> store.begin(OTHER, 0));
            var empty = files.getFirst(); assertTrue(empty.complete());
            try (var input = store.open(OWNER, empty.contentId())) { assertEquals(-1, input.read()); }
            store.discard(OWNER, empty.contentId());
            assertNotNull(store.begin(OTHER, 0));
        }
    }

    @Test void endingOneSessionDeletesItsFilesWithoutInvalidatingAnotherSession() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var a = store.begin(OWNER, 1); var b = store.begin(OTHER, 1);
            store.append(OWNER, a.contentId(), 0, "AQ=="); store.append(OTHER, b.contentId(), 0, "Ag==");
            store.releaseSession(OWNER);
            error("resource_missing", () -> store.open(OWNER, a.contentId()));
            try (var input = store.open(OTHER, b.contentId())) { assertArrayEquals(new byte[]{2}, input.readAllBytes()); }
            try (var roots = Files.list(temporary); var files = Files.list(roots.findFirst().orElseThrow())) {
                assertEquals(1, files.count());
            }
        }
    }

    @Test void damagedOrPartiallyWrittenFilesNeverBecomeReadableInputs() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var item = store.begin(OWNER, 2); store.append(OWNER, item.contentId(), 0, "AQ==");
            Path file;
            try (var roots = Files.list(temporary)) { file = roots.findFirst().orElseThrow().resolve(item.contentId() + ".bin"); }
            Files.write(file, new byte[0], StandardOpenOption.TRUNCATE_EXISTING);
            error("resource_unavailable", () -> store.append(OWNER, item.contentId(), 1, "Ag=="));
            Files.write(file, new byte[]{1}, StandardOpenOption.TRUNCATE_EXISTING);
            error("resource_unavailable", () -> store.append(OWNER, item.contentId(), 1, "Ag=="));
            error("invalid_input", () -> store.open(OWNER, item.contentId()));
            store.discard(OWNER, item.contentId());
        }
    }

    @Test void failedDeletionKeepsTheReservationUntilCleanupActuallySucceeds() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var first = store.begin(OWNER, ContentStore.FILE_BYTES);
            store.begin(OTHER, ContentStore.FILE_BYTES);
            Path file;
            try (var roots = Files.list(temporary)) { file = roots.findFirst().orElseThrow().resolve(first.contentId() + ".bin"); }
            Files.delete(file); Files.createDirectory(file);
            Path obstruction = Files.write(file.resolve("synthetic-lock-obstruction"), new byte[]{1});
            error("resource_unavailable", () -> store.discard(OWNER, first.contentId()));
            error("content_limit", () -> store.begin(OTHER, 1));
            Files.delete(obstruction);
            store.discard(OWNER, first.contentId());
            assertNotNull(store.begin(OTHER, 1));
        }
    }

    @Test void temporaryContentsUseOwnerOnlyPermissionsOnTheActualFilesystem() throws Exception {
        try (var store = new ContentStore(temporary)) {
            var item = store.begin(OWNER, 0);
            Path root;
            try (var roots = Files.list(temporary)) { root = roots.findFirst().orElseThrow(); }
            Path file = root.resolve(item.contentId() + ".bin");
            if (Files.getFileStore(root).supportsFileAttributeView(java.nio.file.attribute.PosixFileAttributeView.class)) {
                assertEquals(java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"), Files.getPosixFilePermissions(root));
                assertEquals(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"), Files.getPosixFilePermissions(file));
            } else {
                for (Path target : List.of(root, file)) {
                    var acl = Files.getFileAttributeView(target, java.nio.file.attribute.AclFileAttributeView.class);
                    assertNotNull(acl); assertEquals(1, acl.getAcl().size());
                    assertEquals(Files.getOwner(root), acl.getAcl().getFirst().principal());
                }
            }
        }
    }
}
