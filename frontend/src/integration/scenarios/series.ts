import {
  clone,
  validateScenario,
  definitionFingerprint,
  uuid,
  invalid,
  latestChecks,
  title,
} from './model.ts';
import { requiresV3 } from './messages.ts';
import type { Scenario, Run, Assignment } from './types.ts';
import type { RunSummary } from './storage.ts';
export interface SeriesEntry {
  id: string;
  variantId: string;
  assignment: Assignment;
  runId: string | null;
}
export interface Series {
  format: 'fbforge-connect-test-series';
  version: 1;
  id: string;
  name: string;
  definition: Scenario;
  fingerprint: string;
  environment: Run['environment'];
  createdAt: string;
  entries: SeriesEntry[];
}
export function runOutcome(run: Run) {
  const checks = latestChecks(run);
  if (run.cursor === checks.length && checks.every((c) => c.attempt?.status === 'passed')) return 'passed';
  if (run.cursor === checks.length) return 'manual';
  const status = checks[run.cursor]?.attempt?.status;
  return status && ['failed', 'blocked', 'cancelled'].includes(status) ? status : 'pending';
}
export function validateSeries(input: unknown): Series {
  if (!input || typeof input !== 'object') invalid();
  const s = input as Series;
  if (
    Object.keys(s).sort().join() !==
      ['format', 'version', 'id', 'name', 'definition', 'fingerprint', 'environment', 'createdAt', 'entries']
        .sort()
        .join() ||
    s.format !== 'fbforge-connect-test-series' ||
    s.version !== 1 ||
    !uuid(s.id) ||
    !title(s.name) ||
    !['TEST', 'STAGE', 'PROD'].includes(s.environment) ||
    !Number.isFinite(Date.parse(s.createdAt)) ||
    !/^[a-f0-9]{64}$/.test(s.fingerprint) ||
    !Array.isArray(s.entries) ||
    !s.entries.length ||
    s.entries.length > 32
  )
    invalid();
  validateScenario(s.definition);
  const ids = new Set(),
    combinations = new Set(),
    runs = new Set();
  for (const e of s.entries) {
    if (
      !e ||
      Object.keys(e).sort().join() !== 'assignment,id,runId,variantId' ||
      !uuid(e.id) ||
      ids.has(e.id) ||
      !s.definition.variants.some((v) => v.id === e.variantId) ||
      !e.assignment ||
      Object.keys(e.assignment).sort().join() !==
        'apiVersion,receiverDestination,receiverProfileId,senderProfileId,sourceDestination' ||
      !['v2', 'v3'].includes(e.assignment.apiVersion) ||
      Object.entries(e.assignment).some(([k, v]) => k !== 'apiVersion' && v !== '' && !uuid(v)) ||
      (e.runId !== null && (!uuid(e.runId) || runs.has(e.runId)))
    )
      invalid();
    const key = `${e.variantId}/${e.assignment.apiVersion}`;
    if (combinations.has(key) || (e.runId && requiresV3(s.definition) && e.assignment.apiVersion === 'v2'))
      invalid();
    ids.add(e.id);
    combinations.add(key);
    if (e.runId) runs.add(e.runId);
  }
  if (new TextEncoder().encode(JSON.stringify(s)).length > 8 * 1024 * 1024 - 4096)
    throw Error('scenario_size_limit');
  return clone(s);
}
export async function makeSeries(
  definition: Scenario,
  variants: string[],
  assignments: Assignment[],
  environment: Run['environment'],
  name = `${definition.name.slice(0, 140)} · Testserie`,
) {
  if (!variants.length || !assignments.length || new Set(variants).size !== variants.length) invalid();
  return validateSeries({
    format: 'fbforge-connect-test-series',
    version: 1,
    id: crypto.randomUUID(),
    name,
    definition: clone(definition),
    fingerprint: await definitionFingerprint(definition),
    environment,
    createdAt: new Date().toISOString(),
    entries: assignments.flatMap((assignment) =>
      variants.map((variantId) => ({
        id: crypto.randomUUID(),
        variantId,
        assignment: clone(assignment),
        runId: null,
      })),
    ),
  });
}
export function entryOutcome(series: Series, entry: SeriesEntry, runs: RunSummary[]) {
  if (requiresV3(series.definition) && entry.assignment.apiVersion === 'v2') return 'inapplicable';
  if (!entry.runId) return 'not_started';
  const run = runs.find((r) => r.id === entry.runId);
  if (
    !run ||
    run.fingerprint !== series.fingerprint ||
    run.scenarioId !== series.definition.id ||
    run.environment !== series.environment ||
    run.variantId !== entry.variantId ||
    run.apiVersion !== entry.assignment.apiVersion
  )
    return 'unavailable';
  return run.outcome || 'unavailable';
}
export async function attachRun(series: Series, entryId: string, run: Run) {
  const e = series.entries.find((e) => e.id === entryId);
  if (
    !e ||
    e.runId ||
    run.environment !== series.environment ||
    run.fingerprint !== series.fingerprint ||
    run.variantId !== e.variantId ||
    (await definitionFingerprint(run.definition)) !== series.fingerprint ||
    (Object.keys(e.assignment) as (keyof Assignment)[]).some((k) => run.assignment[k] !== e.assignment[k])
  )
    invalid();
  const next = clone(series);
  next.entries.find((row) => row.id === entryId)!.runId = run.id;
  return validateSeries(next);
}
export const seriesLabels: Record<string, string> = {
  passed: 'Erfolgreich',
  failed: 'Abweichung',
  blocked: 'Blockiert',
  manual: 'Manuell abgeschlossen',
  cancelled: 'Warten beendet',
  pending: 'In Bearbeitung',
  not_started: 'Nicht ausgeführt',
  unavailable: 'Durchlauf nicht verfügbar',
  inapplicable: 'Nicht anwendbar (API v3 erforderlich)',
};
