package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.*;

class ReceiverReceiptProtocolTest extends ReceiverTestSupport {
    @Test
    void sessionOwnedReceiptsRecheckKeysAndIdentityAndPreserveUncertainOutcomes() throws Exception {
        for (var api : ApiVersion.values())
            for (String mode :
                    List.of("confirmed", "withdrawn", "changed-case", "context", "lost")) {
                var fixture = new ReceiverFixture(api, false, false);
                var writes = new AtomicInteger();
                var changed = new java.util.concurrent.atomic.AtomicBoolean();
                ResourceExchange remote =
                        new ResourceExchange() {
                            public String get(String url, Map<String, String> headers) {
                                if (url.contains("/destination-api/") && url.contains("/keys?")) {
                                    boolean withdrawn = changed.get() && mode.equals("withdrawn");
                                    return "{\"keys\":["
                                            + (withdrawn
                                                    ? ""
                                                    : signingRegistration("synthetic-sign"))
                                            + "],\"offset\":0,\"count\":"
                                            + (withdrawn ? 0 : 1)
                                            + ",\"totalCount\":"
                                            + (withdrawn ? 0 : 1)
                                            + "}";
                                }
                                String result = fixture.get(url, headers);
                                if (url.endsWith("/submissions/" + SUB)
                                        && changed.get()
                                        && mode.equals("changed-case")) {
                                    var envelope = JsonParser.parseString(result).getAsJsonObject();
                                    envelope.addProperty("caseId", UUID.randomUUID().toString());
                                    return envelope.toString();
                                }
                                return result;
                            }

                            public Response request(
                                    String method,
                                    String url,
                                    Map<String, String> headers,
                                    String body) {
                                assertEquals("POST", method);
                                assertEquals(
                                        "https://test.fit-connect.fitko.dev/submission-api/"
                                                + api.wireValue()
                                                + "/cases/"
                                                + CASE
                                                + "/events",
                                        url);
                                checkedReceiptUnchecked(body);
                                writes.incrementAndGet();
                                if (mode.equals("lost"))
                                    throw new SessionException("resource_unavailable");
                                return new Response(204, "");
                            }
                        };
                try (var registry = registry();
                        var content = new ContentStore(workspace);
                        var sessions =
                                new SessionManager(
                                        registry,
                                        (u, b) ->
                                                "{\"access_token\":\"synthetic-token\",\"expires_in\":3600}",
                                        ignored -> remote,
                                        content)) {
                    String owner =
                            sessions.open(api, SessionRole.ADMINISTRATIVE_SYSTEM, "id", "secret")
                                    .sessionId();
                    sessions.resource(api, owner, "load_destination", DEST, 0, null, null);
                    sessions.resource(api, owner, "import_key", DEST, 0, "sign", pem);
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "reject",
                                    null,
                                    "technical-error",
                                    "Synthetischer Test",
                                    null);
                    var engine = new Engine(registry, sessions);
                    var prepared =
                            new Gson()
                                    .fromJson(
                                            success(
                                                    engine.handle(
                                                            command(
                                                                            api,
                                                                            owner,
                                                                            "prepare_receipt",
                                                                            "receiptDocument",
                                                                            new Gson()
                                                                                    .toJson(
                                                                                            request))
                                                                    .toString())),
                                            SessionManager.PreparedReceipt.class);
                    assertFalse(new Gson().toJson(prepared).contains("synthetic-token"));
                    assertWorkspaceEmpty(content.workspace(owner));
                    assertEquals(0, writes.get());
                    changed.set(true);
                    String attempt = prepared.attempt().attemptId();
                    if (mode.equals("context")) {
                        sessions.lookup(api, owner, "load_submission", DEST, SUB, 0);
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                        assertEquals(
                                "cancelled",
                                ((ReceiptAccess.State)
                                                sessions.receipt(api, owner, "receipt_state", null)
                                                        .data())
                                        .status());
                    } else {
                        var result =
                                new Gson()
                                        .fromJson(
                                                success(
                                                        engine.handle(
                                                                command(
                                                                                api,
                                                                                owner,
                                                                                "execute_receipt",
                                                                                "attemptId",
                                                                                attempt)
                                                                        .toString())),
                                                ReceiptAccess.State.class);
                        assertEquals(
                                mode.equals("confirmed")
                                        ? "confirmed"
                                        : mode.equals("lost") ? "uncertain" : "failed",
                                result.status());
                        assertEquals(SUB, result.submissionId());
                        assertEquals(CASE, result.caseId());
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                        if (mode.equals("lost")) {
                            sessions.resource(api, owner, "discard_keys", null, 0, null, null);
                            assertEquals(
                                    "uncertain",
                                    ((ReceiptAccess.State)
                                                    sessions.receipt(
                                                                    api,
                                                                    owner,
                                                                    "receipt_state",
                                                                    null)
                                                            .data())
                                            .status());
                        }
                        if (mode.equals("confirmed"))
                            assertEquals(
                                    1,
                                    ((DestinationAccess.KeyState)
                                                    sessions.resource(
                                                                    api,
                                                                    owner,
                                                                    "loaded_keys",
                                                                    null,
                                                                    0,
                                                                    null,
                                                                    null)
                                                            .data())
                                            .keys()
                                            .size());
                    }
                    assertEquals(
                            mode.equals("confirmed") || mode.equals("lost") ? 1 : 0,
                            writes.get(),
                            mode);
                }
            }
    }

    @Test
    void sessionAcceptIsProofApiRoleAndAttemptBoundAndKeepsReusableKeysAfterConfirmation()
            throws Exception {
        for (var api : ApiVersion.values())
            for (boolean discard : List.of(false, true)) {
                var fixture = new ReceiverFixture(api, false, false);
                var writes = new AtomicInteger();
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
                                try {
                                    checkedReceipt(
                                            new SignedReceipt(
                                                    UUID.fromString(DEST),
                                                    UUID.fromString(SUB),
                                                    UUID.fromString(CASE),
                                                    "accept",
                                                    "synthetic-sign",
                                                    body),
                                            "accept");
                                } catch (Exception failure) {
                                    throw new AssertionError(failure);
                                }
                                writes.incrementAndGet();
                                return new Response(204, "");
                            }
                        };
                try (var registry = registry();
                        var content = new ContentStore(workspace);
                        var sessions =
                                new SessionManager(
                                        registry,
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
                            fixture.schemas()
                                    .get(ReceiverFixture.SCHEMA)
                                    .getBytes(StandardCharsets.UTF_8);
                    String handle = content.begin(owner, schema.length).contentId();
                    content.append(owner, handle, 0, Base64.getEncoder().encodeToString(schema));
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
                                                                    handle))));
                    var proof =
                            (ReceiveStore.Summary)
                                    sessions.verify(api, owner, DEST, SUB, catalog).data();
                    var request =
                            new ReceiptRequest(
                                    UUID.fromString(DEST),
                                    UUID.fromString(SUB),
                                    UUID.fromString(CASE),
                                    "accept",
                                    null,
                                    null,
                                    null,
                                    null);
                    var prepared =
                            (SessionManager.PreparedReceipt)
                                    sessions.prepareReceipt(api, owner, request, proof.proofId())
                                            .data();
                    assertEquals(proof.warnings(), prepared.warnings());
                    assertWorkspaceEmpty(content.workspace(owner));
                    String other =
                            sessions.open(api, SessionRole.ONLINE_SERVICE, "other", "secret")
                                    .sessionId();
                    String attempt = prepared.attempt().attemptId();
                    assertThrows(
                            SessionException.class,
                            () -> sessions.receipt(api, other, "execute_receipt", attempt));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    sessions.receipt(
                                            api == ApiVersion.V2 ? ApiVersion.V3 : ApiVersion.V2,
                                            owner,
                                            "execute_receipt",
                                            attempt));
                    assertThrows(
                            SessionException.class,
                            () ->
                                    sessions.receipt(
                                            api,
                                            owner,
                                            "execute_receipt",
                                            UUID.randomUUID().toString()));
                    if (discard) {
                        sessions.received(api, owner, "discard_received", proof.proofId(), null, 0);
                        assertThrows(
                                SessionException.class,
                                () -> sessions.receipt(api, owner, "execute_receipt", attempt));
                    } else {
                        assertEquals(
                                "confirmed",
                                ((ReceiptAccess.State)
                                                sessions.receipt(
                                                                api,
                                                                owner,
                                                                "execute_receipt",
                                                                attempt)
                                                        .data())
                                        .status());
                        assertThrows(
                                SessionException.class,
                                () ->
                                        sessions.received(
                                                api,
                                                owner,
                                                "list_received_contents",
                                                proof.proofId(),
                                                null,
                                                0));
                        assertEquals(
                                2,
                                ((DestinationAccess.KeyState)
                                                sessions.resource(
                                                                api,
                                                                owner,
                                                                "loaded_keys",
                                                                null,
                                                                0,
                                                                null,
                                                                null)
                                                        .data())
                                        .keys()
                                        .size());
                    }
                    assertEquals(discard ? 0 : 1, writes.get());
                }
            }
    }
}
