package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.rest.model.event.problems.data.DataSchemaViolation;
import dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveReport;
import dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveStage;
import dev.fitko.fitconnect.sdk.exceptions.FitConnectEventLogException;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK4 reports carry reasons even when no exception is thrown. */
final class ReceiveDiagnostics {
    /** Keep one canonical schema warning; never suppress other DATA warnings or errors. */
    static List<ReceivedContent.Issue> issues(
            ReceiveReport report, List<ReceivedContent.Issue> schemaIssues) {
        var result = new ArrayList<>(schemaIssues);
        boolean schemaInvalid =
                schemaIssues.stream()
                        .anyMatch(
                                issue ->
                                        !issue.error()
                                                && issue.stage().equals("DATA_SCHEMA_INVALID"));
        for (var issue : report.issues()) {
            if (schemaInvalid
                    && !issue.isError()
                    && issue.stage() == ReceiveStage.DATA
                    && issue.problem() instanceof DataSchemaViolation) continue;
            result.add(new ReceivedContent.Issue(issue.stage().name(), issue.isError()));
        }
        return result;
    }

    static List<SdkDiagnostic> report(ReceiveReport report) {
        if (report == null) return List.of();
        return SdkDiagnostic.bounded(
                report.errors().stream()
                        .limit(SdkDiagnostic.MAX_ENTRIES)
                        .map(
                                issue -> {
                                    var problem = issue.problem();
                                    String message = issue.message();
                                    if (message == null || message.isBlank())
                                        message = problem == null ? "" : problem.getTitle();
                                    if (problem != null
                                            && problem.getDetail() != null
                                            && !problem.getDetail().isBlank()
                                            && (message == null
                                                    || !message.contains(problem.getDetail())))
                                        message =
                                                (message == null ? "" : message + ": ")
                                                        + problem.getDetail();
                                    return new SdkDiagnostic(
                                            issue.stage().name(),
                                            problem == null
                                                    ? "ReceiveIssue"
                                                    : problem.getClass().getSimpleName(),
                                            message);
                                })
                        .toList());
    }

    static SessionException failure(String code, String stage, Throwable failure) {
        var result = SdkDiagnostic.failure(code, stage, failure);
        var details = new ArrayList<SdkDiagnostic>();
        for (int depth = 0; failure != null && depth < 12; depth++, failure = failure.getCause())
            if (failure instanceof FitConnectEventLogException eventLog)
                details.addAll(report(eventLog.report()));
        details.addAll(result.diagnostics());
        return result.withDiagnostics(details);
    }
}
