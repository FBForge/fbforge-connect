package org.fitconnect.integration.host;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.fitconnect.integration.contract.*;
import org.junit.jupiter.api.Test;

class ReceiveIssueNormalizationTest {
    @Test
    void onlyTheProvenSchemaWarningIsDeduplicatedAndOtherWarningsOrErrorsSurvive()
            throws Exception {
        try (var registry = ReceiverTestSupport.registry()) {
            var loader = registry.dependencyClass(ApiVersion.V3).getClassLoader();
            var stage = loader.loadClass("dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveStage");
            var severity = loader.loadClass("dev.fitko.fitconnect.core.validation.api.Severity");
            var problem =
                    loader.loadClass("dev.fitko.fitconnect.rest.model.event.problems.Problem");
            var schemaProblem =
                    loader.loadClass(
                                    "dev.fitko.fitconnect.rest.model.event.problems.data.DataSchemaViolation")
                            .getConstructor(String.class)
                            .newInstance("synthetic schema mismatch");
            var otherProblem =
                    loader.loadClass(
                                    "dev.fitko.fitconnect.rest.model.event.problems.other.TechnicalError")
                            .getConstructor()
                            .newInstance();
            var constructor =
                    loader.loadClass("dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveIssue")
                            .getConstructor(severity, stage, String.class, String.class, problem);
            var report = loader.loadClass("dev.fitko.fitconnect.sdk.api.diagnostics.ReceiveReport");
            var normalize =
                    loader.loadClass("org.fitconnect.integration.v3.ReceiveDiagnostics")
                            .getDeclaredMethod("issues", report, List.class);
            normalize.setAccessible(true);
            var marker = new ReceivedContent.Issue("DATA_SCHEMA_INVALID", false);
            for (var scenario :
                    List.of(
                            new Object[] {"WARN", "DATA", schemaProblem, true, false},
                            new Object[] {"WARN", "DATA", schemaProblem, false, true},
                            new Object[] {"ERROR", "DATA", schemaProblem, true, true},
                            new Object[] {"WARN", "METADATA", schemaProblem, true, true},
                            new Object[] {"WARN", "DATA", otherProblem, true, true},
                            new Object[] {"WARN", "DATA", null, true, true})) {
                var issue =
                        constructor.newInstance(
                                severity.getField((String) scenario[0]).get(null),
                                stage.getField((String) scenario[1]).get(null),
                                "synthetic issue",
                                "review",
                                scenario[2]);
                var input = report.getConstructor(List.class).newInstance(List.of(issue));
                List<ReceivedContent.Issue> schema =
                        (boolean) scenario[3] ? List.of(marker) : List.of();
                var expected = new ArrayList<>(schema);
                if ((boolean) scenario[4])
                    expected.add(
                            new ReceivedContent.Issue(
                                    (String) scenario[1], scenario[0].equals("ERROR")));
                assertEquals(expected, normalize.invoke(null, input, schema));
            }
        }
    }
}
