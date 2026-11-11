import test from 'node:test';
import assert from 'node:assert/strict';
import original from '../frontend/src/examples/integration.fctest.json' with { type: 'json' };
import { scenarioFrom, validateScenario } from '../frontend/src/integration/scenarios/model.ts';
import { setFirstReply, duplicateCase, removeCase } from '../frontend/src/integration/scenarios/authoring.ts';
import {
  attachmentsFromFiles,
  requireAttachmentBudget,
} from '../frontend/src/integration/scenarios/attachments.ts';
import { formatTestJson } from '../frontend/src/integration/scenarios/json-format.ts';
import {
  validatePreparation,
  registerPreparationFlush,
  flushPreparations,
} from '../frontend/src/integration/scenarios/recovery.ts';
const scenario = () => scenarioFrom(structuredClone(original));
const assignment = {
  apiVersion: 'v3',
  senderProfileId: '',
  receiverProfileId: '',
  sourceDestination: '',
  receiverDestination: '',
};
test('first reply can be added to a case without a reply and removed with dependent expectations', () => {
  const s = scenario(),
    item = s.pack.cases[0];
  setFirstReply(s, item.id, false);
  setFirstReply(s, item.id, true);
  assert.equal(item.reply.schemaUri, item.request.replyOffer.schemaUri);
  s.rules.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    scope: 'reply',
    path: '/status',
    operator: 'present',
    value: '',
  });
  s.variables.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    scope: 'reply',
    path: '/status',
    label: 'Status',
    kind: 'text',
    value: 'Test',
  });
  s.variants[0].values.push({ variableId: s.variables[0].id, value: 'Test' });
  setFirstReply(s, item.id, false);
  assert.equal(item.reply, null);
  assert.equal(item.request.replyOffer, null);
  assert.equal(s.rules.length + s.variables.length + s.variants[0].values.length, 0);
  validateScenario(s);
});
test('duplicating a case remaps variable IDs and variant values without mutating the source', () => {
  const s = scenario(),
    item = s.pack.cases[0];
  s.variables.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    scope: 'request',
    path: '/x',
    label: 'X',
    kind: 'text',
    value: 'test',
  });
  s.variants[0].values.push({ variableId: s.variables[0].id, value: 'other' });
  const before = JSON.stringify(item),
    id = duplicateCase(s, item.id);
  assert.equal(JSON.stringify(item), before);
  assert.notEqual(s.variables[0].id, s.variables[1].id);
  assert.equal(s.variables[1].caseId, id);
  assert.equal(s.variants[0].values[1].variableId, s.variables[1].id);
  removeCase(s, id);
  assert.equal(s.variables.length, 1);
  assert.equal(s.variants[0].values.length, 1);
});
test('case limits reject duplication atomically', () => {
  const s = scenario();
  while (s.pack.cases.length < 20) duplicateCase(s, s.pack.cases[0].id);
  const before = JSON.stringify(s);
  assert.throws(() => duplicateCase(s, s.pack.cases[0].id), /scenario_authoring_limit/);
  assert.equal(JSON.stringify(s), before);
});
test('attachment editing preserves original bytes, replaces explicitly and rejects ambiguous names', async () => {
  const file = new File([new Uint8Array([0, 255, 13, 10])], 'sample.bin');
  const added = await attachmentsFromFiles([file], []);
  assert.deepEqual(Buffer.from(added[0].base64, 'base64'), Buffer.from([0, 255, 13, 10]));
  await assert.rejects(attachmentsFromFiles([file], added), /test_attachment_duplicate/);
  const replaced = await attachmentsFromFiles(
    [new File(['clean'], 'clean.txt', { type: 'text/plain' })],
    added,
    0,
  );
  assert.equal(replaced[0].fileName, 'clean.txt');
  assert.equal(added[0].fileName, 'sample.bin');
  await assert.rejects(
    attachmentsFromFiles([new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.bin')], []),
    /test_pack_limit/,
  );
  const s = scenario();
  s.pack.cases[0].request.data = 'x'.repeat(8 * 1024 * 1024);
  assert.throws(() => requireAttachmentBudget(s, s.pack.cases[0].request, added), /test_pack_limit/);
});
test('JSON formatting is lossless for large integers, negative zero and raw escapes', () => {
  const source = '{"n":9007199254740993,"z":-0,"s":"\\u00e4","a":[true,null]}';
  const formatted = formatTestJson(source);
  assert.match(formatted, /9007199254740993/);
  assert.match(formatted, /-0/);
  assert.ok(formatted.includes('\\u00e4'));
  assert.throws(() => formatTestJson('{"a":1,"a":2}'));
  assert.throws(() => formatTestJson('{unfinished'));
});
test('protected recovery retains unfinished text but rejects credentials and malformed envelopes', async () => {
  const s = scenario();
  s.pack.cases[0].request.data = '{"unfinished":';
  s.name = '';
  const p = {
    format: 'fbforge-connect-preparation',
    version: 1,
    definition: s,
    assignment,
    variantId: s.variants[0].id,
    environment: 'TEST',
    savedAt: new Date().toISOString(),
  };
  assert.equal(validatePreparation(p).definition.pack.cases[0].request.data, '{"unfinished":');
  assert.throws(() => validateScenario(s));
  assert.throws(() => validatePreparation({ ...p, clientSecret: 'never-store' }));
  assert.throws(() => validatePreparation({ ...p, assignment: { ...assignment, password: 'never-store' } }));
  assert.throws(() => validatePreparation({ ...p, variantId: crypto.randomUUID() }));
  const unregister = registerPreparationFlush(async () => {
    throw Error('preparation_pending');
  });
  await assert.rejects(flushPreparations(), /preparation_pending/);
  unregister();
  await flushPreparations();
});
