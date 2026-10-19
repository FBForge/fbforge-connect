import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSupportReport,
  createDiagnosticLog,
  observeInvoke,
  diagnosticContext,
  diagnosticResult,
} from '../frontend/src/support-report.js';

const sample = {
  time: '2026-10-16T18:00:00.000Z',
  command: 'open_session',
  apiVersion: 'v3',
  result: 'returned',
  state: null,
  code: null,
  durationMs: 12,
};
const marker = 'SENSITIVE_TEST_MARKER';

test('diagnostic presentation distinguishes local calls, states and schema failures', () => {
  assert.equal(diagnosticContext({ apiVersion: null }), 'Lokal');
  assert.equal(diagnosticContext({ apiVersion: marker }), 'Lokal');
  assert.equal(diagnosticContext({ apiVersion: 'v3' }), 'API v3');
  assert.deepEqual(diagnosticResult(sample), { label: 'Erfolgreich', tone: 'info' });
  assert.deepEqual(diagnosticResult({ ...sample, state: 'idle' }), {
    label: 'Keine Aktion offen',
    tone: 'info',
  });
  assert.deepEqual(diagnosticResult({ ...sample, state: 'uncertain' }), {
    label: 'Ausgang ungewiss',
    tone: 'warn',
  });
  assert.deepEqual(diagnosticResult({ ...sample, code: 'schema_unavailable' }), {
    label: 'Schema nicht verfügbar',
    tone: 'warn',
  });
  assert.deepEqual(diagnosticResult({ ...sample, code: marker }), { label: 'Fehlgeschlagen', tone: 'warn' });
});

test('local storage failures are recorded without retaining profile data', async () => {
  const log = createDiagnosticLog();
  const invoke = observeInvoke(
    async () => ({ profileId: marker, saved: false, error: 'vault_unavailable' }),
    log.record,
  );
  await invoke('profile_status', { sessionId: marker });
  assert.equal(log.snapshot()[0].code, 'vault_unavailable');
  assert.equal(log.snapshot()[0].apiVersion, null);
  assert.equal(JSON.stringify(log.snapshot()).includes(marker), false);
});

test('native diagnostics omit credentials, identifiers, files and response contents on success and failure', async () => {
  const log = createDiagnosticLog();
  let calls = 0;
  const payload = {
    data: { status: 'uncertain', error: marker, clientSecret: marker, submissionId: marker },
  };
  const failure = new Error(marker);
  const invoke = observeInvoke(async (command, args) => {
    calls++;
    assert.equal(args.clientSecret, marker);
    if (command === 'open_session') return payload;
    throw failure;
  }, log.record);
  assert.equal(
    await invoke('open_session', { apiVersion: 'v3', clientSecret: marker, clientId: marker }),
    payload,
  );
  await assert.rejects(
    invoke('execute_send', { apiVersion: 'v2', clientSecret: marker, sendDocument: marker }),
    (error) => error === failure,
  );
  assert.equal(calls, 2);
  assert.equal(log.snapshot()[0].code, 'unknown_error');
  assert.equal(log.snapshot()[1].state, 'uncertain');
  assert.equal(JSON.stringify(log.snapshot()).includes(marker), false);
  assert.deepEqual(Object.keys(log.snapshot()[0]), Object.keys(sample));
});

test('diagnostic failures cannot replace a native result, change an error, or replay an operation', async () => {
  let calls = 0;
  const original = new Error('resource_denied');
  const invoke = observeInvoke(
    async (command) => {
      calls++;
      if (command === 'open_session') return 42;
      throw original;
    },
    () => {
      throw new Error('listener failed');
    },
  );
  assert.equal(await invoke('open_session', {}), 42);
  await assert.rejects(invoke('execute_send', {}), (error) => error === original);
  assert.equal(calls, 2);
});

test('reports revalidate all exported fields, including unknown commands and malicious nested input', () => {
  const report = buildSupportReport({
    version: '0.1.0-dev.4',
    selectedApi: marker,
    probes: { v3: { isolated: true, apiVersion: 'v3', environment: 'PROD', clientSecret: marker } },
    clientSecret: marker,
    entries: [
      { ...sample, clientId: marker },
      { ...sample, command: marker },
      { ...sample, command: 'constructor' },
      {
        ...sample,
        time: marker,
        apiVersion: marker,
        result: marker,
        state: marker,
        code: marker,
        durationMs: -1,
      },
    ],
  });
  assert.equal(JSON.stringify(report).includes(marker), false);
  assert.equal(report.operations.length, 2);
  assert.equal(report.operations[1].time, null);
  assert.equal(report.operations[1].apiVersion, null);
  assert.equal(report.operations[1].durationMs, null);
  assert.equal(report.operations[1].code, 'unknown_error');
  assert.equal(report.localAdapters[1].verified, false);
  assert.equal(report.selectedApi, null);
  assert.throws(() => buildSupportReport({ version: marker }), /invalid_input/);
});

test('diagnostic history is bounded, immutable, observable and clearable without retaining content chunks', () => {
  const log = createDiagnosticLog();
  let notifications = 0;
  const unsubscribe = log.subscribe(() => notifications++);
  log.subscribe(() => {
    throw new Error('observer');
  });
  for (let i = 0; i < 120; i++) log.record({ ...sample, durationMs: i });
  log.record({ ...sample, command: 'append_content', chunk: marker });
  assert.equal(notifications, 120);
  assert.equal(log.snapshot().length, 100);
  assert.equal(log.snapshot()[0].durationMs, 119);
  assert.equal(log.snapshot()[99].durationMs, 20);
  assert.throws(() => {
    log.snapshot()[0].code = marker;
  }, TypeError);
  const detached = log.snapshot();
  detached.length = 0;
  assert.equal(log.snapshot().length, 100);
  unsubscribe();
  log.clear();
  assert.equal(notifications, 120);
  assert.deepEqual(log.snapshot(), []);
});

test('reply schema and event-log diagnostics include known codes without proof, schema or field contents', async () => {
  const log = createDiagnosticLog();
  const invoke = observeInvoke(async () => {
    throw new Error('data_schema_invalid');
  }, log.record);
  for (const command of ['load_reply_schema', 'load_reply_event_log', 'reply_target'])
    await assert.rejects(
      invoke(command, { apiVersion: 'v3', proofId: marker, schemaDocument: marker, replyId: marker }),
      /data_schema_invalid/,
    );
  const report = buildSupportReport({ version: '0.1.0-dev.7', selectedApi: 'v3', entries: log.snapshot() });
  assert.equal(report.operations.length, 3);
  assert.equal(report.operations[0].code, 'data_schema_invalid');
  assert.equal(JSON.stringify(report).includes(marker), false);
});
