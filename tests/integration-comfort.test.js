import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  flowFromPack,
  validateTestFlow,
  compareTestContent,
  eligibleFlowRecord,
} from '../frontend/src/integration/test-flows.js';
import {
  collectionAge,
  submissionTimeline,
  readSubmissionTimeline,
} from '../frontend/src/integration/server-timeline.js';
import { certificateExpiry } from '../frontend/src/integration/certificate-expiry.js';
import {
  validateTemplate,
  configurationDifferences,
  profileWorkspace,
} from '../frontend/src/integration/destination-templates.js';
const example = JSON.parse(
  await readFile(new URL('../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const session = { apiVersion: 'v2', sessionId: id(1), environment: 'TEST', connected: true };
const event = {
  eventId: id(9),
  eventType: 'https://schema.fitko.de/fit-connect/events/submit-submission',
  issuer: 'https://issuer.example',
  issuedAt: '2026-10-01T12:00:00Z',
  headerBytes: 10,
  claimsBytes: 20,
  subjectType: 'submission',
  subjectId: id(2),
};
test('collection ages use elapsed days, preserve unknown times and distinguish the technical deadline', () => {
  const at = Date.parse('2026-10-10T12:00:00Z');
  assert.deepEqual(collectionAge('2026-10-01T12:00:00Z', at), {
    ageDays: 9,
    dueAt: '2026-10-15T12:00:00.000Z',
    remainingDays: 5,
    urgency: 'urgent',
  });
  for (const value of [null, undefined, 'bad', '2026-11-01T00:00:00Z'])
    assert.equal(collectionAge(value, at), null);
  assert.equal(collectionAge('2026-10-01T12:00:00Z', at + 5 * 86400000).urgency, 'expired');
});
test('server reconciliation needs the exact subject and one unambiguous signed submit event', () => {
  assert.equal(submissionTimeline([event], id(2)).submitted, true);
  assert.equal(submissionTimeline([event], id(3)).submitted, false);
  assert.equal(submissionTimeline([event, event], id(2)).submitted, false);
  assert.equal(
    submissionTimeline([{ ...event, eventType: event.eventType.replace('submit-', 'create-') }], id(2))
      .submitted,
    false,
  );
});
for (const apiVersion of ['v2', 'v3'])
  test(`timeline reads only verified events, cancels stale work and disposes snapshots ${apiVersion}`, async () => {
    const calls = [];
    let total = 1;
    const invoke = async (command) => {
      calls.push(command);
      let data;
      if (command === 'load_case_event_log')
        data = {
          logId: id(8),
          caseId: id(3),
          scope: 'case',
          total,
          warnings: ['CONTENT_AUTHENTICATION_TAGS_NOT_COMPARED'],
        };
      else if (command === 'list_case_event_log')
        data = { logId: id(8), offset: 0, total: 1, events: [event] };
      else if (command === 'discard_event_log') data = { logId: id(8) };
      else throw new Error('unexpected write');
      return { apiVersion, sessionId: id(1), environment: 'TEST', data };
    };
    assert.equal(
      (
        await readSubmissionTimeline(
          invoke,
          { ...session, apiVersion },
          { caseId: id(3), submissionId: id(2) },
        )
      ).submitted,
      true,
    );
    assert.deepEqual(calls, ['load_case_event_log', 'list_case_event_log', 'discard_event_log']);
    calls.length = 0;
    total = 101;
    await assert.rejects(
      readSubmissionTimeline(invoke, { ...session, apiVersion }, { caseId: id(3), submissionId: id(2) }),
      /timeline_limit/,
    );
    assert.deepEqual(calls, ['load_case_event_log', 'discard_event_log']);
    total = 1;
    calls.length = 0;
    await assert.rejects(
      readSubmissionTimeline(
        invoke,
        { ...session, apiVersion },
        { caseId: id(3), submissionId: id(2) },
        () => false,
      ),
      /content_cancelled/,
    );
    assert.deepEqual(calls, ['load_case_event_log', 'discard_event_log']);
  });
test('certificate notices separate expired, 30-day and 90-day warnings without inventing missing dates', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const rows = [-1, 30, 90, 91].map((days) => ({
    kid: String(days),
    expiresAt: new Date(now + days * 86400000).toISOString(),
  }));
  assert.deepEqual(
    certificateExpiry([...rows, { kid: 'unknown', expiresAt: null }], now).map((r) => [r.kid, r.urgency]),
    [
      ['-1', 'expired'],
      ['30', 'urgent'],
      ['90', 'attention'],
    ],
  );
});
test('test flows keep cases unchanged, include receipt/reply expectations and reject reordered or incomplete steps', () => {
  const saved = JSON.stringify(example),
    flow = flowFromPack(example);
  assert.equal(JSON.stringify(example), saved);
  assert.ok(flow.steps.some((step) => step.type === 'receipt'));
  assert.ok(flow.steps.some((step) => step.type === 'check_reply'));
  for (const steps of [
    [...flow.steps].reverse(),
    flow.steps.slice(0, 1),
    [...flow.steps, { caseId: 'missing', type: 'send' }],
  ])
    assert.throws(() => validateTestFlow({ ...flow, steps }));
  assert.throws(() => validateTestFlow({ ...flow, clientSecret: 'no' }));
});
test('flow comparisons preserve values, array order, namespace and XML content; malformed or huge data never passes', () => {
  assert.equal(compareTestContent('{"b":2,"a":1}', '{"a":1,"b":2}', 'application/json'), true);
  for (const [a, b] of [
    ['[1,2]', '[2,1]'],
    ['{"a":false}', '{"a":0}'],
    ['1e999', 'null'],
    ['9007199254740993', '9007199254740992'],
    ['{"a":1,"a":2}', '{"a":2}'],
    ['{', '{}'],
  ])
    assert.equal(compareTestContent(a, b, 'application/json'), false);
  assert.equal(compareTestContent('<a x="1">Text</a>', '<a x="1">Text</a>', 'application/xml'), true);
  assert.equal(compareTestContent('<a xmlns="urn:one"/>', '<a xmlns="urn:two"/>', 'application/xml'), false);
  assert.equal(
    compareTestContent('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///private">]><a/>', '<a/>', 'application/xml'),
    false,
  );
  assert.equal(compareTestContent(' '.repeat(512 * 1024 + 1), '{}', 'application/json'), false);
});
test('test evidence is current, decrypted, successful and bound to the same case and message', () => {
  const row = {
    createdAt: '2026-10-02T00:00:00Z',
    kind: 'submission',
    direction: 'received',
    status: 'verified',
    caseId: id(3),
    submissionId: id(2),
  };
  assert.equal(
    eligibleFlowRecord(row, { type: 'receive' }, Date.parse('2026-10-01T00:00:00Z'), {
      caseId: id(3),
      submissionId: id(2),
    }),
    true,
  );
  for (const changed of [
    { status: 'uncertain' },
    { status: 'unverified' },
    { status: 'invented' },
    { available: false },
    { caseId: id(4) },
    { submissionId: id(4) },
    { createdAt: '2026-09-01T00:00:00Z' },
    { direction: 'sent' },
  ])
    assert.equal(
      eligibleFlowRecord({ ...row, ...changed }, { type: 'receive' }, Date.parse('2026-10-01T00:00:00Z'), {
        caseId: id(3),
        submissionId: id(2),
      }),
      false,
    );
});
test('configuration templates permit public changes only and preserve differences in schemas and array order', () => {
  const base = {
    format: 'fbforge-connect-destination-template',
    version: 1,
    name: 'Vorlage',
    changes: { name: '{name} Test', metadataVersions: ['3.0.0'] },
  };
  assert.deepEqual(validateTemplate(base), base);
  for (const changes of [
    { clientSecret: 'no' },
    { privateKey: 'no' },
    { metadataVersions: ['99.0.0'] },
    { contactInformation: { clientId: 'no' } },
    { status: 'deleted' },
    { name: '' },
    { publicServices: [{ privateKey: 'no' }] },
  ])
    assert.throws(() => validateTemplate({ ...base, changes }));
  assert.deepEqual(
    configurationDifferences(
      { metadataVersions: ['2.0.0'], name: 'a' },
      { metadataVersions: ['3.0.0'], name: 'a' },
    ).map((r) => r.field),
    ['metadataVersions'],
  );
});
test('workspace operations bind to the connected session and handle unsaved profiles explicitly', async () => {
  let seen;
  assert.equal(
    await profileWorkspace(async (c, a) => {
      seen = { c, a };
      return null;
    }, session),
    null,
  );
  assert.equal(seen.c, 'profile_workspace');
  assert.equal(seen.a.sessionId, id(1));
  await assert.rejects(
    profileWorkspace(() => assert.fail('must not invoke'), null),
    /session_missing/,
  );
  await assert.rejects(
    profileWorkspace(async () => ({ templates: 'bad' }), session),
    /engine_protocol_error/,
  );
});
