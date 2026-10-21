package org.fitconnect.integration.host;

import com.google.gson.*;
import java.util.*;
import org.fitconnect.integration.contract.*;

final class Engine implements AutoCloseable {
    private final Gson json =
            new GsonBuilder().serializeNulls().setStrictness(Strictness.STRICT).create();
    private final AdapterRegistry registry;
    private final SessionManager sessions;

    Engine(AdapterRegistry registry) {
        this(registry, new SessionManager(registry, new TestTokenTransport()));
    }

    Engine(AdapterRegistry registry, SessionManager sessions) {
        this.registry = registry;
        this.sessions = sessions;
    }

    String handle(String body) {
        String id = "invalid";
        try {
            var request = EngineRequest.parse(body);
            var values = request.values();
            String command = request.command();
            ApiVersion version = request.version();
            SessionRole role = request.role();
            int offset = request.offset();
            long totalBytes = request.totalBytes(), byteOffset = request.byteOffset();
            id = values.get("id");
            try {
                Object result =
                        switch (command) {
                            case "probe" -> registry.probe(version);
                            case "open_session" ->
                                    sessions.open(
                                            version,
                                            role,
                                            values.get("clientId"),
                                            values.get("clientSecret"));
                            case "check_session" ->
                                    sessions.check(version, values.get("sessionId"));
                            case "close_session" ->
                                    sessions.close(version, values.get("sessionId"));
                            case "load_send_destination",
                                    "load_send_schema",
                                    "validate_send_data",
                                    "read_send_schema" ->
                                    sessions.sendSchema(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationId"),
                                            values.get("schemaDocument"),
                                            values.get("contentId"),
                                            Math.toIntExact(byteOffset));
                            case "load_managed_destination",
                                    "prepare_destination_update",
                                    "execute_destination_update",
                                    "cancel_destination_update",
                                    "destination_update_state" ->
                                    sessions.manageDestination(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationId"),
                                            values.get("destinationDocument"),
                                            values.get("attemptId"));
                            case "list_destinations",
                                    "load_destination",
                                    "import_key",
                                    "loaded_keys",
                                    "discard_keys" ->
                                    sessions.resource(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationId"),
                                            offset,
                                            values.get("purpose"),
                                            values.get("keyDocument"));
                            case "begin_content", "append_content", "discard_content" ->
                                    sessions.content(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("contentId"),
                                            totalBytes,
                                            byteOffset,
                                            values.get("chunk"));
                            case "prepare_send" ->
                                    sessions.prepareSend(
                                            version,
                                            values.get("sessionId"),
                                            values.get("sendDocument"));
                            case "execute_send", "cancel_send", "send_state" ->
                                    sessions.send(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("attemptId"));
                            case "load_reply_schema", "read_reply_schema" ->
                                    sessions.replySchema(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("proofId"),
                                            values.get("schemaDocument"),
                                            values.get("contentId"),
                                            Math.toIntExact(byteOffset));
                            case "reply_target" ->
                                    sessions.replyTarget(
                                            version,
                                            values.get("sessionId"),
                                            values.get("proofId"),
                                            offset);
                            case "prepare_reply" ->
                                    sessions.prepareReply(
                                            version,
                                            values.get("sessionId"),
                                            values.get("replyDocument"));
                            case "execute_reply", "cancel_reply", "reply_state" ->
                                    sessions.replySend(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("attemptId"));
                            case "prepare_reply_receipt" ->
                                    sessions.prepareReplyReceipt(
                                            version,
                                            values.get("sessionId"),
                                            ReplyReceiptDraft.resolve(
                                                    values.get("receiptDocument")));
                            case "execute_reply_receipt",
                                    "cancel_reply_receipt",
                                    "reply_receipt_state" ->
                                    sessions.replyReceipt(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("attemptId"));
                            case "prepare_receipt" -> {
                                var draft = ReceiptDraft.resolve(values.get("receiptDocument"));
                                yield sessions.prepareReceipt(
                                        version,
                                        values.get("sessionId"),
                                        draft.request(),
                                        draft.proofId());
                            }
                            case "execute_receipt", "cancel_receipt", "receipt_state" ->
                                    sessions.receipt(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("attemptId"));
                            case "list_submissions", "load_submission" ->
                                    sessions.lookup(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationId"),
                                            values.get("submissionId"),
                                            offset);
                            case "list_replies" ->
                                    sessions.replies(version, values.get("sessionId"), offset);
                            case "list_reply_channels" ->
                                    sessions.replyChannels(version, values.get("sessionId"));
                            case "verify_reply" ->
                                    sessions.verifyReply(
                                            version,
                                            values.get("sessionId"),
                                            values.get("caseId"),
                                            values.get("replyId"),
                                            values.get("schemaDocument"));
                            case "read_received_reply_schema",
                                    "list_received_reply_contents",
                                    "read_received_reply_content",
                                    "discard_received_reply" ->
                                    sessions.receivedReply(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("proofId"),
                                            values.get("contentId"),
                                            (command.equals("read_received_reply_content")
                                                            || command.equals(
                                                                    "read_received_reply_schema"))
                                                    ? Math.toIntExact(byteOffset)
                                                    : offset);
                            case "verify_submission" ->
                                    sessions.verify(
                                            version,
                                            values.get("sessionId"),
                                            values.get("destinationId"),
                                            values.get("submissionId"),
                                            values.get("schemaDocument"));
                            case "read_received_schema",
                                    "list_received_contents",
                                    "read_received_content",
                                    "discard_received" ->
                                    sessions.received(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("proofId"),
                                            values.get("contentId"),
                                            (command.equals("read_received_content")
                                                            || command.equals(
                                                                    "read_received_schema"))
                                                    ? Math.toIntExact(byteOffset)
                                                    : offset);
                            case "mark_destination_creation_dispatch",
                                    "prepare_destination_creation",
                                    "execute_destination_creation",
                                    "cancel_destination_creation",
                                    "destination_creation_state",
                                    "reconcile_destination_creation",
                                    "use_generated_keys" ->
                                    sessions.provisionDestination(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationDocument"),
                                            values.get("attemptId"),
                                            values.get("bundleId"),
                                            values.get("destinationId"));
                            case "validate_profile_credentials" ->
                                    sessions.validateCredentials(
                                            version,
                                            values.get("clientId"),
                                            values.get("clientSecret"));
                            case "search_process_destinations" ->
                                    sessions.discoverProcess(
                                            version,
                                            values.get("sessionId"),
                                            values.get("destinationDocument"));
                            case "prepare_destination_cleanup",
                                    "execute_destination_cleanup",
                                    "cancel_destination_cleanup",
                                    "destination_cleanup_state" ->
                                    sessions.cleanupDestination(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationId"),
                                            values.get("attemptId"));
                            case "prepare_destination_rotation",
                                    "mark_destination_rotation_dispatch",
                                    "execute_destination_rotation",
                                    "cancel_destination_rotation",
                                    "destination_rotation_state" ->
                                    sessions.rotateDestinationKeys(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("destinationDocument"),
                                            values.get("attemptId"));
                            case "generate_test_keys", "list_generated_keys" ->
                                    sessions.generatedKeys(
                                            version, values.get("sessionId"), command);
                            case "list_key_inventory", "remove_key_inventory_item" ->
                                    sessions.keyInventory(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("itemId"),
                                            offset);
                            case "case_bind" ->
                                    sessions.bindCases(
                                            version,
                                            values.get("sessionId"),
                                            values.get("archiveDocument"));
                            case "case_workspace" ->
                                    sessions.caseWorkspace(
                                            version,
                                            values.get("sessionId"),
                                            values.get("archiveDocument"));
                            case "export_session_item" ->
                                    sessions.exportSessionItem(
                                            version, values.get("sessionId"), offset);
                            case "restore_session_item" ->
                                    sessions.restoreSessionItem(
                                            version,
                                            values.get("sessionId"),
                                            values.get("archiveDocument"));
                            case "load_case_event_log" ->
                                    sessions.loadCaseEventLog(
                                            version, values.get("sessionId"), values.get("caseId"));
                            case "load_reply_event_log" ->
                                    sessions.loadReplyEventLog(
                                            version,
                                            values.get("sessionId"),
                                            values.get("caseId"),
                                            values.get("replyId"));
                            case "load_event_log" ->
                                    sessions.loadEventLog(
                                            version,
                                            values.get("sessionId"),
                                            values.get("destinationId"),
                                            values.get("caseId"),
                                            values.get("submissionId"));
                            case "list_case_event_log",
                                    "list_event_log",
                                    "read_event_log",
                                    "discard_event_log" ->
                                    sessions.eventLogResource(
                                            version,
                                            values.get("sessionId"),
                                            command,
                                            values.get("logId"),
                                            values.get("eventId"),
                                            values.get("part"),
                                            command.equals("read_event_log")
                                                    ? Math.toIntExact(byteOffset)
                                                    : offset);
                            default -> throw new IllegalArgumentException();
                        };
                String response =
                        json.toJson(
                                Map.of(
                                        "protocolVersion",
                                        1,
                                        "id",
                                        id,
                                        "ok",
                                        true,
                                        "result",
                                        result));
                if (response.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                        > FrameCodec.MAX_BYTES) return error(id, "invalid_resource");
                return response;
            } catch (SessionException e) {
                return error(id, e.code());
            } catch (Exception | LinkageError e) {
                return error(
                        id,
                        command.equals("probe") ? "adapter_unavailable" : "authentication_failed");
            }
        } catch (Exception e) {
            return error(id, "invalid_request");
        }
    }

    private String error(String id, String code) {
        return json.toJson(Map.of("protocolVersion", 1, "id", id, "ok", false, "error", code));
    }

    public void close() {
        sessions.close();
    }
}
