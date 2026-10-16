package org.fitconnect.integration.v3;

import tools.jackson.databind.JsonNode;
import com.networknt.schema.*;
import com.networknt.schema.resource.SchemaLoader;
import org.fitconnect.integration.contract.*;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Uses the installed validator's resolver API. No default file/HTTP resolver is enabled. */
final class SchemaValidation {
    final SchemaSources sources;
    private final tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
    SchemaValidation(Map<String,String> local, boolean allowed) {
        this(new SchemaSources(local, allowed, PublicSchemaHttp::text, PublicSchemaHttp::archive));
    }
    SchemaValidation(SchemaSources sources) {
        this.sources = sources;
    }
    boolean json(byte[] data, String uri) {
        try {
            var loader = new SchemaLoader(location -> () -> new ByteArrayInputStream(
                    SchemaSafety.check(sources.document(location.toString())).getBytes(StandardCharsets.UTF_8)));
            var registry = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12,
                    builder -> builder.schemaLoader(loader).schemaRegistryConfig(SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build()));
            var schema = registry.getSchema(SchemaLocation.of(uri));
            schema.initializeValidators();
            return schema.validate(json.readTree(data)).isEmpty();
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("schema_unavailable"); }
    }
    String examplePackage(String uri) {
        try {
            var root = json.createObjectNode(); root.put("schemaPackage", 1); root.put("schemaUri", uri);
            if (SchemaSources.documentUri(uri).startsWith("urn:xoev-de:") || sources.document(uri).stripLeading().startsWith("<")) {
                var files = root.putArray("schemas");
                for (var item : sources.xmlFiles(uri).entrySet()) {
                    var file = files.addObject(); file.put("name", item.getKey().toLowerCase(java.util.Locale.ROOT).endsWith(".xsd") ? item.getKey() : item.getKey() + ".xsd"); file.put("text", item.getValue()); file.put("primary", sources.primaryXmlFile(uri, item.getKey()));
                }
            } else {
                var documents = root.putObject("documents");
                var pending = new ArrayDeque<String>(); pending.add(SchemaSources.documentUri(uri));
                while (!pending.isEmpty()) {
                    String key = pending.removeFirst();
                    if (documents.has(key)) continue;
                    var value = json.readTree(SchemaSafety.check(sources.document(key)));
                    documents.set(key, value);
                    collect(value, URI.create(key), pending, 0, new int[]{20000});
                }
            }
            String result = root.toString();
            if (result.getBytes(StandardCharsets.UTF_8).length > 24 * 1024 * 1024) throw new SessionException("content_limit");
            return result;
        } catch (SessionException failure) { throw failure;
        } catch (Exception failure) { throw new SessionException("schema_unavailable"); }
    }
    private static void collect(JsonNode node, URI base, Deque<String> pending, int depth, int[] budget) {
        if (depth > 64 || --budget[0] < 0 || pending.size() > 512) throw new SessionException("content_limit");
        if (node.isObject()) {
            var id = node.get("$id"); if (id != null && id.isTextual()) base = base.resolve(id.asText());
            for (String keyword : List.of("$ref", "$dynamicRef", "$recursiveRef")) {
                var reference = node.get(keyword);
                if (reference != null && reference.isTextual() && !reference.asText().startsWith("#"))
                    pending.add(SchemaSources.documentUri(base.resolve(reference.asText()).toString()));
            }
        }
        if (node.isObject() || node.isArray()) for (var child : node) collect(child, base, pending, depth + 1, budget);
    }
}
