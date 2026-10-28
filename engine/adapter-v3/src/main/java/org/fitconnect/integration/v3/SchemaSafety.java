package org.fitconnect.integration.v3;

import java.util.*;
import org.fitconnect.integration.contract.SessionException;
import tools.jackson.databind.JsonNode;

/** Checks schema syntax and dialect before the operation-scoped resolver handles references. */
final class SchemaSafety {
    static String check(String text) {
        try {
            if (text == null || text.length() > 2 * 1024 * 1024)
                throw new IllegalArgumentException();
            if (text.stripLeading().startsWith("<")) {
                if (java.util.regex.Pattern.compile(
                                "<!DOCTYPE|<!ENTITY", java.util.regex.Pattern.CASE_INSENSITIVE)
                        .matcher(text)
                        .find()) throw new IllegalArgumentException();
                org.fitconnect.integration.contract.SchemaSources.requireXmlSchema(text);
                return text;
            }
            JsonNode root = tools.jackson.databind.json.JsonMapper.builder().build().readTree(text);
            if (root == null || !(root.isObject() || root.isBoolean()))
                throw new IllegalArgumentException();
            if (errorResponse(root)) throw new IllegalArgumentException();
            var pending = new ArrayDeque<JsonNode>();
            pending.add(root);
            int remaining = 20000;
            while (!pending.isEmpty()) {
                var node = pending.removeLast();
                if (--remaining < 0) throw new IllegalArgumentException();
                if (node.isObject()) {
                    for (String name : List.of("$ref", "$dynamicRef", "$recursiveRef")) {
                        var ref = node.get(name);
                        if (ref != null && (!ref.isTextual() || ref.asText().length() > 4096))
                            throw new IllegalArgumentException();
                    }
                    var dialect = node.get("$schema");
                    if (dialect != null
                            && (!dialect.isTextual()
                                    || !dialect.asText()
                                            .matches(
                                                    "https?://json-schema\\.org/(?:draft-(?:04|06|07)/schema#?|draft/(?:2019-09|2020-12)/schema#?)")))
                        throw new IllegalArgumentException();
                }
                if (node.isObject() || node.isArray()) for (var child : node) pending.add(child);
            }
            return text;
        } catch (Exception failure) {
            throw new SessionException("schema_unavailable");
        }
    }

    private static boolean errorResponse(JsonNode root) {
        if (!root.isObject()) return false;
        for (String key :
                List.of(
                        "type",
                        "$ref",
                        "$dynamicRef",
                        "$recursiveRef",
                        "properties",
                        "patternProperties",
                        "additionalProperties",
                        "unevaluatedProperties",
                        "propertyNames",
                        "required",
                        "dependencies",
                        "dependentRequired",
                        "dependentSchemas",
                        "items",
                        "prefixItems",
                        "additionalItems",
                        "unevaluatedItems",
                        "contains",
                        "minContains",
                        "maxContains",
                        "minItems",
                        "maxItems",
                        "uniqueItems",
                        "minProperties",
                        "maxProperties",
                        "minLength",
                        "maxLength",
                        "pattern",
                        "format",
                        "minimum",
                        "maximum",
                        "exclusiveMinimum",
                        "exclusiveMaximum",
                        "multipleOf",
                        "enum",
                        "const",
                        "allOf",
                        "anyOf",
                        "oneOf",
                        "not",
                        "if",
                        "then",
                        "else")) {
            if (root.has(key)) {
                if (!key.equals("type")) return false;
                var type = root.get(key);
                if (type.isTextual()
                        && Set.of(
                                        "object", "array", "string", "integer", "number", "boolean",
                                        "null")
                                .contains(type.asText())) return false;
                if (type.isArray()) return false;
            }
        }
        var error = root.path("error");
        int status = root.path("status").asInt(0), code = error.path("code").asInt(0);
        return "error".equals(root.path("result").asText())
                        && !error.isMissingNode()
                        && !error.isNull()
                || status >= 400
                        && status <= 599
                        && (root.path("title").isTextual()
                                || root.path("message").isTextual()
                                || !error.isMissingNode() && !error.isNull())
                || code >= 400
                        && code <= 599
                        && (error.path("msg").isTextual() || error.path("message").isTextual());
    }
}
