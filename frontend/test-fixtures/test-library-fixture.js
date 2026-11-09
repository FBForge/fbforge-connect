// Synthetic browser restart fixture. Actual DPAPI/security tests live in native-contracts.
import { scenarioSteps } from '../src/integration/scenarios/model.ts';
import { runOutcome } from '../src/integration/scenarios/series.ts';
const saved = new Map();
const flows = new Map(),
  runs = new Map();
function restoreFixture(name) {
  try {
    return new Map(JSON.parse(localStorage.getItem('fixture-protected-' + name) || '[]'));
  } catch {
    return new Map();
  }
}
const scenarios = restoreFixture('scenarios'),
  scenarioRuns = restoreFixture('scenario-runs');
const scenarioSeries = restoreFixture('scenario-series');
function persistFixture(store) {
  const name =
    store === scenarios ? 'scenarios' : store === scenarioRuns ? 'scenario-runs' : 'scenario-series';
  try {
    localStorage.setItem('fixture-protected-' + name, JSON.stringify([...store]));
  } catch {
    /* Browser preferences can be blocked. Native profile storage is independent. */
  }
}
export function testLibraryFixture(request) {
  if (request.action.startsWith('scenario_')) {
    const run = request.action.startsWith('scenario_run_'),
      series = request.action.startsWith('scenario_series_'),
      store = series ? scenarioSeries : run ? scenarioRuns : scenarios;
    const action = request.action.slice(
      series ? 'scenario_series_'.length : run ? 'scenario_run_'.length : 'scenario_'.length,
    );
    const summary = (value) =>
      series
        ? { id: value.id, name: value.name, environment: value.environment, total: value.entries.length }
        : run
          ? {
              id: value.id,
              name: value.definition.name,
              scenarioId: value.definition.id,
              environment: value.environment,
              apiVersion: value.assignment.apiVersion,
              variantId: value.variantId,
              startedAt: value.startedAt,
              cursor: value.cursor,
              total: scenarioSteps(value.definition).length,
              outcome: runOutcome(value),
              fingerprint: value.fingerprint,
              reference: value.reference,
            }
          : { id: value.id, name: value.name, mode: value.mode, caseCount: value.pack.cases.length };
    if (action === 'list') return [...store.values()].map(summary);
    if (action === 'read') return structuredClone(store.get(request.id));
    if (action === 'save') {
      if (series)
        for (const entry of request.document.entries) {
          if (!entry.runId) continue;
          const linked = scenarioRuns.get(entry.runId);
          if (
            !linked ||
            linked.fingerprint !== request.document.fingerprint ||
            linked.environment !== request.document.environment ||
            linked.variantId !== entry.variantId ||
            Object.keys(entry.assignment).some((key) => linked.assignment[key] !== entry.assignment[key])
          )
            throw 'scenario_invalid';
        }
      store.set(request.document.id, structuredClone(request.document));
      persistFixture(store);
      return summary(request.document);
    }
    if (action === 'delete') {
      if (run && store.get(request.id)?.reference) throw 'scenario_reference_protected';
      store.delete(request.id);
      persistFixture(store);
      return null;
    }
    throw 'scenario_invalid';
  }
  if (request.action.startsWith('run_')) {
    if (request.action === 'run_save') {
      runs.set(request.id, structuredClone(request.document));
      return null;
    }
    if (request.action === 'run_read') return structuredClone(runs.get(request.id));
    if (request.action === 'run_delete') {
      runs.delete(request.id);
      return null;
    }
    return [...runs].map(([id, value]) => ({
      id,
      name: value.flow.name,
      environment: value.run.environment,
      passed: value.run.results.length,
      total: value.flow.steps.length,
    }));
  }
  if (request.action.startsWith('flow_')) {
    const summary = (id, flow) => ({
      id,
      name: flow.name,
      stepCount: flow.steps.length,
      caseCount: flow.pack.cases.length,
    });
    if (request.action === 'flow_save') {
      flows.set(request.id, structuredClone(request.flow));
      return summary(request.id, request.flow);
    }
    if (request.action === 'flow_read') return structuredClone(flows.get(request.id));
    if (request.action === 'flow_delete') {
      flows.delete(request.id);
      return null;
    }
    return [...flows].map(([id, flow]) => summary(id, flow));
  }
  const summary = (id, pack) => ({
    id,
    name: pack.name,
    cases: pack.cases.map(({ id, name }) => ({ id, name })),
  });
  if (request.action === 'list') return [...saved].map(([id, pack]) => summary(id, pack));
  if (request.action === 'read') return structuredClone(saved.get(request.id));
  if (request.action === 'delete') {
    saved.delete(request.id);
    return null;
  }
  if (request.action === 'save') {
    if (saved.has(request.id)) throw 'test_library_conflict';
    saved.set(request.id, structuredClone(request.pack));
    return summary(request.id, request.pack);
  }
  throw 'invalid_input';
}
