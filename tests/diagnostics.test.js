import test from 'node:test';
import assert from 'node:assert/strict';
import { probeAdapter, errorMessage, diagnosticCode } from '../frontend/src/diagnostics.js';

test('both API versions invoke the native command without changing the requested version', async () => {
  const calls = [];
  const invoke = async (command, args) => {
    calls.push([command, args]);
    return {
      apiVersion: args.apiVersion,
      sdkVersion: args.apiVersion === 'v2' ? '3.5.2' : '4.0.0-rc.2',
      environment: 'TEST',
      isolated: true,
      entrypoint: 'public.sdk.Client',
    };
  };
  assert.equal((await probeAdapter(invoke, 'v2')).apiVersion, 'v2');
  assert.equal((await probeAdapter(invoke, 'v3')).apiVersion, 'v3');
  assert.deepEqual(calls, [
    ['probe_engine', { apiVersion: 'v2' }],
    ['probe_engine', { apiVersion: 'v3' }],
  ]);
});

test('unsupported versions do not reach the native boundary', async () => {
  let calls = 0;
  await assert.rejects(
    probeAdapter(async () => {
      calls++;
    }, 'prod'),
  );
  assert.equal(calls, 0);
});

test('a mismatched API, PROD response or missing isolation cannot report success', async () => {
  const base = {
    apiVersion: 'v2',
    sdkVersion: '3.5.2',
    environment: 'TEST',
    isolated: true,
    entrypoint: 'public.sdk.Client',
  };
  for (const patch of [
    { apiVersion: 'v3' },
    { environment: 'PROD' },
    { isolated: false },
    { sdkVersion: 'other' },
  ]) {
    await assert.rejects(probeAdapter(async () => ({ ...base, ...patch }), 'v2'));
  }
});

test('unexpected native errors are never displayed verbatim', () => {
  for (const value of ['synthetic-sensitive-marker', 'constructor', 'toString', '__proto__']) {
    assert.equal(errorMessage(value), 'Die lokale Aktion ist fehlgeschlagen.');
  }
  assert.match(errorMessage('engine_not_staged'), /Laufzeit/);
});

test('reportable diagnostics expose stable codes and never raw errors or inherited properties', () => {
  for (const code of [
    'verification_failed',
    'reply_channel_missing',
    'schema_id_mismatch',
    'resource_denied',
    'resource_missing',
    'schema_tls_error',
    'endpoint_blocked',
  ]) {
    assert.equal(diagnosticCode(code), code);
    assert.equal(diagnosticCode(new Error(code)), code);
  }
  for (const cause of [
    'synthetic-sensitive-marker',
    new Error('secret in SDK message'),
    'constructor',
    '__proto__',
    null,
    { message: {} },
  ])
    assert.equal(diagnosticCode(cause), 'unknown_error');
});
