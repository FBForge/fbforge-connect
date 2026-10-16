package org.fitconnect.integration.v3;

import tools.jackson.databind.JsonNode;
import java.util.*;
import org.fitconnect.integration.contract.SessionException;

/** Checks schema syntax and dialect before the operation-scoped resolver handles references. */
final class SchemaSafety {
    static String check(String text) {
        try {
            if (text == null || text.length() > 2 * 1024 * 1024) throw new IllegalArgumentException();
            if (text.stripLeading().startsWith("<")) {
                if (java.util.regex.Pattern.compile("<!DOCTYPE|<!ENTITY", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text).find()) throw new IllegalArgumentException();
                return text;
            }
            JsonNode root = tools.jackson.databind.json.JsonMapper.builder().build().readTree(text);
            if (root == null || !(root.isObject() || root.isBoolean())) throw new IllegalArgumentException();
            var pending = new ArrayDeque<JsonNode>(); pending.add(root);
            int remaining = 20000;
            while (!pending.isEmpty()) {
                var node = pending.removeLast();
                if (--remaining < 0) throw new IllegalArgumentException();
                if (node.isObject()) {
                    for (String name : List.of("$ref", "$dynamicRef", "$recursiveRef")) {
                        var ref = node.get(name);
                        if (ref != null && (!ref.isTextual() || ref.asText().length() > 4096)) throw new IllegalArgumentException();
                    }
                    var dialect = node.get("$schema");
                    if (dialect != null && (!dialect.isTextual() || !dialect.asText().matches("https?://json-schema\\.org/(?:draft-(?:04|06|07)/schema#?|draft/(?:2019-09|2020-12)/schema#?)"))) throw new IllegalArgumentException();
                }
                if (node.isObject() || node.isArray()) for (var child : node) pending.add(child);
            }
            return text;
        } catch (Exception failure) { throw new SessionException("schema_unavailable"); }
    }
}
