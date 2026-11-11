package org.fitconnect.integration.v3;

import dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveReport;
import dev.fitko.fitconnect.sdk.exceptions.FitConnectEventLogException;
import java.util.*;
import org.fitconnect.integration.contract.*;

/** SDK4 reports carry reasons even when no exception is thrown. */
final class ReceiveDiagnostics {
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
