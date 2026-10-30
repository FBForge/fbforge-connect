package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.fitconnect.integration.contract.SchemaSnapshot;
import org.junit.jupiter.api.Test;

class GeneratedChannelSchemaTest {
    @Test
    void bothSdkValidatorsAcceptGeneratedExamplesAndRejectStatusRequiredAndTypeViolations()
            throws Exception {
        var fixture =
                JsonParser.parseString(
                                Files.readString(
                                        Path.of(
                                                "../../frontend/test-fixtures/assets/channel-generated.json")))
                        .getAsJsonObject();
        var schema = fixture.getAsJsonObject("schema");
        var uri = schema.get("$id").getAsString();
        var packet = new JsonObject();
        packet.addProperty("schemaPackage", 1);
        packet.addProperty("schemaUri", uri);
        var documents = new JsonObject();
        documents.add(uri, schema);
        packet.add("documents", documents);
        var snapshot = new SchemaSnapshot(uri, packet.toString());
        for (String api : List.of("v2", "v3")) {
            try (var loader =
                    new URLClassLoader(
                            new URL[] {
                                Path.of("../adapter-" + api + "/target/adapter-" + api + ".jar")
                                        .toUri()
                                        .toURL()
                            },
                            getClass().getClassLoader())) {
                var type =
                        loader.loadClass("org.fitconnect.integration." + api + ".SchemaValidation");
                var constructor = type.getDeclaredConstructor(Map.class, boolean.class);
                constructor.setAccessible(true);
                var validator = constructor.newInstance(Map.of(), false);
                var draft =
                        type.getDeclaredMethod(
                                "draft", SchemaSnapshot.class, String.class, byte[].class);
                draft.setAccessible(true);
                var example = fixture.getAsJsonObject("example");
                assertEquals(
                        true,
                        draft.invoke(
                                validator,
                                snapshot,
                                "application/json",
                                example.toString().getBytes(StandardCharsets.UTF_8)));
                var invalid = new ArrayList<JsonObject>();
                var status = example.deepCopy();
                status.addProperty("status", "not-offered");
                invalid.add(status);
                var missing = example.deepCopy();
                missing.remove("field0");
                invalid.add(missing);
                var wrongType = example.deepCopy();
                wrongType.addProperty("field3", "not-a-boolean");
                invalid.add(wrongType);
                var unexpected = example.deepCopy();
                unexpected.addProperty("extra", "value");
                invalid.add(unexpected);
                for (var data : invalid)
                    assertEquals(
                            false,
                            draft.invoke(
                                    validator,
                                    snapshot,
                                    "application/json",
                                    data.toString().getBytes(StandardCharsets.UTF_8)),
                            api + ": " + data);
            }
        }
    }
}
