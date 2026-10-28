package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.fitconnect.integration.host.SessionManager.*;
import org.fitconnect.integration.host.SessionState.*;

/** Coordinates events operations. SessionState owns lifetime and cleanup. */
final class SessionEvents {
    private final SessionState state;

    SessionEvents(SessionState state) {
        this.state = state;
    }

    Data<?> loadEventLog(
            ApiVersion version,
            String id,
            String destinationId,
            String caseId,
            String submissionId) {
        Entry entry = this.state.find(version, id);
        // A failed replacement must never leave an earlier result looking current.
        this.state.eventLogs.clear();
        String destination = DestinationAccess.id(destinationId),
                caseValue = DestinationAccess.id(caseId),
                submission = DestinationAccess.id(submissionId);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        VerifiedEventLog result;
        try {
            result =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        this.state.resourceTransport == null
                                                ? new EventLogAccess(
                                                        version,
                                                        caseValue,
                                                        submission,
                                                        this.state.resources.apply(version))
                                                : this.state.resourceTransport.forEvents(
                                                        version, caseValue, submission)) {
                                    return session.eventLog(
                                            UUID.fromString(destination),
                                            UUID.fromString(caseValue),
                                            UUID.fromString(submission),
                                            source,
                                            this.state.content.workspace(id));
                                }
                            });
        } finally {
            // SDK storage must be clean before a verified result can cross the native boundary.
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                this.state.receiveFlow.invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                this.state.eventLogs.publish(
                        version,
                        id,
                        UUID.fromString(destination),
                        UUID.fromString(caseValue),
                        UUID.fromString(submission),
                        result));
    }

    Data<?> loadCaseEventLog(ApiVersion version, String id, String caseId) {
        Entry entry = this.state.find(version, id);
        this.state.eventLogs.clear();
        String caseValue = DestinationAccess.id(caseId);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        VerifiedCaseEventLog result;
        try {
            result =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        this.state.resourceTransport == null
                                                ? EventLogAccess.forCase(
                                                        version,
                                                        caseValue,
                                                        this.state.resources.apply(version))
                                                : this.state.resourceTransport.forCaseEvents(
                                                        version, caseValue)) {
                                    return session.caseEventLog(
                                            UUID.fromString(caseValue),
                                            source,
                                            this.state.content.workspace(id));
                                }
                            });
        } finally {
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                this.state.receiveFlow.invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                this.state.eventLogs.publishCase(version, id, UUID.fromString(caseValue), result));
    }

    Data<?> loadReplyEventLog(ApiVersion version, String id, String caseId, String replyId) {
        Entry entry = this.state.find(version, id);
        this.state.eventLogs.clear();
        String caseValue = DestinationAccess.id(caseId), reply = DestinationAccess.id(replyId);
        if (this.state.receiveCleanupFailed.contains(id))
            throw new SessionException("resource_unavailable");
        VerifiedEventLog result;
        try {
            result =
                    this.state.registry.withSession(
                            version,
                            entry.session(),
                            session -> {
                                try (var source =
                                        this.state.resourceTransport == null
                                                ? new EventLogAccess(
                                                        version,
                                                        caseValue,
                                                        reply,
                                                        this.state.resources.apply(version),
                                                        true)
                                                : this.state.resourceTransport.forReplyEvents(
                                                        version, caseValue, reply)) {
                                    return session.replyEventLog(
                                            UUID.fromString(caseValue),
                                            UUID.fromString(reply),
                                            source,
                                            this.state.content.workspace(id));
                                }
                            });
        } finally {
            try {
                this.state.content.clearWorkspace(id);
            } catch (RuntimeException failure) {
                this.state.receiveCleanupFailed.add(id);
                entry.sender().cleanupFailed();
                this.state.receiveFlow.invalidateReceived(entry);
                throw failure;
            }
        }
        return new Data<>(
                version.wireValue(),
                id,
                IntegrationEnvironment.current().name(),
                this.state.eventLogs.publishReply(
                        version, id, UUID.fromString(caseValue), UUID.fromString(reply), result));
    }

    Data<?> eventLogResource(
            ApiVersion version,
            String id,
            String command,
            String logId,
            String eventId,
            String part,
            int offset) {
        this.state.find(version, id);
        Object data =
                switch (command) {
                    case "list_case_event_log" ->
                            this.state.eventLogs.casePage(version, id, logId, offset);
                    case "list_event_log" -> this.state.eventLogs.page(version, id, logId, offset);
                    case "read_event_log" ->
                            this.state.eventLogs.read(version, id, logId, eventId, part, offset);
                    case "discard_event_log" -> {
                        this.state.eventLogs.discard(version, id, logId);
                        yield Map.of("logId", logId);
                    }
                    default -> throw new SessionException("invalid_input");
                };
        return new Data<>(version.wireValue(), id, IntegrationEnvironment.current().name(), data);
    }
}
