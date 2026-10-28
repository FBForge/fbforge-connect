package org.fitconnect.integration.v2;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.*;
import com.networknt.schema.resource.SchemaLoader;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** Uses the installed validator's resolver API. No default file/HTTP resolver is enabled. */
final class SchemaValidation {
    final SchemaSources sources;
    private List<SchemaProblem> problems = List.of();

    List<ReceivedContent.Issue> reviewIssues() {
        return problems.isEmpty()
                ? List.of()
                : List.of(new ReceivedContent.Issue("DATA_SCHEMA_INVALID", false));
    }

    boolean xml(byte[] data, String uri) {
        problems = sources.xmlProblems(data, uri);
        return problems.isEmpty();
    }

    private final com.fasterxml.jackson.databind.ObjectMapper json =
            new com.fasterxml.jackson.databind.ObjectMapper();

    SchemaValidation(Map<String, String> local, boolean allowed) {
        this(
                SchemaSources.withXmlArchiveLoader(
                        local, allowed, PublicSchemaHttp::text, SdkXmlSchemas::load));
    }

    SchemaValidation(SchemaSources sources) {
        this.sources = sources;
    }

    boolean draft(SchemaSnapshot snapshot, String mime, byte[] data) {
        try {
            if (snapshot == null
                    || snapshot.document() == null
                    || data == null
                    || data.length == 0
                    || !Set.of("application/json", "application/xml").contains(mime))
                throw new SessionException("invalid_submission");
            if (mime.equals("application/json")) {
                try {
                    var parsed =
                            json.reader()
                                    .with(
                                            com.fasterxml.jackson.databind.DeserializationFeature
                                                    .FAIL_ON_TRAILING_TOKENS)
                                    .readTree(data);
                    if (parsed == null || parsed.isMissingNode())
                        throw new SessionException("data_format_invalid");
                } catch (Exception invalid) {
                    throw new SessionException("data_format_invalid");
                }
            }
            var packet = json.readTree(snapshot.document());
            if (packet.path("schemaPackage").asInt() != 1
                    || !snapshot.schemaUri().equals(packet.path("schemaUri").asText()))
                throw new SessionException("schema_unavailable");
            var documents = new LinkedHashMap<String, String>();
            var files = new LinkedHashMap<String, String>();
            if (packet.has("documents") && packet.get("documents").isObject()) {
                var raw = json.readValue(packet.get("documents").toString(), java.util.Map.class);
                for (var name : raw.keySet())
                    documents.put(
                            (String) name, packet.get("documents").get((String) name).toString());
            }
            if (packet.has("schemas") && packet.get("schemas").isArray())
                for (var file : packet.get("schemas")) {
                    String name = file.path("name").asText(), source = file.path("text").asText();
                    if (files.put(name, source) != null)
                        throw new SessionException("schema_unavailable");
                }
            var local = SchemaSources.snapshot(snapshot.schemaUri(), documents, files);
            return mime.equals("application/json")
                    ? new SchemaValidation(local).json(data, snapshot.schemaUri())
                    : !files.isEmpty() && local.validateXml(data, snapshot.schemaUri());
        } catch (SessionException failure) {
            if (failure.code().equals("schema_consent_required"))
                throw new SessionException("schema_unavailable");
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("schema_unavailable");
        }
    }

    boolean json(byte[] data, String uri) {
        try {
            var loader =
                    new SchemaLoader(
                            location ->
                                    () ->
                                            new ByteArrayInputStream(
                                                    SchemaSafety.check(
                                                                    sources.document(
                                                                            location.toString()))
                                                            .getBytes(StandardCharsets.UTF_8)));
            var registry =
                    SchemaRegistry.withDefaultDialect(
                            SpecificationVersion.DRAFT_2020_12,
                            builder ->
                                    builder.schemaLoader(loader)
                                            .schemaRegistryConfig(
                                                    SchemaRegistryConfig.builder()
                                                            .formatAssertionsEnabled(true)
                                                            .build()));
            var schema = registry.getSchema(SchemaLocation.of(uri));
            schema.initializeValidators();
            var failures = schema.validate(json.readTree(data));
            var diagnostics = new ArrayList<SchemaProblem>();
            for (var failure : failures) {
                if (diagnostics.size() == 128) break;
                var location = failure.getInstanceLocation();
                var path = new StringBuilder();
                for (int i = 0; i < location.getNameCount(); i++)
                    path.append('/')
                            .append(
                                    String.valueOf(location.getElement(i))
                                            .replace("~", "~0")
                                            .replace("/", "~1"));
                var constraint = failure.getSchemaNode();
                var expected =
                        constraint == null
                                ? null
                                : constraint.isObject()
                                        ? constraint.get(failure.getKeyword())
                                        : constraint;
                diagnostics.add(
                        SchemaProblem.json(
                                path.toString(),
                                failure.getKeyword(),
                                expected == null ? null : expected.toString()));
            }
            problems = List.copyOf(diagnostics);
            return failures.isEmpty();
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("schema_unavailable");
        }
    }

    String examplePackage(String uri) {
        try {
            var root = json.createObjectNode();
            root.put("schemaPackage", 1);
            root.put("schemaUri", uri);
            if (SchemaSources.documentUri(uri).startsWith("urn:xoev-de:")
                    || sources.document(uri).stripLeading().startsWith("<")) {
                var files = root.putArray("schemas");
                for (var item : sources.xmlFiles(uri).entrySet()) {
                    var file = files.addObject();
                    file.put(
                            "name",
                            item.getKey().toLowerCase(java.util.Locale.ROOT).endsWith(".xsd")
                                    ? item.getKey()
                                    : item.getKey() + ".xsd");
                    file.put("text", item.getValue());
                    file.put("primary", sources.primaryXmlFile(uri, item.getKey()));
                }
            } else {
                var documents = root.putObject("documents");
                var pending = new ArrayDeque<String>();
                pending.add(SchemaSources.documentUri(uri));
                while (!pending.isEmpty()) {
                    String key = pending.removeFirst();
                    if (documents.has(key)) continue;
                    var value = json.readTree(SchemaSafety.check(sources.document(key)));
                    documents.set(key, value);
                    collect(value, URI.create(key), pending, 0, new int[] {20000});
                }
            }
            String result = root.toString();
            if (result.getBytes(StandardCharsets.UTF_8).length > 24 * 1024 * 1024)
                throw new SessionException("content_limit");
            return result;
        } catch (SessionException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SessionException("schema_unavailable");
        }
    }

    /** Best-effort annotation snapshot; no fetch, no effect on a successful verification. */
    SchemaSnapshot snapshot(String uri) {
        try {
            var cached = sources.cachedDocuments();
            var root = json.createObjectNode();
            root.put("schemaPackage", 1);
            root.put("schemaUri", uri);
            String source = cached.get(SchemaSources.documentUri(uri));
            if (uri.startsWith("urn:xoev-de:")
                    || source != null && source.stripLeading().startsWith("<")) {
                var files = sources.cachedXmlFiles(uri);
                if (files.isEmpty()) return new SchemaSnapshot(uri, null);
                var rows = root.putArray("schemas");
                for (var item : files.entrySet()) {
                    var row = rows.addObject();
                    row.put("name", item.getKey());
                    row.put("text", item.getValue());
                    row.put("primary", sources.primaryXmlFile(uri, item.getKey()));
                }
            } else {
                if (source == null) return new SchemaSnapshot(uri, null);
                var documents = root.putObject("documents");
                var pending = new ArrayDeque<String>();
                pending.add(SchemaSources.documentUri(uri));
                while (!pending.isEmpty()) {
                    String key = pending.removeFirst();
                    if (documents.has(key) || !cached.containsKey(key)) continue;
                    var value = json.readTree(SchemaSafety.check(cached.get(key)));
                    documents.set(key, value);
                    collect(value, URI.create(key), pending, 0, new int[] {20000});
                }
            }
            var review = root.putObject("validation");
            review.put("status", problems.isEmpty() ? "valid" : "invalid");
            var errors = review.putArray("errors");
            for (var problem : problems) {
                var row = errors.addObject();
                row.put("path", problem.path());
                row.put("keyword", problem.keyword());
                row.put("message", problem.message());
                row.put("line", problem.line());
                row.put("column", problem.column());
            }
            return new SchemaSnapshot(uri, root.toString());
        } catch (RuntimeException failure) {
            return new SchemaSnapshot(uri, null);
        } catch (Exception failure) {
            return new SchemaSnapshot(uri, null);
        }
    }

    private static void collect(
            JsonNode node, URI base, Deque<String> pending, int depth, int[] budget) {
        if (depth > 64 || --budget[0] < 0 || pending.size() > 512)
            throw new SessionException("content_limit");
        if (node.isObject()) {
            var id = node.get("$id");
            if (id != null && id.isTextual()) base = base.resolve(id.asText());
            for (String keyword : List.of("$ref", "$dynamicRef", "$recursiveRef")) {
                var reference = node.get(keyword);
                if (reference != null
                        && reference.isTextual()
                        && !reference.asText().startsWith("#"))
                    pending.add(
                            SchemaSources.documentUri(base.resolve(reference.asText()).toString()));
            }
        }
        if (node.isObject() || node.isArray())
            for (var child : node) collect(child, base, pending, depth + 1, budget);
    }
}
