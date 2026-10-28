package org.fitconnect.integration.contract;

/** Bounded validation locations; messages describe schema constraints, never received values. */
public record SchemaProblem(String path, String keyword, String message, int line, int column) {
    public SchemaProblem {
        path = bounded(path, 2048);
        keyword = bounded(keyword, 128);
        message = bounded(message, 1024);
        line = Math.max(0, line);
        column = Math.max(0, column);
    }

    public static SchemaProblem json(String path, String keyword, String expected) {
        String message =
                switch (keyword) {
                    case "required" -> "Eine Pflichtangabe fehlt.";
                    case "type" -> "Der Datentyp passt nicht zum Schema.";
                    case "enum", "const" -> "Der Wert ist laut Schema nicht zugelassen.";
                    case "format", "pattern" -> "Das Format entspricht nicht der Vorgabe.";
                    case "additionalProperties", "unevaluatedProperties" ->
                            "Ein Feld ist im Schema nicht vorgesehen.";
                    case "minLength", "maxLength" -> "Die Textlänge entspricht nicht der Vorgabe.";
                    case "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum" ->
                            "Der Wert liegt außerhalb des erlaubten Bereichs.";
                    default ->
                            "Die Angabe entspricht nicht der Schema-Regel „"
                                    + bounded(keyword, 128)
                                    + "“.";
                };
        if (expected != null) message += " Schema-Vorgabe: " + bounded(expected, 384);
        return new SchemaProblem(path, keyword, message, 0, 0);
    }

    private static String bounded(String value, int maximum) {
        if (value == null) return "";
        return value.replaceAll("[\\p{Cntrl}]", " ")
                .substring(0, Math.min(value.length(), maximum));
    }

    @Override
    public String toString() {
        return "SchemaProblem[details omitted]";
    }
}
