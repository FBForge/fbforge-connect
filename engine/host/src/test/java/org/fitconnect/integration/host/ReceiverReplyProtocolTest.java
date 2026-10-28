package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverReplyProtocolTest extends ReceiverTestSupport {
    @Test
    void nativeReplyProtocolBindsStagedContentToTheCurrentProofAndOneConfirmedSdkWrite()
            throws Exception {
        for (var api : ApiVersion.values()) {
            var answerKey = JsonParser.parseString(registration).getAsJsonObject();
            answerKey.remove("x5c");
            answerKey.remove("use");
            answerKey.addProperty("kid", "synthetic-reply");
            String standards = "[\"urn:test:answer\",\"urn:test:answer-a\",\"urn:test:answer-b\"]";
            String offer =
                    "\"replyChannel\":{\"fitConnect\":{\"encryptionPublicKey\":"
                            + answerKey
                            + ",\"processStandards\":"
                            + standards
                            + "}},";
            var fixture =
                    new ReceiverFixture(
                            api,
                            false,
                            false,
                            text ->
                                    text.replace(
                                            "\"contentStructure\":",
                                            offer + "\"contentStructure\":"));
            var capture = new ReceiverReplyCapture(api, api == ApiVersion.V2 ? "2.0.0" : "3.0.0");
            ResourceExchange remote =
                    new ResourceExchange() {
                        public String get(String url, Map<String, String> headers) {
                            if (url.contains("/destination-api/") && url.contains("/keys?"))
                                return "{\"keys\":["
                                        + registration
                                        + "],\"offset\":0,\"count\":1,\"totalCount\":1}";
                            return fixture.get(url, headers)
                                    .replace(
                                            "\"submissionSchemas\":",
                                            "\"replyChannels\":{\"fitConnect\":{\"processStandards\":"
                                                    + standards
                                                    + "}},\"submissionSchemas\":");
                        }

                        public Response request(
                                String method,
                                String url,
                                Map<String, String> headers,
                                String body) {
                            return capture.request(method, url, headers, body);
                        }
                    };
            try (var adapters = registry();
                    var content = new ContentStore(workspace);
                    var sessions =
                            new SessionManager(
                                    adapters,
                                    (u, b) ->
                                            "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                    ignored -> remote,
                                    content);
                    var engine = new Engine(adapters, sessions)) {
                String owner =
                        sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                .sessionId();
                sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                byte[] schema =
                        fixture.schemas()
                                .get(ReceiverFixture.SCHEMA)
                                .getBytes(StandardCharsets.UTF_8);
                String schemaHandle = content.begin(owner, schema.length).contentId();
                content.append(owner, schemaHandle, 0, b64Standard(schema));
                String catalog =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemas",
                                                List.of(
                                                        Map.of(
                                                                "uri",
                                                                ReceiverFixture.SCHEMA,
                                                                "contentId",
                                                                schemaHandle))));
                String proof =
                        success(
                                        engine.handle(
                                                command(
                                                                api,
                                                                owner,
                                                                "verify_submission",
                                                                "destinationId",
                                                                DEST,
                                                                "submissionId",
                                                                SUB,
                                                                "schemaDocument",
                                                                catalog)
                                                        .toString()))
                                .get("proofId")
                                .getAsString();
                var target =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString()));
                assertEquals(3, target.get("total").getAsInt());
                assertEquals(2, target.getAsJsonArray("schemas").size());
                assertEquals(
                        "urn:test:answer-b",
                        success(
                                        engine.handle(
                                                command(
                                                                api,
                                                                owner,
                                                                "reply_target",
                                                                "proofId",
                                                                proof,
                                                                "offset",
                                                                2)
                                                        .toString()))
                                .getAsJsonArray("schemas")
                                .get(0)
                                .getAsJsonObject()
                                .get("schemaUri")
                                .getAsString());
                assertEquals(
                        "invalid_input",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        1)
                                                .toString())));
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        UUID.randomUUID().toString(),
                                                        "offset",
                                                        0)
                                                .toString())));
                assertFalse(target.toString().contains("encryptionPublicKey"));
                assertFalse(target.toString().contains("synthetic-token"));
                byte[] answer = "{\"status\":\"erhalten\"}".getBytes(StandardCharsets.UTF_8);
                String dataHandle = content.begin(owner, answer.length).contentId();
                content.append(owner, dataHandle, 0, b64Standard(answer));
                byte[] answerSchema =
                        "{\"$id\":\"urn:test:answer\",\"type\":\"object\",\"required\":[\"status\"],\"properties\":{\"status\":{\"const\":\"erhalten\"}},\"additionalProperties\":false}"
                                .getBytes(StandardCharsets.UTF_8);
                String localSchema = content.begin(owner, answerSchema.length).contentId();
                content.append(owner, localSchema, 0, b64Standard(answerSchema));
                String schemaSelection =
                        new Gson()
                                .toJson(
                                        Map.of(
                                                "schemaUri",
                                                "urn:test:answer",
                                                "mimeType",
                                                "application/json",
                                                "allowExternalSchemas",
                                                false,
                                                "schemaContentId",
                                                localSchema));
                for (String invalidSchema :
                        List.of(
                                new String(answerSchema, StandardCharsets.UTF_8)
                                        .replace("urn:test:answer", "urn:test:other"),
                                "{\"type\":\"object\"}",
                                "{\"$id\":false}",
                                "{\"$id\":\"relative.json\"}")) {
                    byte[] invalidSchemaBytes = invalidSchema.getBytes(StandardCharsets.UTF_8);
                    String invalidSchemaHandle =
                            content.begin(owner, invalidSchemaBytes.length).contentId();
                    content.append(owner, invalidSchemaHandle, 0, b64Standard(invalidSchemaBytes));
                    var invalidSelection =
                            JsonParser.parseString(schemaSelection).getAsJsonObject();
                    invalidSelection.addProperty("schemaContentId", invalidSchemaHandle);
                    assertEquals(
                            "schema_id_mismatch",
                            failure(
                                    engine.handle(
                                            command(
                                                            api,
                                                            owner,
                                                            "load_reply_schema",
                                                            "proofId",
                                                            proof,
                                                            "schemaDocument",
                                                            invalidSelection.toString())
                                                    .toString())));
                    assertEquals(0, capture.posts);
                    content.discard(owner, invalidSchemaHandle);
                }
                var loadedSchema =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "load_reply_schema",
                                                        "proofId",
                                                        proof,
                                                        "schemaDocument",
                                                        schemaSelection)
                                                .toString()));
                content.discard(owner, localSchema);
                String loadedSchemaId = loadedSchema.get("schemaId").getAsString();
                var draft = new JsonObject();
                draft.addProperty("schemaId", loadedSchemaId);
                draft.addProperty("proofId", proof);
                draft.addProperty("schemaUri", "urn:test:answer");
                draft.addProperty("mimeType", "application/json");
                draft.addProperty("contentId", dataHandle);
                draft.add("attachments", new JsonArray());
                draft.add("processMessage", JsonNull.INSTANCE);
                byte[] invalidAnswer = "{\"status\":\"wrong\"}".getBytes(StandardCharsets.UTF_8);
                String invalidHandle = content.begin(owner, invalidAnswer.length).contentId();
                content.append(owner, invalidHandle, 0, b64Standard(invalidAnswer));
                var invalidDraft = draft.deepCopy();
                invalidDraft.addProperty("contentId", invalidHandle);
                assertEquals(
                        "data_schema_invalid",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        invalidDraft.toString())
                                                .toString())));
                assertEquals(0, capture.posts);
                content.discard(owner, invalidHandle);
                var foreignSchema = draft.deepCopy();
                foreignSchema.addProperty("schemaId", UUID.randomUUID().toString());
                assertEquals(
                        "schema_required",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        foreignSchema.toString())
                                                .toString())));
                var malformed = draft.deepCopy();
                malformed.add("publicJwk", answerKey);
                assertEquals(
                        "invalid_submission",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        malformed.toString())
                                                .toString())));
                var prepared =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        draft.toString())
                                                .toString()));
                assertEquals(0, capture.posts);
                assertEquals(
                        "prepared",
                        prepared.getAsJsonObject("attempt").get("status").getAsString());
                assertEquals(
                        SUB, prepared.getAsJsonObject("summary").get("submissionId").getAsString());
                assertEquals(
                        answer.length,
                        prepared.getAsJsonObject("summary").get("dataBytes").getAsInt());
                String attempt = prepared.getAsJsonObject("attempt").get("attemptId").getAsString();
                success(
                        engine.handle(
                                command(api, owner, "cancel_reply", "attemptId", attempt)
                                        .toString()));
                assertEquals(0, capture.posts);
                prepared =
                        success(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "prepare_reply",
                                                        "replyDocument",
                                                        draft.toString())
                                                .toString()));
                attempt = prepared.getAsJsonObject("attempt").get("attemptId").getAsString();
                content.discard(owner, dataHandle);
                var result =
                        success(
                                engine.handle(
                                        command(api, owner, "execute_reply", "attemptId", attempt)
                                                .toString()));
                assertEquals("sent", result.get("status").getAsString(), result.toString());
                assertEquals(1, capture.posts);
                assertArrayEquals(
                        answer, openReply(capture.submitted.get("encryptedData").getAsString()));
                assertEquals(
                        "send_locked",
                        failure(
                                engine.handle(
                                        command(api, owner, "execute_reply", "attemptId", attempt)
                                                .toString())));
                // Replying preserves the original content proof for a subsequent explicit
                // accept/reject.
                success(
                        engine.handle(
                                command(
                                                api,
                                                owner,
                                                "list_received_contents",
                                                "proofId",
                                                proof,
                                                "offset",
                                                0)
                                        .toString()));
                success(
                        engine.handle(
                                command(api, owner, "discard_received", "proofId", proof)
                                        .toString()));
                assertEquals(
                        "invalid_resource",
                        failure(
                                engine.handle(
                                        command(
                                                        api,
                                                        owner,
                                                        "reply_target",
                                                        "proofId",
                                                        proof,
                                                        "offset",
                                                        0)
                                                .toString())));
                assertEquals(1, capture.posts);
            }
        }
    }
}
