import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  scenarioFrom,
  scenarioSteps,
  validateScenario,
  definitionFingerprint,
} from '../frontend/src/integration/scenarios/model.ts';
import {
  messageFields,
  replaceField,
  structuralXml,
  jsonFields,
} from '../frontend/src/integration/scenarios/fields.ts';
import { resolvePack } from '../frontend/src/integration/scenarios/data.ts';
import { checkMessage, validDate } from '../frontend/src/integration/scenarios/expectations.ts';
import {
  startRun,
  validateRun,
  addAttempt,
  canReference,
  compareRuns,
} from '../frontend/src/integration/scenarios/runs.ts';
import { createWaiter } from '../frontend/src/integration/scenarios/wait.ts';
import {
  candidates,
  receiptEvidence,
  verifyRecord,
} from '../frontend/src/integration/scenarios/verification.ts';
import { flowFromPack } from '../frontend/src/integration/test-flows.js';
import { bindReferences, referenceMessage } from '../frontend/src/integration/scenarios/references.ts';
import { processDialog } from '../frontend/src/integration/scenarios/templates.ts';
import { packFromCase } from '../frontend/src/integration/scenarios/capture.ts';
const pack = JSON.parse(
  await readFile(new URL('../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
const assignment = {
  apiVersion: 'v3',
  senderProfileId: '',
  receiverProfileId: '',
  sourceDestination: '',
  receiverDestination: '',
};
const scenario = () => scenarioFrom(pack);
test('observed request values drive replies without changing the expected request', async () => {
  const s = scenario(),
    id = s.pack.cases[0].id;
  s.variables = [
    {
      id: crypto.randomUUID(),
      label: 'Bezug',
      caseId: id,
      scope: 'reply',
      path: '/nachricht',
      kind: 'reference',
      value: '/antragstellendePerson/vorname',
    },
  ];
  const r = await startRun(s, s.variants[0].id, 'TEST', assignment),
    expected = r.pack.cases[0].request.data;
  const observed = JSON.stringify({
    ...JSON.parse(expected),
    antragstellendePerson: { vorname: 'Tatsächlich beobachtet', nachname: 'Musterfrau' },
  });
  bindReferences(r, id, observed);
  assert.equal(r.pack.cases[0].request.data, expected);
  assert.equal(JSON.parse(r.pack.cases[0].reply.data).nachricht, 'Tatsächlich beobachtet');
  assert.equal(
    JSON.parse(referenceMessage(r, id).data).antragstellendePerson.vorname,
    'Tatsächlich beobachtet',
  );
  validateRun(r);
});
test('process follow-ups share a case but cannot reuse a previous submission as new evidence', async () => {
  const s = processDialog(pack),
    run = await startRun(s, s.variants[0].id, 'TEST', assignment),
    steps = scenarioSteps(s);
  assert.equal(s.sharedCase, true);
  assert.equal(s.pack.cases.length, 2);
  await assert.rejects(startRun(s, s.variants[0].id, 'TEST', { ...assignment, apiVersion: 'v2' }));
  const caseId = crypto.randomUUID(),
    submissionId = crypto.randomUUID();
  run.bindings = [{ testCaseId: s.pack.cases[0].id, caseId, submissionId, replyId: null }];
  const step = steps.find((v) => v.caseId === 'nachreichung' && v.type === 'send'),
    record = {
      recordId: crypto.randomUUID(),
      caseId,
      submissionId,
      replyId: null,
      destinationId: crypto.randomUUID(),
      kind: 'submission',
      direction: 'sent',
      status: 'sent',
      createdAt: new Date().toISOString(),
      title: 'Test',
      warnings: [],
    };
  assert.equal(candidates([record], run, step).length, 0);
  assert.equal(candidates([{ ...record, submissionId: crypto.randomUUID() }], run, step).length, 1);
  assert.equal(
    candidates([{ ...record, submissionId: crypto.randomUUID(), caseId: crypto.randomUUID() }], run, step)
      .length,
    0,
  );
});
test('capture reuses released files and never copies transport metadata or old message IDs', async () => {
  const record = {
    recordId: crypto.randomUUID(),
    caseId: crypto.randomUUID(),
    kind: 'submission',
    direction: 'received',
    status: 'verified',
    available: true,
    warnings: [],
  };
  const contentId = crypto.randomUUID(),
    data = '{"test":"fiktiv"}',
    bytes = new TextEncoder().encode(data),
    session = { apiVersion: 'v3', sessionId: crypto.randomUUID(), environment: 'TEST', connected: true };
  const invoke = async (command, args) => ({
    apiVersion: session.apiVersion,
    sessionId: session.sessionId,
    environment: session.environment,
    data:
      args.operation === 'parts'
        ? {
            recordId: record.recordId,
            offset: 0,
            total: 1,
            parts: [
              {
                contentId,
                kind: 'data',
                fileName: 'data.json',
                mimeType: 'application/json',
                totalBytes: bytes.length,
              },
            ],
          }
        : {
            recordId: record.recordId,
            contentId,
            byteOffset: 0,
            totalBytes: bytes.length,
            chunk: btoa(data),
            complete: true,
          },
  });
  const choices = {
    name: 'Beispiel',
    serviceIdentifier: 'urn:test:leistung',
    schemaUri: 'urn:test:schema',
    replySchemaUri: '',
    receipt: 'accept',
  };
  const captured = await packFromCase(invoke, session, record, null, choices);
  assert.equal(captured.cases[0].request.data, data);
  assert.ok(!JSON.stringify(captured).includes(record.caseId));
  assert.ok(!JSON.stringify(captured).includes(session.sessionId));
  await assert.rejects(
    packFromCase(invoke, session, { ...record, warnings: ['MALWARE_ATTACHMENT_BLOCKED'] }, null, choices),
  );
});
test('legacy test packs and flows migrate without changing messages or weakening comparisons', () => {
  const s = scenario(),
    flow = scenarioFrom(flowFromPack(pack));
  assert.deepEqual(s.pack, pack);
  assert.deepEqual(flow.pack, pack);
  assert.equal(s.comparison, 'exact');
  assert.equal(scenarioSteps(s).length, 10);
  s.mode = 'sender';
  assert.deepEqual(
    scenarioSteps(s)
      .slice(0, 3)
      .map((v) => [v.type, v.external]),
    [
      ['send', false],
      ['receipt', true],
      ['check_reply', false],
    ],
  );
  s.mode = 'receiver';
  assert.equal(
    scenarioSteps(s).some((v) => v.type === 'send'),
    false,
  );
  assert.throws(() => validateScenario({ ...s, clientSecret: 'forbidden' }));
  assert.throws(() => validateScenario({ ...s, version: 99 }));
  assert.deepEqual(pack.cases[0].request.data, s.pack.cases[0].request.data);
});
test('field editing preserves large JSON numbers, escaping, types and rejects ambiguous documents', () => {
  const source = '{"large":9007199254740993,"name":"a","bool":false,"a/b":{"~x":1}}';
  const result = replaceField(source, 'application/json', '/name', JSON.stringify('"<&'));
  assert.ok(result.includes('9007199254740993'));
  assert.equal(JSON.parse(result).name, '"<&');
  assert.ok(jsonFields(source).some((f) => f.path === '/a~1b/~0x'));
  assert.throws(() => jsonFields('{"x":1,"x":2}'));
  assert.throws(() => replaceField(source, 'application/json', '/missing', '1'));
});
test('XML structure keeps mixed-content order, significant whitespace and attribute namespaces', () => {
  assert.throws(() => structuralXml('<r __proto__="hidden"/>'));
  assert.equal(
    structuralXml('<a:r xmlns:a="urn:t" x="1" y="2">a<a:c/>b</a:r>'),
    structuralXml('<b:r xmlns:b="urn:t" y="2" x="1">a<b:c/>b</b:r>'),
  );
  assert.notEqual(structuralXml('<r>a<c/>b</r>'), structuralXml('<r>ab<c/></r>'));
  assert.notEqual(structuralXml('<r> a </r>'), structuralXml('<r>a</r>'));
  assert.notEqual(
    structuralXml('<r xmlns="urn:t" x="1"/>'),
    structuralXml('<r xmlns="urn:t" xmlns:a="urn:t" a:x="1"/>'),
  );
  const source = '<r><name>A</name><value>9007199254740993</value></r>',
    field = messageFields(source, 'application/xml').find((f) => f.label === 'name');
  const changed = replaceField(source, 'application/xml', field.path, JSON.stringify('< & "'));
  assert.ok(changed.includes('9007199254740993'));
  assert.ok(changed.includes('&lt; &amp; &quot;'));
  assert.throws(() => structuralXml('<!DOCTYPE r [<!ENTITY x "y">]><r>&x;</r>'));
});
test('typed variables are resolved once, variants retain source data and request references', async () => {
  const s = scenario(),
    id = crypto.randomUUID();
  s.variables.push({
    id,
    label: 'Vorname',
    caseId: s.pack.cases[0].id,
    scope: 'request',
    path: '/antragstellendePerson/vorname',
    kind: 'uuid',
    value: '',
  });
  const r = await startRun(s, s.variants[0].id, 'TEST', assignment);
  assert.deepEqual(validateRun(r).pack, r.pack);
  assert.notEqual(r.pack.cases[0].request.data, s.pack.cases[0].request.data);
  s.variables[0].kind = 'text';
  s.variables[0].value = 'Standard';
  s.variants[0].values = [{ variableId: id, value: 'Variante' }];
  assert.equal(
    JSON.parse(resolvePack(s, s.variants[0].id).cases[0].request.data).antragstellendePerson.vorname,
    'Variante',
  );
  s.variables.push({
    id: crypto.randomUUID(),
    label: 'Referenz',
    caseId: s.pack.cases[0].id,
    scope: 'reply',
    path: '/nachricht',
    kind: 'reference',
    value: '/antragstellendePerson/vorname',
  });
  assert.equal(JSON.parse(resolvePack(s, s.variants[0].id).cases[0].reply.data).nachricht, 'Variante');
  assert.equal(pack.cases[0].request.data, scenario().pack.cases[0].request.data);
});
test('selected expectations never pass a wrong type, missing check or different large integer', () => {
  const s = scenario(),
    expected = { ...s.pack.cases[0].request, data: '{"n":9007199254740993,"when":"2026-11-06"}' };
  s.comparison = 'rules';
  s.rules = [
    {
      id: crypto.randomUUID(),
      caseId: s.pack.cases[0].id,
      scope: 'request',
      path: '/n',
      operator: 'equals',
      value: '9007199254740993',
    },
  ];
  const check = (actual) => checkMessage(actual, expected, s, s.pack.cases[0].id, 'request', expected);
  assert.deepEqual(check('{"n":9007199254740993,"time":"changed"}'), []);
  assert.ok(check('{"n":9007199254740992}').length);
  assert.ok(check('{"n":"9007199254740993"}').length);
  assert.ok(checkMessage('{}', expected, s, s.pack.cases[0].id, 'reply', expected).length);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-11-06T23:00:00-02:00'), true);
});
test('failed attempts survive retries, only complete observed runs become references', async () => {
  const s = scenario(),
    run = await startRun(s, s.variants[0].id, 'TEST', assignment);
  addAttempt(run, { status: 'failed', detail: 'wrong content', recordId: null });
  assert.equal(run.cursor, 0);
  addAttempt(run, { status: 'passed', detail: 'checked', recordId: null });
  assert.equal(run.cursor, 1);
  assert.equal(run.attempts.length, 2);
  assert.equal(canReference(run), false);
  while (run.cursor < scenarioSteps(s).length)
    addAttempt(run, { status: 'passed', detail: 'checked', recordId: null });
  assert.equal(canReference(run), true);
  run.reference = true;
  validateRun(run);
  const changed = structuredClone(run);
  changed.attempts.at(-1).status = 'manual';
  assert.throws(() => validateRun(changed));
  const before = await definitionFingerprint(s);
  s.name = 'Changed';
  assert.notEqual(await definitionFingerprint(s), before);
  assert.equal(compareRuns(changed, run).changedDefinition, false);
  changed.assignment.receiverDestination = crypto.randomUUID();
  assert.equal(compareRuns(changed, run).changedTarget, true);
  assert.ok(compareRuns(changed, run).rows.every((r) => !r.regression));
});
test('bounded observer avoids overlap, stops after cancellation and ignores a late response', async () => {
  let finish,
    calls = 0,
    now = 0;
  const timers = [];
  const states = [];
  const waiter = createWaiter({
    check: () => {
      calls++;
      return new Promise((resolve) => (finish = resolve));
    },
    changed: (s) => states.push(s),
    now: () => now,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    unschedule: () => {},
  });
  waiter.start();
  waiter.start();
  assert.equal(calls, 1);
  waiter.stop();
  finish(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(waiter.active, false);
  assert.equal(timers.length, 0);
  assert.equal(states.at(-1).message, 'Warten beendet');
  const bounded = createWaiter({
    check: async () => false,
    now: () => now,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    unschedule: () => {},
  });
  bounded.start();
  await new Promise((resolve) => setImmediate(resolve));
  now = 300001;
  timers.at(-1).fn();
  assert.equal(bounded.active, false);
});
test('wrong case, stale record, direction and destination cannot satisfy a step', async () => {
  const s = scenario(),
    run = await startRun(s, s.variants[0].id, 'TEST', assignment),
    step = scenarioSteps(s)[0],
    id = crypto.randomUUID();
  const record = {
    recordId: id,
    caseId: crypto.randomUUID(),
    submissionId: crypto.randomUUID(),
    replyId: null,
    destinationId: crypto.randomUUID(),
    kind: 'submission',
    direction: 'sent',
    status: 'sent',
    createdAt: new Date().toISOString(),
    title: 'Test',
    warnings: [],
  };
  assert.equal(candidates([record], run, step).length, 1);
  assert.equal(candidates([{ ...record, direction: 'received' }], run, step).length, 0);
  assert.equal(candidates([{ ...record, createdAt: '2000-01-01T00:00:00Z' }], run, step).length, 0);
  run.bindings = [
    {
      testCaseId: step.caseId,
      caseId: crypto.randomUUID(),
      submissionId: record.submissionId,
      replyId: null,
    },
  ];
  assert.equal(candidates([record], run, step).length, 0);
});
test('receipt verification does not treat a local copy as remote acceptance', async () => {
  const s = scenario(),
    run = await startRun(s, s.variants[0].id, 'TEST', assignment);
  let calls = 0;
  const result = await receiptEvidence(
    async () => {
      calls++;
      throw Error();
    },
    { apiVersion: 'v3', sessionId: crypto.randomUUID(), environment: 'TEST', connected: true },
    run,
    scenarioSteps(s).find((v) => v.type === 'receipt'),
    () => true,
  );
  assert.equal(result.passed, false);
  assert.equal(calls, 0);
  assert.equal(typeof verifyRecord, 'function');
});
test('signed receipt evidence must match subject, age and expected problem and always release its handle', async () => {
  const s = scenario();
  s.pack.cases[0].receipt = 'reject';
  s.expectedProblem = 'https://schema.fitko.de/fit-connect/events/problems/technical-error';
  const run = await startRun(s, s.variants[0].id, 'TEST', assignment),
    step = scenarioSteps(s).find((v) => v.type === 'receipt'),
    session = { apiVersion: 'v3', sessionId: crypto.randomUUID(), environment: 'TEST', connected: true },
    caseId = crypto.randomUUID(),
    submissionId = crypto.randomUUID(),
    logId = crypto.randomUUID(),
    eventType = 'https://schema.fitko.de/fit-connect/events/reject-submission';
  run.bindings = [{ testCaseId: step.caseId, caseId, submissionId, replyId: null }];
  let subjectId = submissionId,
    issuedAt = run.startedAt,
    problem = s.expectedProblem,
    discarded = 0;
  const invoke = async (command, args) => {
    const claims = JSON.stringify({ events: { [eventType]: { problems: [{ type: problem }] } } });
    const data =
      command === 'load_case_event_log'
        ? { logId, caseId, scope: 'case', total: 1, warnings: ['CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED'] }
        : command === 'list_case_event_log'
          ? {
              logId,
              offset: 0,
              total: 1,
              events: [
                {
                  eventId: logId,
                  eventType,
                  issuer: caseId,
                  issuedAt,
                  headerBytes: 2,
                  claimsBytes: Buffer.byteLength(claims),
                  subjectType: 'submission',
                  subjectId,
                },
              ],
            }
          : command === 'read_event_log'
            ? {
                logId,
                eventId: logId,
                part: 'claims',
                byteOffset: 0,
                totalBytes: Buffer.byteLength(claims),
                chunk: btoa(claims),
                complete: true,
              }
            : (discarded++, { logId });
    assert.ok(
      ['load_case_event_log', 'list_case_event_log', 'read_event_log', 'discard_event_log'].includes(command),
    );
    assert.equal(args.sessionId, session.sessionId);
    return {
      apiVersion: session.apiVersion,
      sessionId: session.sessionId,
      environment: session.environment,
      data,
    };
  };
  const verify = () => receiptEvidence(invoke, session, run, step, () => true);
  assert.equal((await verify()).passed, true);
  problem = 'urn:other';
  assert.equal((await verify()).passed, false);
  subjectId = crypto.randomUUID();
  assert.equal((await verify()).passed, false);
  subjectId = submissionId;
  issuedAt = '2000-01-01T00:00:00Z';
  assert.equal((await verify()).passed, false);
  await assert.rejects(
    receiptEvidence(invoke, session, run, step, () => false),
    /content_cancelled/,
  );
  assert.equal(discarded, 5);
});
