package org.fitconnect.integration.host;

import java.util.*;
import org.fitconnect.integration.contract.*;

/** Protocol-facing session facade. SDK resources are owned by SessionState. */
final class SessionManager implements AutoCloseable {
    record Data<T>(String apiVersion, String sessionId, String environment, T data) {}

    record PendingReceipt(ReceiptRequest request, String proofId) {}

    record PreparedReceipt(
            ReceiptAccess.State attempt,
            String reason,
            String description,
            String attachmentId,
            List<String> warnings) {}

    record PreparedReplyAction(
            ReplyReceiptAccess.State attempt,
            String reason,
            String description,
            String attachmentId,
            List<String> warnings) {}

    record ReplySchema(String schemaUri, String mimeType) {}

    record ReplyTarget(
            String proofId,
            String destinationId,
            String submissionId,
            String caseId,
            String replyDestinationId,
            int offset,
            int total,
            List<ReplySchema> schemas,
            List<SubmissionInput.ProcessMessage> processMessages) {}

    record PreparedReply(ReplyAccess.State attempt, ReplyDraft.Summary summary) {}

    record Prepared(SendAccess.State attempt, SubmissionDraft.Summary summary) {}

    record ReplyChannels(List<ReplyChannelReference> channels) {}

    private final SessionState state;

    SessionManager(AdapterRegistry registry, TokenExchange exchange) {
        state = new SessionState(registry, exchange);
    }

    SessionManager(
            AdapterRegistry registry,
            TokenExchange exchange,
            java.util.function.Function<ApiVersion, ResourceExchange> resources) {
        state = new SessionState(registry, exchange, resources);
    }

    SessionManager(
            AdapterRegistry registry,
            TokenExchange exchange,
            java.util.function.Function<ApiVersion, ResourceExchange> resources,
            ContentStore content) {
        state = new SessionState(registry, exchange, resources, content);
    }

    SessionSnapshot open(
            ApiVersion version, SessionRole role, String clientId, String clientSecret) {
        return state.open(version, role, clientId, clientSecret);
    }

    Map<String, Object> validateCredentials(
            ApiVersion version, String clientId, String clientSecret) {
        return state.validateCredentials(version, clientId, clientSecret);
    }

    SessionSnapshot check(ApiVersion version, String id) {
        return state.check(version, id);
    }

    SessionSnapshot close(ApiVersion version, String id) {
        return state.close(version, id);
    }

    Data<?> resource(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            int offset,
            String purpose,
            String document) {
        return state.destinationsFlow.resource(
                version, id, command, destinationId, offset, purpose, document);
    }

    Data<?> keyInventory(ApiVersion version, String id, String command, String itemId, int offset) {
        return state.destinationsFlow.keyInventory(version, id, command, itemId, offset);
    }

    Data<?> manageDestination(
            ApiVersion version,
            String id,
            String command,
            String destination,
            String document,
            String attempt) {
        return state.destinationsFlow.manageDestination(
                version, id, command, destination, document, attempt);
    }

    Data<?> content(
            ApiVersion version,
            String id,
            String command,
            String contentId,
            long totalBytes,
            long byteOffset,
            String chunk) {
        return state.contentFlow.content(
                version, id, command, contentId, totalBytes, byteOffset, chunk);
    }

    Data<?> sendSchema(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            String document,
            String schemaId,
            int offset) {
        return state.contentFlow.sendSchema(
                version, id, command, destinationId, document, schemaId, offset);
    }

    Data<?> replyChannels(ApiVersion version, String id) {
        return state.receiveFlow.replyChannels(version, id);
    }

    Data<?> replies(ApiVersion version, String id, int offset) {
        return state.receiveFlow.replies(version, id, offset);
    }

    Data<?> lookup(
            ApiVersion version,
            String id,
            String command,
            String destinationId,
            String submissionId,
            int offset) {
        return state.receiveFlow.lookup(version, id, command, destinationId, submissionId, offset);
    }

    Data<?> verify(
            ApiVersion version,
            String id,
            String destinationId,
            String submissionId,
            String document) {
        return state.receiveFlow.verify(version, id, destinationId, submissionId, document);
    }

    Data<?> verifyReply(
            ApiVersion version, String id, String caseValue, String replyValue, String document) {
        return state.receiveFlow.verifyReply(version, id, caseValue, replyValue, document);
    }

    Data<?> bindCases(ApiVersion version, String id, String profileId) {
        return state.receiveFlow.bindCases(version, id, profileId);
    }

    Data<?> caseWorkspace(ApiVersion version, String id, String document) {
        return state.receiveFlow.caseWorkspace(version, id, document);
    }

    Data<?> receivedReply(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        return state.receiveFlow.receivedReply(version, id, command, proofId, contentId, offset);
    }

    Data<?> prepareReplyReceipt(ApiVersion version, String id, ReplyReceiptDraft draft) {
        return state.receiptsFlow.prepareReplyReceipt(version, id, draft);
    }

    Data<?> replyReceipt(ApiVersion version, String id, String command, String attemptId) {
        return state.receiptsFlow.replyReceipt(version, id, command, attemptId);
    }

    Data<?> loadEventLog(
            ApiVersion version,
            String id,
            String destinationId,
            String caseId,
            String submissionId) {
        return state.eventsFlow.loadEventLog(version, id, destinationId, caseId, submissionId);
    }

    Data<?> loadCaseEventLog(ApiVersion version, String id, String caseId) {
        return state.eventsFlow.loadCaseEventLog(version, id, caseId);
    }

    Data<?> loadReplyEventLog(ApiVersion version, String id, String caseId, String replyId) {
        return state.eventsFlow.loadReplyEventLog(version, id, caseId, replyId);
    }

    Data<?> eventLogResource(
            ApiVersion version,
            String id,
            String command,
            String logId,
            String eventId,
            String part,
            int offset) {
        return state.eventsFlow.eventLogResource(
                version, id, command, logId, eventId, part, offset);
    }

    Data<?> received(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String contentId,
            int offset) {
        return state.receiveFlow.received(version, id, command, proofId, contentId, offset);
    }

    Data<?> replyTarget(ApiVersion version, String id, String proofId, int offset) {
        return state.repliesFlow.replyTarget(version, id, proofId, offset);
    }

    Data<?> replySchema(
            ApiVersion version,
            String id,
            String command,
            String proofId,
            String document,
            String schemaId,
            int offset) {
        return state.repliesFlow.replySchema(
                version, id, command, proofId, document, schemaId, offset);
    }

    Data<?> prepareReply(ApiVersion version, String id, String document) {
        return state.repliesFlow.prepareReply(version, id, document);
    }

    Data<?> replySend(ApiVersion version, String id, String command, String attemptId) {
        return state.repliesFlow.replySend(version, id, command, attemptId);
    }

    Data<?> prepareReceipt(ApiVersion version, String id, ReceiptRequest request, String proofId) {
        return state.receiptsFlow.prepareReceipt(version, id, request, proofId);
    }

    Data<?> receipt(ApiVersion version, String id, String command, String attemptId) {
        return state.receiptsFlow.receipt(version, id, command, attemptId);
    }

    Data<?> provisionDestination(
            ApiVersion version,
            String id,
            String command,
            String document,
            String attemptId,
            String bundleId,
            String destinationId) {
        return state.destinationsFlow.provisionDestination(
                version, id, command, document, attemptId, bundleId, destinationId);
    }

    Data<?> discoverProcess(ApiVersion version, String id, String document) {
        return state.destinationsFlow.discoverProcess(version, id, document);
    }

    Data<?> cleanupDestination(
            ApiVersion version, String id, String command, String destinationId, String attemptId) {
        return state.destinationsFlow.cleanupDestination(
                version, id, command, destinationId, attemptId);
    }

    Data<?> rotateDestinationKeys(
            ApiVersion version, String id, String command, String document, String attemptId) {
        return state.destinationsFlow.rotateDestinationKeys(
                version, id, command, document, attemptId);
    }

    Data<?> importCertifiedKeys(ApiVersion version, String id, String document) {
        return state.destinationsFlow.importCertifiedKeys(version, id, document);
    }

    Data<?> generatedKeys(ApiVersion version, String id, String command) {
        return state.destinationsFlow.generatedKeys(version, id, command);
    }

    Data<?> exportSessionItem(ApiVersion version, String id, int offset) {
        return state.contentFlow.exportSessionItem(version, id, offset);
    }

    Data<?> restoreSessionItem(ApiVersion version, String id, String document) {
        return state.contentFlow.restoreSessionItem(version, id, document);
    }

    Data<?> prepareSend(ApiVersion version, String id, String document) {
        return state.sendFlow.prepareSend(version, id, document);
    }

    Data<?> send(ApiVersion version, String id, String command, String attemptId) {
        return state.sendFlow.send(version, id, command, attemptId);
    }

    public void close() {
        state.close();
    }
}
