import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticCode, errorMessage } from '../frontend/src/diagnostics.js';
import { sdkDiagnostics } from '../frontend/src/sdk-diagnostics.ts';
import { observeInvoke, createDiagnosticLog, buildSupportReport } from '../frontend/src/support-report.js';
import { verifySubmission } from '../frontend/src/receiving.js';

const details = [
  {
    stage: 'METADATA',
    type: 'UnsupportedReplyChannel',
    message: 'The reply channel is not supported by this destination.',
  },
];
const failure = () => ({ code: 'verification_failed', diagnostics: structuredClone(details) });

test('structured SDK reasons survive receiving and are recorded locally without changing the rejection', async () => {
  for (const apiVersion of ['v2', 'v3']) {
    const log = createDiagnosticLog();
    const reason = failure();
    let calls = 0;
    const invoke = observeInvoke(async () => {
      calls++;
      throw reason;
    }, log.record);
    await assert.rejects(
      verifySubmission(
        invoke,
        {
          apiVersion,
          environment: 'TEST',
          sessionId: '11111111-1111-4111-8111-111111111111',
          connected: true,
        },
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ),
      (error) => error === reason,
    );
    assert.equal(calls, 1);
    assert.equal(diagnosticCode(reason), 'verification_failed');
    assert.match(errorMessage(reason), /SDK/);
    const entry = log.snapshot()[0];
    assert.equal(entry.apiVersion, apiVersion);
    assert.equal(entry.command, 'verify_submission');
    assert.equal(entry.result, 'rejected');
    assert.deepEqual(entry.diagnostics, details);
    assert.ok(Object.isFrozen(entry.diagnostics));
    assert.throws(() => entry.diagnostics.push(details[0]));
    log.record({ ...entry, time: new Date().toISOString() });
    const report = buildSupportReport({ version: '0.4.0', selectedApi: apiVersion, entries: log.snapshot() });
    assert.equal(report.operations.length, 2);
    for (const operation of report.operations) {
      assert.equal(operation.code, 'verification_failed');
      assert.equal(Object.hasOwn(operation, 'diagnostics'), false);
    }
    assert.equal(JSON.stringify(report).includes(details[0].message), false);
  }
});

test('only bounded native SDK records enable free-form text, raw exceptions stay hidden', () => {
  assert.deepEqual(sdkDiagnostics(failure()), details);
  for (const cause of [
    new Error('private raw exception'),
    { message: 'private raw exception', diagnostics: details },
    { code: 'unapproved', diagnostics: details },
    { code: 'verification_failed', diagnostics: Array(9).fill(details[0]) },
    ...[
      { stage: 'OTHER' },
      { type: '<script>' },
      { message: 'x'.repeat(1025) },
      { message: 'bad\u0000text' },
      { data: 'unapproved extra data' },
      { message: '' },
    ].map((patch) => ({ code: 'verification_failed', diagnostics: [{ ...details[0], ...patch }] })),
  ])
    assert.deepEqual(sdkDiagnostics(cause), []);
  const local = failure();
  const original = sdkDiagnostics(local);
  local.diagnostics[0].message = 'changed afterwards';
  assert.equal(original[0].message, details[0].message);
});
