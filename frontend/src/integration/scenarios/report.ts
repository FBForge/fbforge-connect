import { scenarioSteps, latestChecks } from './model.ts';
import type { Run, Scenario } from './types.ts';
const labels: Record<string, string> = {
  passed: 'Erfolgreich',
  failed: 'Fehlgeschlagen',
  blocked: 'Blockiert',
  manual: 'Manuell bestätigt',
  cancelled: 'Abgebrochen',
  pending: 'Nicht ausgeführt',
};
export const comparisonLabels: Record<Scenario['comparison'], string> = {
  exact: 'Vollständiger Inhalt',
  'xml-structure': 'XML-Struktur, JSON vollständig',
  rules: 'Nur ausgewählte Fachdatenfelder',
  'field-exceptions': 'Vollständiger Inhalt mit Feldbedingungen',
};
export function checkScope(definition: Scenario, values = false) {
  return {
    comparison: definition.comparison,
    description: comparisonLabels[definition.comparison],
    attachments: 'Vollständiger Vergleich',
    rules: definition.rules.map((rule) => ({
      caseId: rule.caseId,
      scope: rule.scope,
      path: rule.path,
      operator: rule.operator,
      ...(values ? { value: rule.value } : {}),
    })),
  };
}
export function resultExport(run: Run, values = false) {
  return {
    format: 'fbforge-connect-testresult',
    version: 2,
    name: run.definition.name,
    fingerprint: run.fingerprint,
    variantId: run.variantId,
    environment: run.environment,
    apiVersion: run.assignment.apiVersion,
    startedAt: run.startedAt,
    checkScope: checkScope(run.definition, values),
    attempts: run.attempts.map((a) => ({
      ...a,
      differences: a.differences?.map((d) => (values ? d : { path: d.path })),
      differencesOmitted: a.differencesOmitted,
    })),
  };
}
export function ticketResult(run: Run) {
  const steps = scenarioSteps(run.definition);
  return [
    `${run.definition.name} · ${run.environment} · API ${run.assignment.apiVersion}`,
    `Beginn: ${run.startedAt}`,
    `Testversion: ${run.fingerprint}`,
    `Prüfumfang: ${comparisonLabels[run.definition.comparison]}. Anlagen vollständig.`,
    ...latestChecks(run).map(
      (c) =>
        `${labels[c.attempt?.status || 'pending']}: ${c.step.title}${c.attempt?.differences?.length ? ` (${c.attempt.differences.length} gespeicherte Abweichungen)` : ''}`,
    ),
    `${steps.length} Prüfschritte. Manuelle Bestätigungen sind keine automatischen Nachweise.`,
  ].join('\n');
}
