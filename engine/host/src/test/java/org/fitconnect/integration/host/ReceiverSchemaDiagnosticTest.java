package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiverSchemaDiagnosticTest extends ReceiverTestSupport {
    @Test
    void schemaMismatchesHaveAnActionableCodeWhileHashFailuresRemainTechnical() throws Exception {
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
                                            : "{\"type\":\"object\",\"required\":[\"nachname\"]}";
                            ResourceExchange remote =
                                    (url, headers) ->
                                            fixture.get(url, headers)
                                                    .replace("application/json", mime);
                            try (var source = new ReceiveAccess(api, DEST, SUB, remote)) {
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
                                                                        hashFailure
                                                                                ? validSchema
                                                                                : wrongSchema)));
                                assertEquals(
                                        hashFailure ? "verification_failed" : "data_schema_invalid",
                                        failure.code(),
                                        api + " " + mime);
                                assertThrows(
                                        SessionException.class,
                                        () -> session.receiptEvidence(DEST, SUB),
                                        "Failed validation must not create acceptance evidence");
                            }
                        }
                    }
                }
        }
    }
}
