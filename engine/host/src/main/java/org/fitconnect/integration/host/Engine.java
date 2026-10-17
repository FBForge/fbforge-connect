package org.fitconnect.integration.host;

import com.google.gson.*;
import com.google.gson.stream.*;
import java.io.StringReader;
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
            // Streaming validation rejects duplicate fields before constructing a JSON object.
            var values = new HashMap<String, String>();
            var reader = new JsonReader(new StringReader(body));
            reader.setStrictness(Strictness.STRICT);
            reader.beginObject();
            while (reader.hasNext()) {
                String key = reader.nextName();
                if (!Set.of(
                                        "protocolVersion",
                                        "id",
                                        "command",
                                        "apiVersion",
                                        "role",
                                        "clientId",
                                        "clientSecret",
                                        "sessionId",
                                        "destinationId",
                                        "offset",
                                        "purpose",
                                        "keyDocument",
                                        "contentId",
                                        "totalBytes",
                                        "byteOffset",
                                        "chunk",
                                        "sendDocument",
                                        "attemptId",
                                        "submissionId",
                                        "schemaDocument",
                                        "proofId",
                                        "receiptDocument",
                                        "caseId",
                                        "replyId",
                                        "logId",
                                        "eventId",
                                        "part",
                                        "replyDocument",
                                        "destinationDocument",
                                        "archiveDocument",
                                        "bundleId")
                                .contains(key)
                        || values.containsKey(key)) throw new IllegalArgumentException();
                if (Set.of("protocolVersion", "offset", "totalBytes", "byteOffset").contains(key)) {
                    if (reader.peek() != JsonToken.NUMBER) throw new IllegalArgumentException();
                } else if (key.equals("bundleId") && reader.peek() == JsonToken.NULL) {
                    reader.nextNull();
                    values.put(key, null);
                    continue;
                } else if (reader.peek() != JsonToken.STRING) throw new IllegalArgumentException();
                values.put(key, reader.nextString());
            }
            reader.endObject();
            if (reader.peek() != JsonToken.END_DOCUMENT
                    || !"1".equals(values.get("protocolVersion"))
                    || values.get("id") == null
                    || !values.get("id").matches("[A-Za-z0-9-]{1,64}"))
                throw new IllegalArgumentException();
            Set<String> base = Set.of("protocolVersion", "id", "command", "apiVersion");
            var expected = new HashSet<>(base);
            String command = values.get("command");
            if (command == null) throw new IllegalArgumentException();
            switch (command) {
                case "probe" -> {}
                case "open_session" -> expected.addAll(Set.of("role", "clientId", "clientSecret"));
                case "check_session", "close_session" -> expected.add("sessionId");
                case "loaded_keys", "discard_keys", "list_reply_channels" ->
                        expected.add("sessionId");
                case "load_managed_destination" ->
                        expected.addAll(Set.of("sessionId", "destinationId"));
                case "prepare_destination_update" ->
                        expected.addAll(Set.of("sessionId", "destinationDocument"));
                case "execute_destination_update", "cancel_destination_update" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "destination_update_state" -> expected.add("sessionId");
                case "list_destinations" -> expected.addAll(Set.of("sessionId", "offset"));
                case "load_destination" -> expected.addAll(Set.of("sessionId", "destinationId"));
                case "load_send_destination" ->
                        expected.addAll(Set.of("sessionId", "destinationId"));
                case "load_send_schema" ->
                        expected.addAll(Set.of("sessionId", "destinationId", "schemaDocument"));
                case "read_send_schema" ->
                        expected.addAll(Set.of("sessionId", "contentId", "byteOffset"));
                case "import_key" ->
                        expected.addAll(
                                Set.of("sessionId", "destinationId", "purpose", "keyDocument"));
                case "begin_content" -> expected.addAll(Set.of("sessionId", "totalBytes"));
                case "append_content" ->
                        expected.addAll(Set.of("sessionId", "contentId", "byteOffset", "chunk"));
                case "discard_content" -> expected.addAll(Set.of("sessionId", "contentId"));
                case "prepare_send" -> expected.addAll(Set.of("sessionId", "sendDocument"));
                case "execute_send", "cancel_send" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "send_state" -> expected.add("sessionId");
                case "load_reply_schema" ->
                        expected.addAll(Set.of("sessionId", "proofId", "schemaDocument"));
                case "read_reply_schema" ->
                        expected.addAll(Set.of("sessionId", "proofId", "contentId", "byteOffset"));
                case "reply_target" -> expected.addAll(Set.of("sessionId", "proofId", "offset"));
                case "prepare_reply" -> expected.addAll(Set.of("sessionId", "replyDocument"));
                case "execute_reply", "cancel_reply" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "reply_state" -> expected.add("sessionId");
                case "prepare_receipt", "prepare_reply_receipt" ->
                        expected.addAll(Set.of("sessionId", "receiptDocument"));
                case "execute_receipt",
                        "cancel_receipt",
                        "execute_reply_receipt",
                        "cancel_reply_receipt" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "receipt_state", "reply_receipt_state" -> expected.add("sessionId");
                case "list_submissions" ->
                        expected.addAll(Set.of("sessionId", "destinationId", "offset"));
                case "list_replies" -> expected.addAll(Set.of("sessionId", "offset"));
                case "load_submission" ->
                        expected.addAll(Set.of("sessionId", "destinationId", "submissionId"));
                case "verify_reply" ->
                        expected.addAll(Set.of("sessionId", "caseId", "replyId", "schemaDocument"));
                case "verify_submission" ->
                        expected.addAll(
                                Set.of(
                                        "sessionId",
                                        "destinationId",
                                        "submissionId",
                                        "schemaDocument"));
                case "read_received_schema", "read_received_reply_schema" ->
                        expected.addAll(Set.of("sessionId", "proofId", "byteOffset"));
                case "list_received_contents", "list_received_reply_contents" ->
                        expected.addAll(Set.of("sessionId", "proofId", "offset"));
                case "read_received_content", "read_received_reply_content" ->
                        expected.addAll(Set.of("sessionId", "proofId", "contentId", "byteOffset"));
                case "discard_received", "discard_received_reply" ->
                        expected.addAll(Set.of("sessionId", "proofId"));
                case "validate_profile_credentials" ->
                        expected.addAll(Set.of("clientId", "clientSecret"));
                case "search_process_destinations" ->
                        expected.addAll(Set.of("sessionId", "destinationDocument"));
                case "prepare_destination_cleanup" ->
                        expected.addAll(Set.of("sessionId", "destinationId"));
                case "execute_destination_cleanup", "cancel_destination_cleanup" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "destination_cleanup_state" -> expected.add("sessionId");
                case "prepare_destination_rotation" ->
                        expected.addAll(Set.of("sessionId", "destinationDocument"));
                case "mark_destination_rotation_dispatch",
                        "execute_destination_rotation",
                        "cancel_destination_rotation" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "destination_rotation_state" -> expected.add("sessionId");
                case "prepare_destination_creation" ->
                        expected.addAll(Set.of("sessionId", "destinationDocument"));
                case "mark_destination_creation_dispatch",
                        "execute_destination_creation",
                        "cancel_destination_creation" ->
                        expected.addAll(Set.of("sessionId", "attemptId"));
                case "destination_creation_state" -> expected.add("sessionId");
                case "reconcile_destination_creation", "use_generated_keys" ->
                        expected.addAll(Set.of("sessionId", "bundleId", "destinationId"));
                case "generate_test_keys", "list_generated_keys" -> expected.add("sessionId");
                case "export_session_item" -> expected.addAll(Set.of("sessionId", "offset"));
                case "restore_session_item" ->
                        expected.addAll(Set.of("sessionId", "archiveDocument"));
                case "load_case_event_log" -> expected.addAll(Set.of("sessionId", "caseId"));
                case "load_reply_event_log" ->
                        expected.addAll(Set.of("sessionId", "caseId", "replyId"));
                case "load_event_log" ->
                        expected.addAll(
                                Set.of("sessionId", "destinationId", "caseId", "submissionId"));
                case "list_event_log", "list_case_event_log" ->
                        expected.addAll(Set.of("sessionId", "logId", "offset"));
                case "read_event_log" ->
                        expected.addAll(
                                Set.of("sessionId", "logId", "eventId", "part", "byteOffset"));
                case "discard_event_log" -> expected.addAll(Set.of("sessionId", "logId"));
                default -> throw new IllegalArgumentException();
            }
            if (!expected.equals(values.keySet())) throw new IllegalArgumentException();
            ApiVersion version = ApiVersion.parse(values.get("apiVersion"));
            SessionRole role =
                    command.equals("open_session") ? SessionRole.parse(values.get("role")) : null;
            if (values.containsKey("sessionId")) UUID.fromString(values.get("sessionId"));
            if (values.containsKey("destinationId"))
                DestinationAccess.id(values.get("destinationId"));
            if (values.containsKey("contentId"))
                values.put("contentId", DestinationAccess.id(values.get("contentId")));
            if (values.containsKey("attemptId"))
                values.put("attemptId", DestinationAccess.id(values.get("attemptId")));
            if (values.containsKey("submissionId"))
                values.put("submissionId", DestinationAccess.id(values.get("submissionId")));
            if (values.containsKey("proofId"))
                values.put("proofId", DestinationAccess.id(values.get("proofId")));
            for (String key : List.of("caseId", "replyId", "logId", "eventId", "bundleId"))
                if (values.containsKey(key)) values.put(key, DestinationAccess.id(values.get(key)));
            int offset = values.containsKey("offset") ? Integer.parseInt(values.get("offset")) : 0;
            if (offset < 0 || offset > 10000) throw new IllegalArgumentException();
            long totalBytes = contentSize(values.get("totalBytes"));
            long byteOffset = contentSize(values.get("byteOffset"));
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
                            case "load_send_destination", "load_send_schema", "read_send_schema" ->
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

    private static long contentSize(String value) {
        if (value == null) return 0;
        if (!value.matches("[0-9]{1,9}")) throw new IllegalArgumentException();
        long number = Long.parseLong(value);
        if (number > ContentStore.FILE_BYTES) throw new IllegalArgumentException();
        return number;
    }

    public void close() {
        sessions.close();
    }
}
