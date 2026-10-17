package org.fitconnect.integration.host;

import com.google.gson.JsonObject;
import java.util.*;
import java.util.function.LongSupplier;
import org.fitconnect.integration.contract.*;

/** Deliberately narrow: explicitly confirmed removal of an owned, never activated TEST draft. */
final class DestinationCleanup {
    record State(
            String attemptId, String destinationId, String name, String status, String error) {}

    private State state = new State(null, null, null, "idle", null);
    private JsonObject snapshot;
    private final ResourceExchange remote;
    private final LongSupplier clock;
    private long expires;

    DestinationCleanup(ResourceExchange remote) {
        this(remote, () -> System.nanoTime() / 1_000_000);
    }

    DestinationCleanup(ResourceExchange remote, LongSupplier clock) {
        this.remote = remote;
        this.clock = clock;
    }

    State state() {
        return state;
    }

    State prepare(AuthenticatedSession session, String value) {
        if (state.status().equals("uncertain"))
            throw new SessionException("destination_update_locked");
        snapshot = null;
        state = new State(null, null, null, "idle", null);
        String id = DestinationAccess.id(value);
        var current = StrictJson.object(session.ownDestination(id), 65536);
        if (!id.equals(DestinationConfiguration.text(current.get("destinationId"), 36))
                || !Set.of("created", "draft")
                        .contains(DestinationConfiguration.text(current.get("status"), 32)))
            throw new SessionException("invalid_input");
        snapshot = current;
        expires = clock.getAsLong() + 120000;
        return state =
                new State(
                        UUID.randomUUID().toString(),
                        id,
                        DestinationConfiguration.text(current.get("name"), 256),
                        "prepared",
                        null);
    }

    State cancel(String id) {
        require(id);
        snapshot = null;
        return finish("cancelled", null);
    }

    State execute(AuthenticatedSession session, String id) {
        require(id);
        var expected = snapshot;
        snapshot = null;
        if (clock.getAsLong() >= expires) return finish("expired", "confirmation_expired");
        try {
            if (!expected.equals(
                    StrictJson.object(session.ownDestination(state.destinationId()), 65536)))
                return finish("conflict", "destination_conflict");
        } catch (SessionException failure) {
            return finish("failed", failure.code());
        }
        var gate =
                new DestinationWriteAccess(
                        remote,
                        List.of(
                                new DestinationWriteAccess.Mutation(
                                        "DELETE",
                                        "https://test.fit-connect.fitko.dev/destination-api/v3/destinations/"
                                                + state.destinationId(),
                                        null)),
                        clock);
        state = new State(state.attemptId(), state.destinationId(), state.name(), "running", null);
        try {
            session.deleteOwnDestination(state.destinationId(), gate);
            gate.complete();
            // A deleted registration cannot be revalidated on the next profile login. Keep the
            // separate generated bundle, but stop archiving imported handles for this removed
            // draft.
            session.discardDestinationKeys(state.destinationId());
            return finish("removed", null);
        } catch (Exception | LinkageError cause) {
            return finish(
                    gate.dispatched() && !gate.declinedWrite() ? "uncertain" : "failed",
                    cause instanceof SessionException known
                            ? known.code()
                            : "resource_unavailable");
        }
    }

    private State finish(String status, String error) {
        return state =
                new State(state.attemptId(), state.destinationId(), state.name(), status, error);
    }

    private void require(String id) {
        if (!state.status().equals("prepared") || !Objects.equals(id, state.attemptId()))
            throw new SessionException("destination_update_locked");
    }
}
