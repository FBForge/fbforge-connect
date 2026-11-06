import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario, assignment, runFor } from './helpers/scenarios.js';
import {
  makeSeries,
  validateSeries,
  entryOutcome,
  attachRun,
  runOutcome,
} from '../frontend/src/integration/scenarios/series.ts';
import { addAttempt } from '../frontend/src/integration/scenarios/runs.ts';
import { scenarioSteps } from '../frontend/src/integration/scenarios/model.ts';
import * as library from '../frontend/src/integration/scenarios/storage.ts';

test('series enumerate each chosen dataset and API once and retain an independent definition', async () => {
  const s = scenario();
  s.variants.push({ id: crypto.randomUUID(), name: 'Zweiter Datensatz', values: [] });
  const value = await makeSeries(
    s,
    s.variants.map((v) => v.id),
    [{ ...assignment, apiVersion: 'v2' }, assignment],
    'TEST',
  );
  assert.equal(value.entries.length, 4);
  assert.equal(new Set(value.entries.map((e) => e.id)).size, 4);
  assert.deepEqual(
    value.entries.map((e) => `${e.variantId}/${e.assignment.apiVersion}`),
    s.variants
      .flatMap((v) => [`${v.id}/v2`, `${v.id}/v3`])
      .sort((a, b) => a.split('/')[1].localeCompare(b.split('/')[1])),
  );
  s.name = 'Später bearbeitet';
  s.pack.cases[0].request.data = '{}';
  assert.notEqual(value.definition.name, s.name);
  assert.notEqual(value.definition.pack.cases[0].request.data, '{}');
  assert.equal(entryOutcome(value, value.entries[0], []), 'not_started');
  assert.deepEqual(validateSeries(JSON.parse(JSON.stringify(value))), value);
});
test('series reject duplicate combinations, credentials, dangling variants, invalid contexts and excess rows', async () => {
  const s = scenario(),
    ids = s.variants.map((v) => v.id);
  await assert.rejects(makeSeries(s, [], [assignment], 'TEST'));
  await assert.rejects(makeSeries(s, ids, [], 'TEST'));
  await assert.rejects(makeSeries(s, [...ids, ...ids], [assignment], 'TEST'));
  await assert.rejects(makeSeries(s, ids, [assignment, assignment], 'TEST'));
  await assert.rejects(makeSeries(s, [crypto.randomUUID()], [assignment], 'TEST'));
  const valid = await makeSeries(s, ids, [assignment], 'TEST');
  for (const edit of [
    (d) => {
      d.clientSecret = 'never stored';
    },
    (d) => {
      d.entries[0].assignment.sessionId = crypto.randomUUID();
    },
    (d) => {
      d.entries[0].assignment.receiverProfileId = '../outside';
    },
    (d) => {
      d.entries[0].assignment.apiVersion = 'v4';
    },
    (d) => {
      d.entries[0].runId = '../outside';
    },
    (d) => {
      d.environment = 'OTHER';
    },
    (d) => {
      d.createdAt = 'invalid';
    },
    (d) => {
      d.entries = Array(33).fill(d.entries[0]);
    },
    (d) => {
      d.name = '';
    },
    (d) => {
      d.fingerprint = 'not a hash';
    },
  ]) {
    const input = structuredClone(valid);
    edit(input);
    assert.throws(() => validateSeries(input));
  }
  s.variants = Array.from({ length: 16 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Datensatz ${i}`,
    values: [],
  }));
  assert.equal(
    (
      await makeSeries(
        s,
        s.variants.map((v) => v.id),
        [assignment, { ...assignment, apiVersion: 'v2' }],
        'TEST',
      )
    ).entries.length,
    32,
  );
});
test('v3-only messages remain explicitly inapplicable under v2 and cannot gain a linked run', async () => {
  const s = scenario();
  s.sharedCase = true;
  const value = await makeSeries(
    s,
    [s.variants[0].id],
    [{ ...assignment, apiVersion: 'v2' }, assignment],
    'TEST',
  );
  assert.equal(entryOutcome(value, value.entries[0], []), 'inapplicable');
  value.entries[0].runId = crypto.randomUUID();
  assert.throws(() => validateSeries(value));
});
test('a series links only a matching run and failed linkage leaves the saved composition untouched', async () => {
  const s = scenario(),
    run = await runFor(s);
  const value = await makeSeries(s, [s.variants[0].id], [assignment], 'TEST');
  const entry = value.entries[0];
  const reversed = { ...run, assignment: Object.fromEntries(Object.entries(run.assignment).reverse()) };
  const linked = await attachRun(value, entry.id, reversed);
  assert.equal(value.entries[0].runId, null);
  assert.equal(linked.entries[0].runId, run.id);
  await assert.rejects(attachRun(linked, entry.id, run));
  for (const change of [
    { environment: 'STAGE' },
    { variantId: crypto.randomUUID() },
    { assignment: { ...assignment, receiverProfileId: crypto.randomUUID() } },
    { definition: { ...s, name: 'Changed' } },
  ])
    await assert.rejects(attachRun(value, entry.id, { ...run, ...change }));
  assert.equal(entry.runId, null);
  assert.equal(entryOutcome(linked, linked.entries[0], []), 'unavailable');
  const summary = {
    id: run.id,
    outcome: 'failed',
    fingerprint: run.fingerprint,
    scenarioId: s.id,
    environment: 'TEST',
    variantId: run.variantId,
    apiVersion: 'v3',
  };
  assert.equal(entryOutcome(linked, linked.entries[0], [summary]), 'failed');
  assert.equal(
    entryOutcome(linked, linked.entries[0], [{ ...summary, fingerprint: 'b'.repeat(64), outcome: 'passed' }]),
    'unavailable',
  );
});
test('aggregate outcomes distinguish incomplete, blocked, failed, cancelled, manual and fully proven runs', async () => {
  for (const status of ['failed', 'blocked', 'cancelled']) {
    const run = await runFor(scenario());
    addAttempt(run, { status, detail: 'Fiktives Ergebnis', recordId: null });
    assert.equal(runOutcome(run), status);
  }
  const run = await runFor(scenario());
  assert.equal(runOutcome(run), 'pending');
  while (run.cursor < scenarioSteps(run.definition).length)
    addAttempt(run, { status: 'passed', detail: 'Nachgewiesen', recordId: null });
  assert.equal(runOutcome(run), 'passed');
  run.attempts.at(-1).status = 'manual';
  assert.equal(runOutcome(run), 'manual');
  run.cursor = 0;
  assert.notEqual(runOutcome(run), 'passed');
});
test('series persistence uses bounded native actions, validates selectors and retains exact IDs', async () => {
  const s = scenario(),
    value = await makeSeries(s, [s.variants[0].id], [assignment], 'TEST'),
    actions = [];
  const row = { id: value.id, name: value.name, total: 1, environment: 'TEST' };
  const invoke = async (command, { request }) => {
    assert.equal(command, 'test_library');
    actions.push(request.action);
    return request.action === 'scenario_series_list'
      ? [row]
      : request.action === 'scenario_series_read'
        ? value
        : row;
  };
  assert.deepEqual(await library.listSeries(invoke), [row]);
  assert.deepEqual(await library.readSeries(invoke, value.id), value);
  await library.saveSeries(invoke, value);
  await library.removeSeries(invoke, value.id);
  assert.deepEqual(actions, [
    'scenario_series_list',
    'scenario_series_read',
    'scenario_series_save',
    'scenario_series_delete',
  ]);
  for (const rows of [
    null,
    [null],
    [row, row],
    [{ ...row, total: 33 }],
    [{ ...row, environment: 'OTHER' }],
    [{ ...row, id: '../outside' }],
    [{ ...row, name: null }],
  ])
    await assert.rejects(library.listSeries(async () => rows));
  for (const method of [library.readSeries, library.removeSeries])
    await assert.rejects(
      method(async () => {
        assert.fail('must not invoke');
      }, '../outside'),
    );
  await assert.rejects(library.readSeries(async () => ({ ...value, id: crypto.randomUUID() }), value.id));
  await assert.rejects(
    library.listRuns(async () => [
      {
        id: crypto.randomUUID(),
        name: s.name,
        scenarioId: s.id,
        environment: 'TEST',
        apiVersion: 'v3',
        variantId: s.variants[0].id,
        startedAt: new Date().toISOString(),
        cursor: 0,
        total: 1,
        reference: false,
        outcome: 'passed',
      },
    ]),
  );
});
