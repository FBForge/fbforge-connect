import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplies, scenario, assignment, runFor, pack } from './helpers/scenarios.js';
import {
  validateScenario,
  scenarioSteps,
  definitionFingerprint,
} from '../frontend/src/integration/scenarios/model.ts';
import { startRun, validateRun } from '../frontend/src/integration/scenarios/runs.ts';
import {
  expectedMessage,
  messageOptions,
  messageFor,
  requiresV3,
} from '../frontend/src/integration/scenarios/messages.ts';
import { candidates } from '../frontend/src/integration/scenarios/verification.ts';
import { bindReferences } from '../frontend/src/integration/scenarios/references.ts';
import { synchronizeReplyOffers } from '../frontend/src/integration/scenarios/response-offers.ts';
import { processDialog, receiptExample } from '../frontend/src/integration/scenarios/templates.ts';

test('additional replies get stable individual steps and resolve the selected message in all modes', async () => {
  for (const mode of ['both', 'sender', 'receiver']) {
    const s = withReplies();
    s.mode = mode;
    const run = await runFor(s),
      steps = scenarioSteps(s),
      item = s.pack.cases[0];
    assert.equal(steps.filter((step) => step.type === 'check_reply').length, 3);
    assert.equal(steps.filter((step) => step.type === 'reply').length, mode === 'sender' ? 0 : 3);
    assert.equal(new Set(steps.map((step) => step.id)).size, steps.length);
    assert.ok(steps.some((step) => step.id === `${item.id}:check_reply`));
    for (const response of s.followups) {
      const step = steps.find((step) => step.type === 'check_reply' && step.followupId === response.id);
      assert.deepEqual(expectedMessage(run, step), response.message);
      assert.equal(step.external, mode === 'receiver');
      assert.equal(messageFor(s.pack, s.followups, item.id, `reply:${response.id}`), response.message);
    }
    assert.equal(messageOptions(s, item.id).length, 4);
    assert.equal(messageFor(s.pack, s.followups, 'foreign', 'reply'), null);
    assert.equal(messageFor(s.pack, s.followups, item.id, 'reply:foreign'), null);
    assert.deepEqual(validateRun(JSON.parse(JSON.stringify(run))), run);
  }
});
test('multiple business replies work under v2 while process messages still require v3', async () => {
  const s = withReplies();
  assert.equal(requiresV3(s), false);
  await startRun(s, s.variants[0].id, 'TEST', { ...assignment, apiVersion: 'v2' });
  s.followups[0].message.processMessage = { processModelId: 'urn:test:process', messageId: 'status' };
  synchronizeReplyOffers(s);
  assert.equal(requiresV3(s), true);
  assert.ok(s.pack.cases[0].request.replyOffer.processMessages.some((p) => p.messageId === 'status'));
  s.followups[1].message.processMessage = { messageId: 'status', processModelId: 'urn:test:process' };
  synchronizeReplyOffers(s);
  assert.equal(s.pack.cases[0].request.replyOffer.processMessages.length, 1);
  await assert.rejects(startRun(s, s.variants[0].id, 'TEST', { ...assignment, apiVersion: 'v2' }));
  const run = await runFor(s);
  assert.equal(run.followups[0].message.processMessage.messageId, 'status');
  s.followups[0].message.processMessage = null;
  s.followups[1].message.processMessage = null;
  synchronizeReplyOffers(s);
  assert.deepEqual(s.pack.cases[0].request.replyOffer.processMessages, []);
});
test('reply evidence is bound to its own message, one case and a distinct reply ID', async () => {
  const s = withReplies(),
    run = await runFor(s),
    item = s.pack.cases[0],
    steps = scenarioSteps(s);
  const caseId = crypto.randomUUID(),
    replyId = crypto.randomUUID();
  run.bindings = [{ testCaseId: item.id, caseId, submissionId: crypto.randomUUID(), replyId }];
  run.replyBindings = [{ messageId: `first:${item.id}`, replyId }];
  const record = {
    recordId: crypto.randomUUID(),
    kind: 'reply',
    direction: 'received',
    status: 'verified',
    available: true,
    createdAt: new Date().toISOString(),
    caseId,
    submissionId: null,
    replyId,
    destinationId: null,
  };
  const first = steps.find((step) => step.type === 'check_reply' && !step.followupId),
    later = steps.find((step) => step.type === 'check_reply' && step.followupId);
  assert.equal(candidates([record], run, first).length, 1);
  assert.equal(candidates([record], run, later).length, 0);
  const next = { ...record, replyId: crypto.randomUUID() };
  assert.equal(candidates([next], run, later).length, 1);
  assert.equal(candidates([{ ...next, caseId: crypto.randomUUID() }], run, later).length, 0);
  assert.equal(candidates([{ ...next, caseId: null }], run, later).length, 0);
  assert.equal(candidates([{ ...next, replyId: null }], run, later).length, 0);
  run.replyBindings.push({ messageId: later.followupId, replyId: next.replyId });
  assert.equal(candidates([{ ...next, replyId: crypto.randomUUID() }], run, later).length, 0);
  assert.equal(candidates([next], run, later).length, 1);
  validateRun(run);
  run.replyBindings[1].replyId = replyId;
  assert.throws(() => validateRun(run));
});
test('observed request references and dataset substitutions reach every selected response independently', async () => {
  const s = withReplies(),
    item = s.pack.cases[0];
  for (const scope of ['reply', ...s.followups.map((f) => `reply:${f.id}`)])
    for (const path of ['/status', '/nachricht'])
      s.variables.push({
        id: crypto.randomUUID(),
        label: 'Bezug',
        caseId: item.id,
        scope,
        path,
        kind: 'reference',
        value: '/antragstellendePerson/vorname',
      });
  const run = await runFor(s);
  bindReferences(run, item.id, JSON.stringify({ antragstellendePerson: { vorname: 'Beobachteter Wert' } }));
  for (const message of [run.pack.cases[0].reply, ...run.followups.map((f) => f.message)])
    assert.deepEqual(JSON.parse(message.data), {
      status: 'Beobachteter Wert',
      nachricht: 'Beobachteter Wert',
    });
  assert.equal(run.references.length, 1);
  validateRun(run);
  const before = await definitionFingerprint(s);
  s.variables = [];
  s.variables.push({
    id: crypto.randomUUID(),
    label: 'Antworttext',
    caseId: item.id,
    scope: `reply:${s.followups[1].id}`,
    path: '/nachricht',
    kind: 'text',
    value: 'Variabler Text',
  });
  const generated = await runFor(s);
  assert.equal(JSON.parse(generated.followups[1].message.data).nachricht, 'Variabler Text');
  assert.notEqual(JSON.parse(generated.followups[0].message.data).nachricht, 'Variabler Text');
  assert.notEqual(await definitionFingerprint(s), before);
});
test('additional message imports reject unknown keys, duplicate IDs, missing cases and incompatible offers', async () => {
  const valid = withReplies();
  for (const edit of [
    (s) => {
      s.followups[0].id = '../outside';
    },
    (s) => {
      s.followups[1].id = s.followups[0].id;
    },
    (s) => {
      s.followups[0].caseId = 'foreign';
    },
    (s) => {
      s.followups[0].clientSecret = 'forbidden';
    },
    (s) => {
      s.followups[0].message.schemaUri = 'urn:other';
    },
    (s) => {
      s.followups[0].message.processMessage = { processModelId: 'urn:other', messageId: 'not offered' };
    },
    (s) => {
      s.followups = Array(17).fill(s.followups[0]);
    },
  ]) {
    const value = structuredClone(valid);
    edit(value);
    assert.throws(() => validateScenario(value));
  }
  const run = await runFor(valid);
  run.followups[1] = structuredClone(run.followups[0]);
  assert.throws(() => validateRun(run));
});
test('the dialogue template covers status, further documents, continuation and completion in one case', () => {
  const s = processDialog(pack);
  validateScenario(s);
  assert.equal(s.sharedCase, true);
  assert.equal(s.followups.length, 1);
  assert.equal(s.pack.cases[0].reply.processMessage.messageId, 'bearbeitungsstand');
  assert.equal(s.followups[0].message.processMessage.messageId, 'nachforderung');
  assert.equal(s.pack.cases[1].request.processMessage.messageId, 'nachreichung');
  assert.equal(s.pack.cases[1].reply.processMessage.messageId, 'abschluss');
  const steps = scenarioSteps(s);
  assert.ok(
    steps.findIndex((step) => step.followupId) <
      steps.findIndex((step) => step.caseId === s.pack.cases[1].id),
  );
  for (const kind of ['accept', 'reject', 'reply']) {
    const example = receiptExample(pack, kind);
    assert.equal(example.cases.length, 1);
    assert.equal(!!example.cases[0].reply, kind === 'reply');
  }
});
test('older version-2 scenarios and runs preserve their exact optional-field-free shape', async () => {
  const s = scenario(),
    run = await runFor(s);
  assert.equal(Object.hasOwn(validateScenario(s), 'followups'), false);
  assert.equal(Object.hasOwn(validateRun(run), 'followups'), false);
  assert.equal(Object.hasOwn(validateRun(run), 'replyBindings'), false);
  assert.deepEqual(validateRun(JSON.parse(JSON.stringify(run))), run);
});
