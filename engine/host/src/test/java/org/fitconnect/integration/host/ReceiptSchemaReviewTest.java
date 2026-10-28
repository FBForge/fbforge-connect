package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiptSchemaReviewTest extends ReceiverTestSupport {
    @Test
    void nativeConfirmationReadsSchemaStatusFromTheCurrentBoundAttempt() throws Exception {
        for (var api : ApiVersion.values())
            for (boolean mismatch : List.of(false, true)) {
                var fixture = new ReceiverFixture(api, false, false);
                ResourceExchange remote =
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                if (url.contains("/destination-api/") && url.contains("/keys?"))
                                    return "{\"keys\":["
                                            + registration
                                            + ","
                                            + signingRegistration("synthetic-sign")
                                            + "],\"offset\":0,\"count\":2,\"totalCount\":2}";
                                return fixture.get(url, headers);
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                throw new AssertionError(
                                        "Reviewing an attempt must not send a receipt");
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
                                        content)) {
                    String owner =
                            sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                    .sessionId();
                    sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                    sessions.resource(api, owner, "import_key", DEST, 0, "decrypt", pem);
                    sessions.resource(api, owner, "import_key", DEST, 0, "sign", pem);
                    byte[] schema =
                            (mismatch
                                            ? "{\"properties\":{\"vorname\":{\"type\":\"integer\"}}}"
                                            : fixture.schemas().get(ReceiverFixture.SCHEMA))
                                    .getBytes(StandardCharsets.UTF_8);
                    String handle = content.begin(owner, schema.length).contentId();
                    content.append(owner, handle, 0, b64Standard(schema));
                    var proof =
                            (ReceiveStore.Summary)
                                    sessions.verify(
                                                    api,
                                                    owner,
                                                    DEST,
                                                    SUB,
                                                    new Gson()
                                                            .toJson(
                                                                    Map.of(
                                                                            "schemas",
                                                                            List.of(
                                                                                    Map.of(
                                                                                            "uri",
                                                                                            ReceiverFixture
                                                                                                    .SCHEMA,
                                                                                            "contentId",
                                                                                            handle)))))
                                            .data();
                    var receipt =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    "synthetic-sign",
                                    null,
                                    null,
                                    null);
                    var prepared =
                            (SessionManager.PreparedReceipt)
                                    sessions.prepareReceipt(api, owner, receipt, proof.proofId())
                                            .data();
                    String attempt = prepared.attempt().attemptId();
                    var decision =
                            (Map<?, ?>) sessions.receiptReview(api, owner, attempt, false).data();
                    assertEquals(mismatch, decision.get("requiresConfirmation"));
                    var response =
                            success(
                                    new Engine(adapters, sessions)
                                            .handle(
                                                    command(
                                                                    api,
                                                                    owner,
                                                                    "receipt_review",
                                                                    "attemptId",
                                                                    attempt)
                                                            .toString()));
                    assertEquals(mismatch, response.get("requiresConfirmation").getAsBoolean());
                    assertThrows(
                            SessionException.class,
                            () ->
                                    sessions.receiptReview(
                                            api, owner, UUID.randomUUID().toString(), false));
                    assertThrows(
                            SessionException.class,
                            () -> sessions.receiptReview(api, owner, attempt, true));
                    sessions.receipt(api, owner, "cancel_receipt", attempt);
                    assertThrows(
                            SessionException.class,
                            () -> sessions.receiptReview(api, owner, attempt, false));
                }
            }
    }
}
