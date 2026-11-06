import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as library from '../frontend/src/integration/scenarios/storage.ts';
import { scenarioFrom } from '../frontend/src/integration/scenarios/model.ts';
import { startRun } from '../frontend/src/integration/scenarios/runs.ts';
import { variableValue } from '../frontend/src/integration/scenarios/data.ts';
const pack = JSON.parse(
  await readFile(new URL('../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
const definition = scenarioFrom(pack);
const run = await startRun(definition, definition.variants[0].id, 'TEST', {
  apiVersion: 'v3',
  senderProfileId: '',
  receiverProfileId: '',
  sourceDestination: '',
  receiverDestination: '',
});
const scenarioRow = {
  id: definition.id,
  name: definition.name,
  mode: definition.mode,
  caseCount: pack.cases.length,
};
const runRow = {
  id: run.id,
  name: definition.name,
  scenarioId: definition.id,
  environment: run.environment,
  apiVersion: run.assignment.apiVersion,
  variantId: run.variantId,
  startedAt: run.startedAt,
  cursor: 0,
  total: 10,
  reference: false,
};
test('scenario library uses only explicit native actions and preserves IDs on round trips', async () => {
  const actions = [];
  const invoke = async (command, { request }) => {
    assert.equal(command, 'test_library');
    actions.push(request.action);
    return (
      {
        scenario_list: [scenarioRow],
        scenario_read: definition,
        scenario_run_list: [runRow],
        scenario_run_read: run,
      }[request.action] ?? {}
    );
  };
  assert.deepEqual(await library.listScenarios(invoke), [scenarioRow]);
  assert.deepEqual(await library.readScenario(invoke, definition.id), definition);
  await library.saveScenario(invoke, definition);
  await library.removeScenario(invoke, definition.id);
  assert.deepEqual(await library.listRuns(invoke), [runRow]);
  assert.deepEqual(await library.readRun(invoke, run.id), run);
  await library.saveRun(invoke, run);
  await library.removeRun(invoke, run.id);
  assert.deepEqual(actions, [
    'scenario_list',
    'scenario_read',
    'scenario_save',
    'scenario_delete',
    'scenario_run_list',
    'scenario_run_read',
    'scenario_run_save',
    'scenario_run_delete',
  ]);
});
test('native collection responses reject identity confusion, duplicate rows and invalid progress', async () => {
  for (const rows of [
    null,
    [null],
    [scenarioRow, scenarioRow],
    [{ ...scenarioRow, id: '../path' }],
    [{ ...scenarioRow, name: null }],
    [{ ...scenarioRow, mode: 'unknown' }],
    [{ ...scenarioRow, caseCount: 0 }],
    [{ ...scenarioRow, caseCount: 1.5 }],
    [{ ...scenarioRow, caseCount: 21 }],
    Array(33).fill(scenarioRow),
  ])
    await assert.rejects(library.listScenarios(async () => rows));
  for (const rows of [
    null,
    [null],
    [runRow, runRow],
    [{ ...runRow, scenarioId: 'foreign' }],
    [{ ...runRow, environment: 'other' }],
    [{ ...runRow, apiVersion: 'v9' }],
    [{ ...runRow, variantId: null }],
    [{ ...runRow, startedAt: 'invalid' }],
    [{ ...runRow, cursor: -1 }],
    [{ ...runRow, cursor: 11 }],
    [{ ...runRow, total: 153 }],
    [{ ...runRow, reference: 'true' }],
    Array(33).fill(runRow),
  ])
    await assert.rejects(library.listRuns(async () => rows));
  await assert.rejects(
    library.readScenario(async () => ({ ...definition, id: crypto.randomUUID() }), definition.id),
  );
  await assert.rejects(library.readRun(async () => ({ ...run, id: crypto.randomUUID() }), run.id));
});
test('invalid selectors and credential-bearing documents never reach native storage', async () => {
  const invoke = async () => {
    throw Error('must not invoke');
  };
  for (const method of [library.readScenario, library.removeScenario, library.readRun, library.removeRun])
    await assert.rejects(method(invoke, '../outside'), /scenario_invalid/);
  await assert.rejects(
    library.saveScenario(invoke, { ...definition, clientSecret: 'forbidden' }),
    /scenario_invalid/,
  );
  await assert.rejects(
    library.saveRun(invoke, { ...run, sessionId: crypto.randomUUID() }),
    /scenario_invalid/,
  );
});
test('storage failures retain actionable feedback for capacity, unsupported protection and references', () => {
  const cases = [
    ['vault_limit', /Sammlung ist voll/],
    ['scenario_size_limit', /umfangreich/],
    ['scenario_reference_protected', /Referenz/],
    ['vault_unsupported', /Betriebssystem/],
    ['scenario_context_changed', /Profil, API oder Umgebung/],
    ['scenario_invalid', /unvollständig oder ungültig/],
    ['unexpected', /geöffneten Daten bleiben erhalten/],
  ];
  for (const [code, expected] of cases) {
    assert.match(library.scenarioError(code), expected);
    assert.match(library.scenarioError(Error(code)), expected);
  }
  assert.match(library.scenarioError(null), /geöffneten Daten bleiben erhalten/);
});
test('typed data generation rejects ambiguous numbers, booleans and invalid calendar dates', () => {
  const variable = { kind: 'text' };
  const now = '2026-11-06T12:00:00Z';
  assert.equal(variableValue(variable, '<"&', now), JSON.stringify('<"&'));
  assert.equal(variableValue({ kind: 'number' }, '9007199254740993', now), '9007199254740993');
  for (const value of ['01', 'NaN', ' 2', '1;2'])
    assert.throws(() => variableValue({ kind: 'number' }, value, now));
  for (const value of ['true', 'false']) assert.equal(variableValue({ kind: 'boolean' }, value, now), value);
  assert.throws(() => variableValue({ kind: 'boolean' }, 'yes', now));
  assert.equal(variableValue({ kind: 'date' }, '', now), '"2026-11-06"');
  assert.throws(() => variableValue({ kind: 'date' }, '2026-02-30', now));
  assert.equal(variableValue({ kind: 'reference' }, '/id', now), '');
});
