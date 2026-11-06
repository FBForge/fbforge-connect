// Synthetic memory-only storage. Actual DPAPI/restart tests live in native-contracts.
const saved = new Map();
const flows = new Map(),
  runs = new Map();
const scenarios = new Map(),
  scenarioRuns = new Map();
export function testLibraryFixture(request) {
  if (request.action.startsWith('scenario_')) {
    const run = request.action.startsWith('scenario_run_'),
      store = run ? scenarioRuns : scenarios;
    const action = request.action.slice(run ? 'scenario_run_'.length : 'scenario_'.length);
    const summary = (value) =>
      run
        ? {
            id: value.id,
            name: value.definition.name,
            scenarioId: value.definition.id,
            environment: value.environment,
            apiVersion: value.assignment.apiVersion,
            variantId: value.variantId,
            startedAt: value.startedAt,
            cursor: value.cursor,
            total: value.definition.pack.cases.reduce(
              (n, c) =>
                n +
                (value.definition.mode === 'sender' ? 1 : value.definition.mode === 'receiver' ? 2 : 3) +
                (c.receipt === 'none' ? 0 : 1) +
                (c.reply ? (value.definition.mode === 'sender' ? 1 : 2) : 0),
              0,
            ),
            reference: value.reference,
          }
        : { id: value.id, name: value.name, mode: value.mode, caseCount: value.pack.cases.length };
    if (action === 'list') return [...store.values()].map(summary);
    if (action === 'read') return structuredClone(store.get(request.id));
    if (action === 'save') {
      store.set(request.document.id, structuredClone(request.document));
      return summary(request.document);
    }
    if (action === 'delete') {
      if (run && store.get(request.id)?.reference) throw 'scenario_reference_protected';
      store.delete(request.id);
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
