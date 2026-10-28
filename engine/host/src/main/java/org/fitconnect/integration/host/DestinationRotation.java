package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/**
 * Explicit bulk rotation: register both public keys before switching encryption; retain all old
 * keys.
 */
final class DestinationRotation {
    record Row(
            String destinationId,
            String name,
            String bundleId,
            String beforeEncryptionKid,
            String encryptionKid,
            String signingKid,
            String status,
            String stage,
            String error,
            Integer httpStatus) {}

    record State(String attemptId, String status, List<Row> changes) {}

    private record Pending(
            Row row,
            String snapshot,
            boolean fresh,
            List<DestinationWriteAccess.Mutation> writes) {}

    private final LocalTestKeys keys;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private State state = new State(null, "idle", List.of());
    private List<Pending> pending = List.of();
    private long expires;
    private boolean marked;
    private static final String ROOT =
            IntegrationEnvironment.current().destinationApi() + "/v3/destinations/";

    DestinationRotation(LocalTestKeys keys, ResourceExchange remote) {
        this(keys, remote, () -> System.nanoTime() / 1_000_000);
    }

    DestinationRotation(LocalTestKeys keys, ResourceExchange remote, LongSupplier clock) {
        this.keys = keys;
        this.remote = remote;
        this.clock = clock;
    }

    State state() {
        return state;
    }

    State prepare(AuthenticatedSession session, String document) {
        if (state.status().equals("prepared")) release(pending);
        pending = List.of();
        marked = false;
        state = new State(null, "idle", List.of());
        var request = StrictJson.object(document, 24000);
        if (!request.keySet().equals(Set.of("destinations"))
                || !request.get("destinations").isJsonArray()) throw error("invalid_input");
        var targets = request.getAsJsonArray("destinations");
        if (targets.isEmpty() || targets.size() > 10) throw error("invalid_input");
        var work = new ArrayList<Pending>();
        var ids = new HashSet<String>();
        var bundles = new HashSet<String>();
        for (var target : targets) {
            if (!target.isJsonObject()
                    || !target.getAsJsonObject()
                            .keySet()
                            .equals(Set.of("destinationId", "bundleId")))
                throw error("invalid_input");
            var input = target.getAsJsonObject();
            String id =
                    DestinationAccess.id(
                            DestinationConfiguration.text(input.get("destinationId"), 36));
            String bundleId =
                    DestinationAccess.id(DestinationConfiguration.text(input.get("bundleId"), 36));
            if (!ids.add(id) || !bundles.add(bundleId)) throw error("invalid_input");
            var bundle =
                    keys.list().stream()
                            .filter(item -> item.bundleId().equals(bundleId))
                            .findFirst()
                            .orElseThrow(() -> error("key_missing"));
            boolean fresh = bundle.status().equals("ready");
            if (fresh
                    && keys.list().stream()
                            .anyMatch(
                                    item ->
                                            item.status().equals("unresolved")
                                                    && id.equals(item.destinationId())))
                throw error("destination_update_locked");
            if (!fresh
                    && !(bundle.status().equals("unresolved") && id.equals(bundle.destinationId())))
                throw error("destination_update_locked");
            keys.validateBundle(session, bundleId);
            var current = DestinationRegistration.read(session, id);
            var detail = current.details();
            if (detail.has("type") && "C".equals(detail.get("type").getAsString()))
                throw error("destination_no_keys");
            String status = DestinationConfiguration.text(detail.get("status"), 32);
            if (!Set.of("draft", "created", "active", "inactive").contains(status))
                throw error("invalid_input");
            var writes = new ArrayList<DestinationWriteAccess.Mutation>();
            for (String purpose : List.of("decrypt", "sign"))
                if (!current.contains(keys.key(bundleId, purpose), purpose)) {
                    String key =
                            session.canonicalDestinationMutation(
                                    "key", keys.key(bundleId, purpose).publicJwk());
                    writes.add(
                            new DestinationWriteAccess.Mutation("POST", ROOT + id + "/keys", key));
                }
            String before = DestinationConfiguration.text(detail.get("encryptionKid"), 512);
            if (!before.equals(bundle.encryption().kid())) {
                var patch = new JsonObject();
                patch.addProperty("encryptionKid", bundle.encryption().kid());
                writes.add(
                        new DestinationWriteAccess.Mutation(
                                "PATCH",
                                ROOT + id,
                                session.canonicalDestinationMutation("patch", patch.toString())));
            }
            var row =
                    new Row(
                            id,
                            DestinationConfiguration.text(detail.get("name"), 256),
                            bundleId,
                            before,
                            bundle.encryption().kid(),
                            bundle.signing().kid(),
                            writes.isEmpty() ? "unchanged" : "prepared",
                            "not_started",
                            null,
                            null);
            work.add(new Pending(row, detail.toString(), fresh, List.copyOf(writes)));
        }
        // Reserve only after all reads and validations succeeded. Existing unresolved bundles
        // remain unresolved.
        var reserved = new ArrayList<Pending>();
        try {
            for (var item : work) {
                if (item.fresh()) keys.reserve(item.row().bundleId(), item.row().destinationId());
                reserved.add(item);
            }
        } catch (RuntimeException failure) {
            release(reserved);
            throw failure;
        }
        pending = List.copyOf(work);
        marked = false;
        expires = clock.getAsLong() + 120000;
        state =
                new State(
                        UUID.randomUUID().toString(),
                        "prepared",
                        work.stream().map(Pending::row).toList());
        return state;
    }

    State markDispatch(String id) {
        requirePrepared(id);
        if (clock.getAsLong() >= expires) {
            release(pending);
            pending = List.of();
            return state = new State(id, "expired", state.changes());
        }
        for (var item : pending) keys.unresolved(item.row().bundleId(), item.row().destinationId());
        marked = true;
        return state;
    }

    State cancel(String id) {
        requirePrepared(id);
        release(pending);
        pending = List.of();
        return state = new State(id, "cancelled", List.of());
    }

    private void release(List<Pending> work) {
        for (var item : work) if (item.fresh()) keys.release(item.row().bundleId());
    }

    State execute(AuthenticatedSession session, String id) {
        requirePrepared(id);
        if (clock.getAsLong() >= expires) {
            release(pending);
            pending = List.of();
            return state = new State(id, "expired", state.changes());
        }
        if (!marked) throw error("destination_update_locked");
        var work = pending;
        pending = List.of();
        var rows = new ArrayList<>(state.changes());
        // Check every selected destination before dispatching the first public-key registration.
        long deadline = clock.getAsLong() + 180000;
        try {
            for (var item : work) {
                keys.validateBundle(session, item.row().bundleId());
                if (clock.getAsLong() >= deadline) throw error("resource_unavailable");
                if (!DestinationRegistration.read(session, item.row().destinationId())
                        .details()
                        .equals(StrictJson.object(item.snapshot(), 24576))) {
                    release(work);
                    return state =
                            new State(
                                    id,
                                    "conflict",
                                    rows.stream()
                                            .map(
                                                    row ->
                                                            changed(
                                                                    row,
                                                                    "failed",
                                                                    "not_started",
                                                                    "destination_conflict",
                                                                    null))
                                            .toList());
                }
            }
        } catch (SessionException failure) {
            release(work);
            return state =
                    new State(
                            id,
                            "failed",
                            rows.stream()
                                    .map(
                                            row ->
                                                    changed(
                                                            row,
                                                            "failed",
                                                            "not_started",
                                                            failure.code(),
                                                            failure.httpStatus()))
                                    .toList());
        }
        state = new State(id, "running", List.copyOf(rows));
        boolean failed = false, uncertain = false;
        for (int index = 0; index < work.size(); index++) {
            var item = work.get(index);
            var row = item.row();
            if (uncertain || clock.getAsLong() >= deadline) {
                if (item.fresh()) keys.release(row.bundleId());
                rows.set(
                        index,
                        changed(row, "skipped", "not_started", "resource_unavailable", null));
                failed = true;
                continue;
            }
            DestinationWriteAccess gate =
                    item.writes().isEmpty()
                            ? null
                            : new DestinationWriteAccess(remote, item.writes(), clock, deadline);
            try {
                for (var mutation : item.writes()) {
                    if (mutation.method().equals("POST"))
                        session.registerOwnDestinationKey(
                                row.destinationId(), mutation.document(), gate);
                    else
                        session.patchOwnDestination(row.destinationId(), mutation.document(), gate);
                }
                if (gate != null) gate.complete();
                DestinationRegistration.read(session, row.destinationId())
                        .verifyBundle(keys, row.bundleId());
                keys.bind(row.bundleId(), row.destinationId());
                rows.set(index, changed(row, "updated", "verified", null, null));
            } catch (Exception | LinkageError cause) {
                boolean dispatched = gate != null && gate.dispatched();
                boolean definite = gate != null && gate.declinedWrite();
                uncertain = dispatched && !definite;
                failed = true;
                boolean noRegistration = !dispatched || definite && gate.acknowledged() == 0;
                if (item.fresh() && noRegistration) keys.release(row.bundleId());
                else keys.unresolved(row.bundleId(), row.destinationId());
                String stage =
                        gate == null || gate.acknowledged() == 0
                                ? "not_confirmed"
                                : "partially_registered";
                rows.set(
                        index,
                        changed(
                                row,
                                uncertain ? "uncertain" : "failed",
                                stage,
                                cause instanceof SessionException known
                                        ? known.code()
                                        : "resource_unavailable",
                                cause instanceof SessionException known
                                        ? known.httpStatus()
                                        : null));
            }
        }
        return state =
                new State(
                        id,
                        uncertain ? "uncertain" : failed ? "partial" : "completed",
                        List.copyOf(rows));
    }

    private Row changed(Row row, String status, String stage, String error, Integer httpStatus) {
        return new Row(
                row.destinationId(),
                row.name(),
                row.bundleId(),
                row.beforeEncryptionKid(),
                row.encryptionKid(),
                row.signingKid(),
                status,
                stage,
                error,
                httpStatus);
    }

    private void requirePrepared(String id) {
        if (!state.status().equals("prepared") || !Objects.equals(state.attemptId(), id))
            throw error("destination_update_locked");
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
