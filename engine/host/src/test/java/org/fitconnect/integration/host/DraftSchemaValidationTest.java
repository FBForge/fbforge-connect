package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class DraftSchemaValidationTest {
    @Test
    void bothInstalledValidatorsCheckExactJsonAndXsdSnapshotsWithoutNetworkResolvers()
            throws Exception {
        for (String version : List.of("v2", "v3"))
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of(
                                                "../adapter-"
                                                        + version
                                                        + "/target/adapter-"
                                                        + version
                                                        + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                var type =
                        loader.loadClass(
                                "org.fitconnect.integration." + version + ".SchemaValidation");
                var constructor = type.getDeclaredConstructor(Map.class, boolean.class);
                constructor.setAccessible(true);
                var validator = constructor.newInstance(Map.of(), false);
                var draft =
                        type.getDeclaredMethod(
                                "draft", SchemaSnapshot.class, String.class, byte[].class);
                draft.setAccessible(true);
                String uri = "https://example.invalid/answer.json";
                String packet =
                        "{\"schemaPackage\":1,\"schemaUri\":\""
                                + uri
                                + "\",\"documents\":{\""
                                + uri
                                + "\":{\"type\":\"object\",\"required\":[\"code\"],\"properties\":{\"code\":{\"const\":\"OK\"}}}}}";
                var snapshot = new SchemaSnapshot(uri, packet);
                assertEquals(
                        true,
                        draft.invoke(
                                validator,
                                snapshot,
                                "application/json",
                                "{\"code\":\"OK\"}".getBytes(StandardCharsets.UTF_8)));
                assertEquals(
                        false,
                        draft.invoke(
                                validator,
                                snapshot,
                                "application/json",
                                "{\"code\":\"NO\"}".getBytes(StandardCharsets.UTF_8)));
                assertEquals(
                        false,
                        draft.invoke(
                                validator,
                                snapshot,
                                "application/json",
                                "{}".getBytes(StandardCharsets.UTF_8)));
                for (String invalid :
                        List.of("{\"code\":\"OK\"} trailing", "{", "null null", "  ")) {
                    var failure =
                            assertThrows(
                                    java.lang.reflect.InvocationTargetException.class,
                                    () ->
                                            draft.invoke(
                                                    validator,
                                                    snapshot,
                                                    "application/json",
                                                    invalid.getBytes(StandardCharsets.UTF_8)));
                    assertEquals(
                            "data_format_invalid", ((SessionException) failure.getCause()).code());
                }
                String xsd =
                        "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><xs:element name='antwort' type='xs:integer'/></xs:schema>";
                var xmlPacket = new com.google.gson.JsonObject();
                xmlPacket.addProperty("schemaPackage", 1);
                xmlPacket.addProperty("schemaUri", "urn:test:answer");
                var file = new com.google.gson.JsonObject();
                file.addProperty("name", "https://example.invalid/answer.xsd");
                file.addProperty("text", xsd);
                xmlPacket.add("schemas", new com.google.gson.JsonArray());
                xmlPacket.getAsJsonArray("schemas").add(file);
                var xml = new SchemaSnapshot("urn:test:answer", xmlPacket.toString());
                assertEquals(
                        true,
                        draft.invoke(
                                validator,
                                xml,
                                "application/xml",
                                "<antwort>42</antwort>".getBytes(StandardCharsets.UTF_8)));
                assertEquals(
                        false,
                        draft.invoke(
                                validator,
                                xml,
                                "application/xml",
                                "<antwort>wrong</antwort>".getBytes(StandardCharsets.UTF_8)));
                assertThrows(
                        java.lang.reflect.InvocationTargetException.class,
                        () ->
                                draft.invoke(
                                        validator,
                                        new SchemaSnapshot("urn:test:other", packet),
                                        "application/json",
                                        "{}".getBytes(StandardCharsets.UTF_8)));
            }
    }
}
