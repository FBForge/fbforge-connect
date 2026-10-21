package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates destinations operations. SessionState owns lifetime and cleanup. */
final class SessionDestinations {
    private final SessionState state;

    SessionDestinations(SessionState state) {
        this.state = state;
    }

    Data<?> resource(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            int offset,
            String purpose,
            String document) {
        Entry entry = this.state.find(version, id);
        if (command.equals("load_destination")) this.state.eventLogs.clearOwner(id);
        if (Set.of("load_destination", "import_key", "discard_keys").contains(command))
            this.state.receiveFlow.invalidateReceived(entry);
        Object data =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "list_destinations" ->
                                            entry.destinations().list(session, offset);
                                    case "load_destination" ->
                                            entry.destinations().load(session, destinationId);
                                    case "import_key" ->
                                            entry.destinations()
                                                    .importKey(
                                                            session,
                                                            destinationId,
                                                            purpose,
                                                            document);
                                    case "loaded_keys" ->
                                            new DestinationAccess.KeyState(session.loadedKeys());
                                    case "discard_keys" -> {
                                        session.discardKeys();
                                        yield new DestinationAccess.KeyState(session.loadedKeys());
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), entry.id(), "TEST", data);
    }

    Data<?> keyInventory(ApiVersion version, String id, String command, String itemId, int offset) {
        var entry = this.state.find(version, id);
        var generated = this.state.localKeys.get(id);
        Object result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> {
                            if (command.equals("remove_key_inventory_item")) {
                                KeyInventory.remove(
                                        id, session, generated, DestinationAccess.id(itemId));
                                var archive = this.state.archives.get(id);
                                if (archive != null) archive.clear();
                                this.state.receiveFlow.invalidateReceived(entry);
                                this.state.eventLogs.clearOwner(id);
                                return KeyInventory.list(id, session, generated, 0);
                            }
                            return KeyInventory.list(id, session, generated, offset);
                        });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> manageDestination(
            ApiVersion version,
            String id,
            String command,
            String destination,
            String document,
            String attempt) {
        Entry entry = this.state.find(version, id);
        var manager =
                this.state.management.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationManagement(
                                        version,
                                        this.state.resourceTransport == null
                                                ? this.state.resources.apply(version)
                                                : this.state.resourceTransport
                                                        .forDestinationManagement(version)));
        if (command.equals("execute_destination_update")) {
            this.state.eventLogs.clearOwner(id);
            this.state.receiveFlow.invalidateReceived(entry);
        }
        Object data =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "load_managed_destination" ->
                                            manager.load(session, destination);
                                    case "prepare_destination_update" ->
                                            manager.prepare(session, document);
                                    case "execute_destination_update" ->
                                            manager.execute(session, attempt);
                                    case "cancel_destination_update" -> manager.cancel(attempt);
                                    case "destination_update_state" -> manager.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", data);
    }

    Data<?> provisionDestination(
            ApiVersion version,
            String id,
            String command,
            String document,
            String attemptId,
            String bundleId,
            String destinationId) {
        var entry = this.state.find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var keys = this.state.localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        var creator =
                this.state.provisioning.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationProvisioning(
                                        keys,
                                        this.state.resourceTransport == null
                                                ? this.state.resources.apply(version)
                                                : this.state.resourceTransport
                                                        .forDestinationLifecycle(version)));
        if (command.equals("execute_destination_creation"))
            this.state.receiveFlow.invalidateReceived(entry);
        Object result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_creation" ->
                                            creator.prepare(session, document);
                                    case "mark_destination_creation_dispatch" ->
                                            creator.markDispatch(attemptId);
                                    case "execute_destination_creation" ->
                                            creator.execute(session, attemptId);
                                    case "cancel_destination_creation" -> creator.cancel(attemptId);
                                    case "destination_creation_state" -> creator.state();
                                    case "reconcile_destination_creation" ->
                                            creator.reconcile(session, bundleId, destinationId);
                                    case "use_generated_keys" -> {
                                        var bundle =
                                                keys.list().stream()
                                                        .filter(
                                                                value ->
                                                                        value.bundleId()
                                                                                .equals(bundleId))
                                                        .findFirst()
                                                        .orElseThrow(
                                                                () ->
                                                                        new SessionException(
                                                                                "key_missing"));
                                        if (!bundle.status().equals("bound")
                                                || !Objects.equals(
                                                        bundle.destinationId(), destinationId))
                                            throw new SessionException("invalid_input");
                                        var registration =
                                                entry.destinations()
                                                        .loadOwned(session, destinationId);
                                        if ("C"
                                                .equals(
                                                        StrictJson.object(
                                                                        registration.detailsJson(),
                                                                        24576)
                                                                .get("type")
                                                                .getAsString()))
                                            throw new SessionException("destination_no_keys");
                                        for (String purpose : List.of("decrypt", "sign"))
                                            entry.destinations()
                                                    .importKey(
                                                            session,
                                                            destinationId,
                                                            purpose,
                                                            keys.key(bundleId, purpose)
                                                                    .privateJwk());
                                        yield new DestinationAccess.KeyState(session.loadedKeys());
                                    }
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> discoverProcess(ApiVersion version, String id, String document) {
        var entry = this.state.find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var remote =
                this.state.resourceTransport == null
                        ? this.state.resources.apply(version)
                        : this.state.resourceTransport.forProcessSearch();
        var result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session -> ProcessDiscovery.search(session, document, remote));
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> cleanupDestination(
            ApiVersion version, String id, String command, String destinationId, String attemptId) {
        var entry = this.state.find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var cleanup =
                this.state.cleanups.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationCleanup(
                                        this.state.resourceTransport == null
                                                ? this.state.resources.apply(version)
                                                : this.state.resourceTransport
                                                        .forDestinationLifecycle(version)));
        if (command.equals("execute_destination_cleanup"))
            this.state.receiveFlow.invalidateReceived(entry);
        Object result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_cleanup" ->
                                            cleanup.prepare(session, destinationId);
                                    case "execute_destination_cleanup" ->
                                            cleanup.execute(session, attemptId);
                                    case "cancel_destination_cleanup" -> cleanup.cancel(attemptId);
                                    case "destination_cleanup_state" -> cleanup.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> rotateDestinationKeys(
            ApiVersion version, String id, String command, String document, String attemptId) {
        var entry = this.state.find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var keys = this.state.localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        var rotation =
                this.state.rotations.computeIfAbsent(
                        id,
                        ignored ->
                                new DestinationRotation(
                                        keys,
                                        this.state.resourceTransport == null
                                                ? this.state.resources.apply(version)
                                                : this.state.resourceTransport
                                                        .forDestinationLifecycle(version)));
        if (command.equals("execute_destination_rotation"))
            this.state.receiveFlow.invalidateReceived(entry);
        Object result =
                this.state.registry.withSession(
                        version,
                        entry.session(),
                        session ->
                                switch (command) {
                                    case "prepare_destination_rotation" ->
                                            rotation.prepare(session, document);
                                    case "mark_destination_rotation_dispatch" ->
                                            rotation.markDispatch(attemptId);
                                    case "execute_destination_rotation" ->
                                            rotation.execute(session, attemptId);
                                    case "cancel_destination_rotation" ->
                                            rotation.cancel(attemptId);
                                    case "destination_rotation_state" -> rotation.state();
                                    default -> throw new SessionException("invalid_input");
                                });
        return new Data<>(version.wireValue(), id, "TEST", result);
    }

    Data<?> generatedKeys(ApiVersion version, String id, String command) {
        var entry = this.state.find(version, id);
        if (version != ApiVersion.V3) throw new SessionException("invalid_input");
        var generated = this.state.localKeys.computeIfAbsent(id, ignored -> new LocalTestKeys());
        Object result =
                command.equals("generate_test_keys")
                        ? this.state.registry.withSession(
                                version, entry.session(), generated::generate)
                        : Map.of("bundles", generated.list());
        return new Data<>(version.wireValue(), id, "TEST", result);
    }
}
