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

class ReceiverSchemaTest extends ReceiverTestSupport {
    @Test
    void schemaReferencesCannotBypassTheNativeReadTransport() throws Exception {
        var requests = new AtomicInteger();
        var server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/schema",
                exchange -> {
                    requests.incrementAndGet();
                    byte[] response = "{\"type\":\"object\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    try (var out = exchange.getResponseBody()) {
                        out.write(response);
                    }
                });
        server.start();
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture = new ReceiverFixture(api, false, false);
                    var schemas =
                            Map.of(
                                    ReceiverFixture.SCHEMA,
                                    "{\"$ref\":\"http://127.0.0.1:"
                                            + server.getAddress().getPort()
                                            + "/schema\"}");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, fixture)) {
                        assertThrows(
                                SessionException.class,
                                () ->
                                        registry.withSession(
                                                api,
                                                session,
                                                s ->
                                                        s.receive(
                                                                DEST, SUB, scope, workspace,
                                                                schemas)));
                    }
                    assertEquals(
                            0,
                            requests.get(),
                            "SDK sub-schema loaders must not bypass the native transport");
                }
        } finally {
            server.stop(0);
        }
    }

    @Test
    void bothSdkPipelinesResolveAnExplicitUrnSchemaWithoutNetworkFetching() throws Exception {
        String urn = "urn:synthetic:integration-test:data";
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture =
                            new ReceiverFixture(
                                    api,
                                    false,
                                    false,
                                    text -> text.replace(ReceiverFixture.SCHEMA, urn));
                    ResourceExchange remote =
                            (url, headers) ->
                                    fixture.get(url, headers).replace(ReceiverFixture.SCHEMA, urn);
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        Map.of(
                                                                urn,
                                                                fixture.schemas()
                                                                        .get(
                                                                                ReceiverFixture
                                                                                        .SCHEMA))));
                        assertArrayEquals(fixture.data, result.data());
                    }
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        nativeSession ->
                                                nativeSession.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        Map.of(urn, "{\"type\":\"string\"}")));
                        assertArrayEquals(fixture.data, result.data());
                        assertTrue(
                                result.issues().stream()
                                        .anyMatch(
                                                issue ->
                                                        issue.stage()
                                                                .equals("DATA_SCHEMA_INVALID")));
                        assertEquals(urn, result.schemaSnapshot().schemaUri());
                    }
                }
        }
    }

    @Test
    void successfulXmlReceptionActuallyValidatesTheProvidedXsd() throws Exception {
        String xml = "<antrag><vorname>Erika</vorname></antrag>";
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    var fixture =
                            new ReceiverFixture(
                                    api,
                                    false,
                                    false,
                                    text -> text.replace("application/json", "application/xml"),
                                    xml);
                    ResourceExchange remote =
                            (url, headers) ->
                                    fixture.get(url, headers)
                                            .replace("application/json", "application/xml");
                    try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                        var result =
                                registry.withSession(
                                        api,
                                        session,
                                        s ->
                                                s.receive(
                                                        DEST,
                                                        SUB,
                                                        scope,
                                                        workspace,
                                                        Map.of(
                                                                ReceiverFixture.SCHEMA,
                                                                "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"antrag\"><xs:complexType><xs:sequence><xs:element name=\"vorname\" type=\"xs:string\"/></xs:sequence></xs:complexType></xs:element></xs:schema>")));
                        assertArrayEquals(xml.getBytes(StandardCharsets.UTF_8), result.data());
                        assertEquals("application/xml", result.mimeType());
                        assertEquals(ReceiverFixture.SCHEMA, result.schemaSnapshot().schemaUri());
                        var snapshot =
                                JsonParser.parseString(result.schemaSnapshot().document())
                                        .getAsJsonObject();
                        assertTrue(
                                snapshot.getAsJsonArray("schemas")
                                        .get(0)
                                        .getAsJsonObject()
                                        .get("text")
                                        .getAsString()
                                        .contains("name=\"vorname\""));
                        assertFalse(
                                result.issues().stream()
                                        .anyMatch(
                                                issue ->
                                                        issue.stage()
                                                                .equals("XML_SCHEMA_NOT_CHECKED")));
                    }
                }
        }
    }

    @Test
    void xmlSyntaxAndDoctypeFailuresCannotHideBehindASkippedXsdCheck() throws Exception {
        try (var registry = registry()) {
            for (var api : ApiVersion.values())
                try (var session = open(registry, api)) {
                    registry.withSession(
                            api,
                            session,
                            s -> s.importKey(DEST, "decrypt", pem, List.of(registration)));
                    for (String xml :
                            List.of(
                                    "<antrag><vorname>Erika</antrag>",
                                    "<!DOCTYPE antrag [<!ENTITY x SYSTEM 'file:///not-readable'>]><antrag>&x;</antrag>")) {
                        var fixture =
                                new ReceiverFixture(
                                        api,
                                        false,
                                        false,
                                        text -> text.replace("application/json", "application/xml"),
                                        xml);
                        ResourceExchange remote =
                                (url, headers) ->
                                        fixture.get(url, headers)
                                                .replace("application/json", "application/xml");
                        try (var scope = new ReceiveAccess(api, DEST, SUB, remote)) {
                            assertThrows(
                                    SessionException.class,
                                    () ->
                                            registry.withSession(
                                                    api,
                                                    session,
                                                    s ->
                                                            s.receive(
                                                                    DEST, SUB, scope, workspace,
                                                                    Map.of())));
                        }
                    }
                }
        }
    }
}
