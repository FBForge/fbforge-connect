package org.fitconnect.integration.host;

import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.util.*;
import org.fitconnect.integration.contract.SessionException;

/** Local, session-owned staging. Only generated handles, never renderer paths, address files. */
final class ContentStore implements AutoCloseable {
    static final int CHUNK_BYTES = 24 * 1024;
    static final long FILE_BYTES = 32L * 1024 * 1024;
    static final long TOTAL_BYTES = 64L * 1024 * 1024;
    static final int MAX_FILES = 40;
    record Snapshot(String contentId, long totalBytes, long receivedBytes, boolean complete) {}
    record Released(String contentId) {}
    private static final class Entry {
        final String owner, id;
        final long total;
        final Path file;
        long received;
        boolean failed;
        Entry(String owner, String id, long total, Path file) {
            this.owner = owner; this.id = id; this.total = total; this.file = file;
        }
        Snapshot snapshot() { return new Snapshot(id, total, received, !failed && received == total); }
    }
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final Map<String, Path> workspaces = new HashMap<>();
    private final Path parent;
    private Path root;
    private long reserved;
    private boolean closed;

    ContentStore() { this(null); }
    ContentStore(Path parent) { this.parent = parent; }

    synchronized Snapshot begin(String owner, long total) {
        requireOpen();
        if (owner == null || owner.isBlank() || total < 0 || total > FILE_BYTES) throw error("invalid_input");
        if (entries.size() >= MAX_FILES || total > TOTAL_BYTES - reserved) throw error("content_limit");
        String id = UUID.randomUUID().toString();
        try {
            Path file = Files.createFile(directory().resolve(id + ".bin"), privateAttributes(false));
            var entry = new Entry(owner, id, total, file);
            entries.put(id, entry); reserved += total;
            return entry.snapshot();
        } catch (Exception e) { throw error("resource_unavailable"); }
    }

    synchronized Snapshot append(String owner, String id, long offset, String chunk) {
        Entry entry = find(owner, id);
        if (entry.failed) throw error("resource_unavailable");
        if (entry.received == entry.total || offset != entry.received || chunk == null || chunk.isEmpty()
                || chunk.length() > 4 * (CHUNK_BYTES / 3)) throw error("invalid_input");
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(chunk); }
        catch (IllegalArgumentException e) { throw error("invalid_input"); }
        try {
            if (bytes.length == 0 || bytes.length > CHUNK_BYTES || bytes.length > entry.total - entry.received
                    || !Base64.getEncoder().encodeToString(bytes).equals(chunk)) throw error("invalid_input");
            try (var output = FileChannel.open(entry.file, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                if (output.size() != entry.received) throw new java.io.IOException();
                output.position(entry.received);
                var buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) output.write(buffer);
            } catch (Exception e) {
                entry.failed = true; // A partially written chunk can never become a complete SDK input.
                throw error("resource_unavailable");
            }
            entry.received += bytes.length;
            return entry.snapshot();
        } finally { Arrays.fill(bytes, (byte) 0); }
    }

    synchronized InputStream open(String owner, String id) {
        Entry entry = find(owner, id);
        if (!entry.snapshot().complete()) throw error("invalid_input");
        try {
            if (Files.size(entry.file) != entry.total) throw new java.io.IOException();
            return Files.newInputStream(entry.file, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS);
        } catch (Exception e) { entry.failed = true; throw error("resource_unavailable"); }
    }

    synchronized Released discard(String owner, String id) {
        Entry entry = find(owner, id);
        try {
            Files.deleteIfExists(entry.file);
            entries.remove(id); reserved -= entry.total;
            return new Released(id);
        } catch (Exception e) { throw error("resource_unavailable"); }
    }

    synchronized byte[] read(String owner, String id) {
        Entry entry = find(owner, id);
        try (var stream = open(owner, id)) {
            byte[] bytes = stream.readNBytes((int) FILE_BYTES + 1);
            if (bytes.length != entry.total) throw new java.io.IOException();
            return bytes;
        } catch (Exception e) { throw error("resource_unavailable"); }
    }
    synchronized long length(String owner, String id) {
        Entry entry = find(owner, id);
        if (!entry.snapshot().complete()) throw error("invalid_input");
        return entry.total;
    }

    synchronized Path workspace(String owner) {
        requireOpen();
        if (owner == null || owner.isBlank()) throw error("invalid_input");
        if (workspaces.containsKey(owner)) return workspaces.get(owner);
        if (workspaces.size() >= 4) throw error("content_limit");
        try {
            Path path = Files.createDirectory(directory().resolve("sdk-" + UUID.randomUUID()), privateAttributes(true));
            workspaces.put(owner, path);
            return path;
        } catch (Exception e) { throw error("resource_unavailable"); }
    }

    synchronized void clearWorkspace(String owner) {
        Path path = workspaces.get(owner);
        if (path == null) return;
        try (var tree = Files.walk(path)) {
            // SDK storage uses generated IDs below this private root. Never follow symbolic links.
            for (Path item : tree.sorted(Comparator.reverseOrder()).toList()) {
                if (!item.equals(path)) Files.delete(item);
            }
        } catch (Exception e) { throw error("resource_unavailable"); }
    }

    synchronized void releaseSession(String owner) {
        boolean failed = false;
        for (Entry entry : List.copyOf(entries.values())) {
            if (!entry.owner.equals(owner)) continue;
            try { discard(owner, entry.id); } catch (SessionException e) { failed = true; }
        }
        Path workspace = workspaces.get(owner);
        if (workspace != null) {
            try { clearWorkspace(owner); Files.delete(workspace); workspaces.remove(owner); }
            catch (Exception e) { failed = true; }
        }
        if (failed) throw error("resource_unavailable");
    }

    private Entry find(String owner, String id) {
        requireOpen();
        Entry entry = entries.get(id);
        if (entry == null || !entry.owner.equals(owner)) throw error("resource_missing");
        return entry;
    }
    private void requireOpen() { if (closed) throw error("resource_unavailable"); }

    private Path directory() throws Exception {
        if (root != null) return root;
        Path created = parent == null ? Files.createTempDirectory("fit-client-content-", privateAttributes(true))
                : Files.createTempDirectory(parent, "fit-client-content-", privateAttributes(true));
        try {
            if (!Files.getFileStore(created).supportsFileAttributeView(PosixFileAttributeView.class)) {
                var acl = Files.getFileAttributeView(created, AclFileAttributeView.class, LinkOption.NOFOLLOW_LINKS);
                if (acl == null) throw new java.io.IOException();
                acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(Files.getOwner(created))
                        .setPermissions(EnumSet.allOf(AclEntryPermission.class))
                        .setFlags(AclEntryFlag.FILE_INHERIT, AclEntryFlag.DIRECTORY_INHERIT).build()));
            }
            root = created;
            return root;
        } catch (Exception e) { Files.deleteIfExists(created); throw e; }
    }
    private static FileAttribute<?>[] privateAttributes(boolean directory) {
        if (!FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) return new FileAttribute<?>[0];
        return new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(
                PosixFilePermissions.fromString(directory ? "rwx------" : "rw-------"))};
    }

    @Override public synchronized void close() {
        if (closed) return;
        boolean failed = false;
        for (Entry entry : List.copyOf(entries.values())) {
            try { discard(entry.owner, entry.id); } catch (SessionException e) { failed = true; }
        }
        for (String owner : List.copyOf(workspaces.keySet())) {
            try { releaseSession(owner); } catch (SessionException e) { failed = true; }
        }
        if (root != null) {
            try { Files.deleteIfExists(root); } catch (Exception e) { failed = true; }
        }
        closed = true;
        if (failed) throw error("resource_unavailable");
    }
    private static SessionException error(String code) { return new SessionException(code); }
}
