package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/**
 * Create one owned TEST destination from a durable local bundle, then verify the actual
 * registration.
 */
final class DestinationProvisioning {
    record State(
            String attemptId,
            String status,
            String bundleId,
            String configurationJson,
            String destinationId,
            String error,
            Integer httpStatus) {}

    private final LocalTestKeys keys;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private State state = new State(null, "idle", null, null, null, null, null);
    private long expires;
    private boolean marked;
    private static final String ROOT =
            "https://test.fit-connect.fitko.dev/destination-api/v3/destinations";

    DestinationProvisioning(LocalTestKeys keys, ResourceExchange remote) {
        this(keys, remote, () -> System.nanoTime() / 1_000_000);
    }

    DestinationProvisioning(LocalTestKeys keys, ResourceExchange remote, LongSupplier clock) {
        this.keys = keys;
        this.remote = remote;
        this.clock = clock;
    }

    State state() {
        return state;
    }

    State prepare(AuthenticatedSession session, String document) {
        if (Set.of("running", "uncertain").contains(state.status()))
            throw error("destination_update_locked");
        if (state.status().equals("prepared") && state.bundleId() != null)
            keys.release(state.bundleId());
        marked = false;
        state = new State(null, "idle", null, null, null, null, null);
        var value = StrictJson.object(document, 24000);
        if (!value.keySet().equals(Set.of("bundleId", "configuration"))
                || !value.get("configuration").isJsonObject()) throw error("invalid_input");
        var configuration = value.getAsJsonObject("configuration");
        boolean unkeyed =
                configuration.has("type") && "C".equals(configuration.get("type").getAsString());
        String bundleId =
                unkeyed
                        ? null
                        : DestinationAccess.id(
                                DestinationConfiguration.text(value.get("bundleId"), 36));
        if (unkeyed && !value.get("bundleId").isJsonNull()) throw error("invalid_input");
        var generated =
                DestinationConfiguration.create(
                        configuration,
                        unkeyed ? null : keys.key(bundleId, "decrypt").publicJwk(),
                        unkeyed ? null : keys.key(bundleId, "sign").publicJwk());
        String canonical = session.canonicalDestinationMutation("create", generated.toString());
        // The public preview is the exact SDK serialization that will cross the write gate.
        StrictJson.object(canonical, 44000);
        if (bundleId != null) keys.reserve(bundleId, null);
        expires = clock.getAsLong() + 120000;
        state =
                new State(
                        UUID.randomUUID().toString(),
                        "prepared",
                        bundleId,
                        canonical,
                        null,
                        null,
                        null);
        return state;
    }

    State cancel(String id) {
        requirePrepared(id);
        if (state.bundleId() != null) keys.release(state.bundleId());
        return finish("cancelled", null, null);
    }

    /**
     * Private Rust checkpoint step: durable intent must precede dispatch, never a renderer
     * assertion.
     */
    State markDispatch(String id) {
        requirePrepared(id);
        if (clock.getAsLong() >= expires) {
            if (state.bundleId() != null) keys.release(state.bundleId());
            return finish("expired", null, "confirmation_expired");
        }
        if (state.bundleId() != null) keys.unresolved(state.bundleId());
        marked = true;
        return state;
    }

    State execute(AuthenticatedSession session, String id) {
        requirePrepared(id);
        if (clock.getAsLong() >= expires) {
            if (state.bundleId() != null) keys.release(state.bundleId());
            return finish("expired", null, "confirmation_expired");
        }
        if (!marked
                || state.bundleId() != null
                        && keys.list().stream()
                                .noneMatch(
                                        item ->
                                                item.bundleId().equals(state.bundleId())
                                                        && item.status().equals("unresolved")))
            throw error("destination_update_locked");
        var gate =
                new DestinationWriteAccess(
                        remote,
                        List.of(
                                new DestinationWriteAccess.Mutation(
                                        "POST", ROOT, state.configurationJson())),
                        clock);
        finish("running", null, null);
        String knownId = null;
        try {
            String response = session.createOwnDestination(state.configurationJson(), gate);
            gate.complete();
            var created = StrictJson.object(response, 65536);
            knownId =
                    DestinationAccess.id(
                            DestinationConfiguration.text(created.get("destinationId"), 36));
            verifyRegistration(session, state.bundleId(), knownId, true);
            if (state.bundleId() != null) keys.bind(state.bundleId(), knownId);
            return finish("confirmed", knownId, null);
        } catch (Exception | LinkageError cause) {
            Integer status = cause instanceof SessionException known ? known.httpStatus() : null;
            boolean declined = gate.declinedWrite();
            boolean uncertain = gate.dispatched() && !declined;
            if (state.bundleId() != null) {
                if (uncertain) keys.unresolved(state.bundleId(), knownId);
                else keys.release(state.bundleId());
            }
            return finish(
                    uncertain ? "uncertain" : "failed",
                    knownId,
                    cause instanceof SessionException known ? known.code() : "resource_unavailable",
                    status);
        }
    }

    State reconcile(AuthenticatedSession session, String bundleId, String destinationId) {
        String target = DestinationAccess.id(destinationId);
        if (bundleId == null) {
            if (state.bundleId() != null
                    || !state.status().equals("uncertain")
                    || !Objects.equals(state.destinationId(), target))
                throw error("destination_update_locked");
            verifyRegistration(session, null, target, true);
            return finish("confirmed", target, null);
        }
        String bundle = DestinationAccess.id(bundleId);
        var item =
                keys.list().stream()
                        .filter(value -> value.bundleId().equals(bundle))
                        .findFirst()
                        .orElseThrow(() -> error("key_missing"));
        if (!Set.of("unresolved", "bound").contains(item.status()))
            throw error("destination_update_locked");
        verifyRegistration(session, bundle, target, false);
        keys.bind(bundle, target);
        state = new State(null, "confirmed", bundle, null, target, null, null);
        return state;
    }

    private void verifyRegistration(
            AuthenticatedSession session,
            String bundle,
            String destination,
            boolean checkConfiguration) {
        JsonObject detail;
        if (bundle == null) {
            detail = StrictJson.object(session.ownDestination(destination), 65536);
            if (!destination.equals(DestinationConfiguration.text(detail.get("destinationId"), 36))
                    || !"C".equals(DestinationConfiguration.text(detail.get("type"), 1))
                    || detail.has("encryptionKid") && !detail.get("encryptionKid").isJsonNull())
                throw error("verification_failed");
        } else {
            var registration = DestinationRegistration.read(session, destination);
            detail = registration.details();
            registration.verifyBundle(keys, bundle);
        }
        if (checkConfiguration) {
            var planned = StrictJson.object(state.configurationJson(), 44000);
            var observed = new JsonObject();
            for (String field : DestinationConfiguration.CONFIG_FIELDS) {
                if (!detail.has(field)) throw error("verification_failed");
                observed.add(field, detail.get(field));
            }
            for (String field :
                    planned.has("encryptionKid")
                            ? List.of("status", "encryptionKid", "publicForRouting")
                            : List.of("status", "publicForRouting")) {
                if (!Objects.equals(planned.get(field), detail.get(field)))
                    throw error("verification_failed");
                observed.add(field, detail.get(field));
            }
            if (planned.has("encryptionPublicKey"))
                observed.add("encryptionPublicKey", planned.get("encryptionPublicKey"));
            if (planned.has("signingPublicKey"))
                observed.add("signingPublicKey", planned.get("signingPublicKey"));
            if (!planned.equals(
                    StrictJson.object(
                            session.canonicalDestinationMutation("create", observed.toString()),
                            44000))) throw error("verification_failed");
        }
    }

    private State finish(String status, String destination, String failure) {
        return finish(status, destination, failure, null);
    }

    private State finish(String status, String destination, String failure, Integer httpStatus) {
        state =
                new State(
                        state.attemptId(),
                        status,
                        state.bundleId(),
                        state.configurationJson(),
                        destination,
                        failure,
                        httpStatus);
        return state;
    }

    private void requirePrepared(String id) {
        if (!state.status().equals("prepared") || !Objects.equals(id, state.attemptId()))
            throw error("destination_update_locked");
    }

    private static SessionException error(String code) {
        return new SessionException(code);
    }
}
