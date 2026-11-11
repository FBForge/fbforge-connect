package org.fitconnect.integration.contract;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Bounded SDK message fields for local display, without stack traces or request/response objects.
 */
public record SdkDiagnostic(String stage, String type, String message) {
    public static final int MAX_ENTRIES = 8;
    private static final Set<String> STAGES =
            Set.of(
                    "RECEIVE",
                    "REPLY",
                    "EVENT_LOG",
                    "METADATA",
                    "DATA",
                    "ATTACHMENTS",
                    "REPLY_CHANNEL");
    private static final Pattern SECRETS =
            Pattern.compile(
                    "(?i)([\"']?(?:authorization|proxy-authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwort|private[_-]?key)[\"']?\\s*[:=]\\s*)(\"(?:\\\\.|[^\"\\\\])*+(?:\"|$)|'[^']*+(?:'|$)|[^\\s,;\\]}]+)");

    public SdkDiagnostic {
        stage = stage != null && STAGES.contains(stage) ? stage : "RECEIVE";
        type = type != null && type.matches("[A-Za-z][A-Za-z0-9_$]{0,127}") ? type : "SdkFailure";
        message = safeText(message);
    }

    private static String safeText(String value) {
        if (value == null) return "";
        String text =
                limit(value, 16384)
                        .replaceAll(
                                "(?s)-----BEGIN [A-Z0-9 ]+-----.*?(?:-----END [A-Z0-9 ]+-----|$)",
                                "[Schlüsselmaterial ausgeblendet]")
                        .replaceAll(
                                "(?i)\\b(Bearer|Basic)\\s+[A-Za-z0-9+/_.=-]+", "$1 [ausgeblendet]")
                        .replaceAll(
                                "\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]*)?",
                                "[Token ausgeblendet]")
                        .replaceAll("(?i)(https?://)[^\\s/@]+:[^\\s/@]+@", "$1[ausgeblendet]@")
                        .replaceAll(
                                "(?i)(https?://[^\\s?#]+)[?#][^\\s]*",
                                "$1?[Parameter ausgeblendet]")
                        .replaceAll("(?s)\\[Source:.*", "[Source: ausgeblendet]");
        text = SECRETS.matcher(text).replaceAll("$1[ausgeblendet]");
        text =
                text.replaceAll(
                        "(?i)(\"(?:d|p|q|dp|dq|qi|oth|k)\"\\s*:\\s*)\"(?:\\\\.|[^\"\\\\])*+(?:\"|$)",
                        "$1\"[ausgeblendet]\"");
        var clean = new StringBuilder();
        text.codePoints()
                .forEach(
                        c ->
                                clean.appendCodePoint(
                                        Character.isISOControl(c)
                                                        || Character.getType(c) == Character.FORMAT
                                                ? ' '
                                                : c));
        return limit(clean.toString().strip(), 1024);
    }

    private static String limit(String value, int max) {
        if (value.length() <= max) return value;
        int end = max - 1;
        if (Character.isHighSurrogate(value.charAt(end - 1))) end--;
        return value.substring(0, end) + "…";
    }

    public static List<SdkDiagnostic> bounded(Collection<SdkDiagnostic> values) {
        if (values == null) return List.of();
        return values.stream()
                .filter(Objects::nonNull)
                .filter(v -> !v.message.isBlank())
                .distinct()
                .limit(MAX_ENTRIES)
                .toList();
    }

    /**
     * Called only at an SDK invocation boundary. Session codes stay stable and causes stay private.
     */
    public static SessionException failure(String code, String stage, Throwable failure) {
        return failure(new SessionException(code), stage, failure);
    }

    public static SessionException failure(SessionException base, String stage, Throwable failure) {
        var details = new ArrayList<>(base.diagnostics());
        var seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        for (int depth = 0;
                failure != null && depth < 12 && seen.add(failure);
                depth++, failure = failure.getCause()) {
            if (failure instanceof SessionException known) {
                details.addAll(known.diagnostics());
                continue;
            }
            String type = failure.getClass().getSimpleName();
            details.add(
                    new SdkDiagnostic(
                            type.contains("EventLog") ? "EVENT_LOG" : stage,
                            type,
                            failure.getMessage()));
        }
        return base.withDiagnostics(details);
    }
}
