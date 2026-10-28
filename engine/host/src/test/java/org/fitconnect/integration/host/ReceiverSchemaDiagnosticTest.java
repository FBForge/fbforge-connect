package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiverSchemaDiagnosticTest extends ReceiverTestSupport {
    @Test
    void schemaMismatchesKeepReadableContentWhileHashFailuresRemainBlocked() throws Exception {
        String xmlSchema =
                "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">"
                        + "<xs:element name=\"antrag\"><xs:complexType><xs:sequence>"
                        + "<xs:element name=\"vorname\" type=\"xs:string\"/>"
                        + "</xs:sequence></xs:complexType></xs:element></xs:schema>";
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    session.importKey(DEST, "decrypt", pem, List.of(registration));
                    for (boolean xml : List.of(false, true)) {
                        String mime = xml ? "application/xml" : "application/json";
                        for (boolean hashFailure : List.of(false, true)) {
                            var fixture =
                                    new ReceiverFixture(
                                            api,
                                            false,
                                            hashFailure,
                                            text -> text.replace("application/json", mime),
                                            xml
                                                    ? "<antrag><vorname>Erika</vorname></antrag>"
                                                    : "Erika");
                            String validSchema =
                                    xml ? xmlSchema : fixture.schemas().get(ReceiverFixture.SCHEMA);
                            String wrongSchema =
                                    xml
                                            ? xmlSchema.replace("vorname", "nachname")
                                            : "{\"type\":\"object\",\"properties\":{\"vorname\":{\"type\":\"integer\"}}}";
                            ResourceExchange remote =
                                    (url, headers) ->
                                            fixture.get(url, headers)
                                                    .replace("application/json", mime);
                            try (var source = new ReceiveAccess(api, DEST, SUB, remote)) {
                                if (hashFailure) {
                                    var failure =
                                            assertThrows(
                                                    SessionException.class,
                                                    () ->
                                                            session.receive(
                                                                    DEST,
                                                                    SUB,
                                                                    source,
                                                                    workspace,
                                                                    Map.of(
                                                                            ReceiverFixture.SCHEMA,
                                                                            validSchema)));
                                    assertEquals(
                                            "verification_failed",
                                            failure.code(),
                                            api + " " + mime);
                                    assertThrows(
                                            SessionException.class,
                                            () -> session.receiptEvidence(DEST, SUB),
                                            "Integrity failures must never create receipt evidence");
                                } else {
                                    var content =
                                            session.receive(
                                                    DEST,
                                                    SUB,
                                                    source,
                                                    workspace,
                                                    Map.of(ReceiverFixture.SCHEMA, wrongSchema));
                                    assertTrue(
                                            content.issues().stream()
                                                    .anyMatch(
                                                            issue ->
                                                                    issue.stage()
                                                                            .equals(
                                                                                    "DATA_SCHEMA_INVALID")));
                                    assertArrayEquals(fixture.data, content.data());
                                    var report =
                                            com.google.gson.JsonParser.parseString(
                                                            content.schemaSnapshot().document())
                                                    .getAsJsonObject()
                                                    .getAsJsonObject("validation");
                                    assertEquals("invalid", report.get("status").getAsString());
                                    assertFalse(report.getAsJsonArray("errors").isEmpty());
                                    if (!xml) {
                                        assertEquals(
                                                "/vorname",
                                                report.getAsJsonArray("errors")
                                                        .get(0)
                                                        .getAsJsonObject()
                                                        .get("path")
                                                        .getAsString());
                                        assertFalse(
                                                report.toString().contains("Erika"),
                                                "Schema diagnostics must not copy received values into schema snapshots");
                                    }
                                    assertNotNull(
                                            session.receiptEvidence(DEST, SUB),
                                            "Cryptographic evidence is independent of schema conformity");
                                }
                            }
                        }
                    }
                }
        }
    }
}
