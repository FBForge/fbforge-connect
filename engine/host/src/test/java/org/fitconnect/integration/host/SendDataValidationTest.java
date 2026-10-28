package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class SendDataValidationTest {
    private static final String DEST = "11111111-1111-4111-8111-111111111111";

    private static String upload(ContentStore store, String owner, String data) {
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        var handle = store.begin(owner, bytes.length);
        if (bytes.length > 0)
            store.append(owner, handle.contentId(), 0, Base64.getEncoder().encodeToString(bytes));
        return handle.contentId();
    }

    private static String request(String uri, String mime, String contentId, String schemaId) {
        var request = new JsonObject();
        request.addProperty("serviceIdentifier", "urn:test:service");
        request.addProperty("schemaUri", uri);
        request.addProperty("mimeType", mime);
        request.addProperty("contentId", contentId);
        request.addProperty("processModelId", "");
        request.addProperty("messageId", "");
        request.addProperty("allowExternalSchemas", false);
        var refs = new JsonArray();
        if (schemaId != null) {
            var ref = new JsonObject();
            ref.addProperty("uri", uri);
            ref.addProperty("contentId", schemaId);
            refs.add(ref);
        }
        request.add("schemas", refs);
        return request.toString();
    }

    private static AuthenticatedSession advertised(
            AuthenticatedSession delegate, String uri, String mime) {
        return (AuthenticatedSession)
                Proxy.newProxyInstance(
                        AuthenticatedSession.class.getClassLoader(),
                        new Class<?>[] {AuthenticatedSession.class},
                        (proxy, method, args) -> {
                            if (method.getName().equals("destination"))
                                return "{\"destinationId\":\""
                                        + DEST
                                        + "\",\"publicServices\":[{\"identifier\":\"urn:test:service\",\"submissionSchemas\":[{\"schemaUri\":\""
                                        + uri
                                        + "\",\"mimeType\":\""
                                        + mime
                                        + "\"}]}]}";
                            try {
                                return method.invoke(delegate, args);
                            } catch (InvocationTargetException failure) {
                                throw failure.getCause();
                            }
                        });
    }

    @Test
    void bothRealAdaptersValidateJsonAndXmlBeforeAnySubmissionWrite() throws Exception {
        try (var adapters = DestinationManagementTest.registry();
                var content = new ContentStore()) {
            for (var api : ApiVersion.values())
                try (var token =
                        adapters.openSession(
                                api,
                                "id",
                                "secret",
                                (url, body) ->
                                        "{\"access_token\":\"synthetic\",\"expires_in\":3600}",
                                (url, headers) -> {
                                    fail("Validation must not make resource or write requests");
                                    return null;
                                })) {
                    adapters.withSession(
                            api,
                            token,
                            session -> {
                                var json =
                                        advertised(
                                                session,
                                                DemoSchemas.APPLICATION,
                                                "application/json");
                                String valid =
                                        upload(
                                                content,
                                                "sender",
                                                "{\"antragstellendePerson\":{\"vorname\":\"Erika\",\"nachname\":\"Muster\"},\"anliegen\":\"Fiktiver Test\"}");
                                assertTrue(
                                        SendDataValidation.validate(
                                                        json,
                                                        DEST,
                                                        request(
                                                                DemoSchemas.APPLICATION,
                                                                "application/json",
                                                                valid,
                                                                null),
                                                        content,
                                                        "sender")
                                                .valid());
                                String invalid = upload(content, "sender", "{}");
                                assertEquals(
                                        "data_schema_invalid",
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                SendDataValidation.validate(
                                                                        json,
                                                                        DEST,
                                                                        request(
                                                                                DemoSchemas
                                                                                        .APPLICATION,
                                                                                "application/json",
                                                                                invalid,
                                                                                null),
                                                                        content,
                                                                        "sender"))
                                                .code());
                                assertThrows(
                                        SessionException.class,
                                        () ->
                                                SendDataValidation.validate(
                                                        json,
                                                        DEST,
                                                        request(
                                                                DemoSchemas.APPLICATION,
                                                                "application/json",
                                                                valid,
                                                                null),
                                                        content,
                                                        "other-owner"));
                                String uri = "urn:test:antrag",
                                        xsd =
                                                upload(
                                                        content,
                                                        "sender",
                                                        "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:element name='antrag' type='xs:integer'/></xs:schema>");
                                var xml = advertised(session, uri, "application/xml");
                                String number = upload(content, "sender", "<antrag>42</antrag>"),
                                        wrong =
                                                upload(
                                                        content,
                                                        "sender",
                                                        "<antrag>kein Wert</antrag>");
                                assertTrue(
                                        SendDataValidation.validate(
                                                        xml,
                                                        DEST,
                                                        request(
                                                                uri,
                                                                "application/xml",
                                                                number,
                                                                xsd),
                                                        content,
                                                        "sender")
                                                .valid());
                                assertEquals(
                                        "data_schema_invalid",
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                SendDataValidation.validate(
                                                                        xml,
                                                                        DEST,
                                                                        request(
                                                                                uri,
                                                                                "application/xml",
                                                                                wrong,
                                                                                xsd),
                                                                        content,
                                                                        "sender"))
                                                .code());
                                assertEquals(
                                        "schema_consent_required",
                                        assertThrows(
                                                        SessionException.class,
                                                        () ->
                                                                SendDataValidation.validate(
                                                                        xml,
                                                                        DEST,
                                                                        request(
                                                                                uri,
                                                                                "application/xml",
                                                                                number,
                                                                                null),
                                                                        content,
                                                                        "sender"))
                                                .code());
                                return null;
                            });
                }
        }
    }
}
