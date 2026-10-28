import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadMessage } from '../frontend/src/message-export.js';

const session = { apiVersion: 'v3', sessionId: '00000000-0000-4000-8000-000000000001' };
const source = { proofId: '00000000-0000-4000-8000-000000000002', messageId: 'message', reply: false };
const target = { exportId: 'export-0000000000000001', directory: 'synthetic-export' };
const saved = { directory: 'synthetic-export/message', fileCount: 3, totalBytes: 42 };

test('one-message download releases its folder permission and returns only a completed export', async () => {
  const calls = [];
  const result = await downloadMessage(
    async (command, args) => {
      calls.push(command);
      if (command === 'begin_message_export') return target;
      if (command === 'export_message') {
        assert.deepEqual(args.source, source);
        return saved;
      }
      return null;
    },
    session,
    source,
  );
  assert.deepEqual(result, saved);
  assert.deepEqual(calls, ['begin_message_export', 'export_message', 'finish_message_export']);
});

test('folder cancellation and a context change cannot report a completed download', async () => {
  for (const mode of ['cancel', 'change-before-export', 'change-after-export']) {
    let current = true;
    const calls = [];
    const result = await downloadMessage(
      async (command) => {
        calls.push(command);
        if (command === 'begin_message_export') {
          if (mode === 'change-before-export') current = false;
          return mode === 'cancel' ? null : target;
        }
        if (command === 'export_message') {
          current = false;
          return saved;
        }
        return null;
      },
      session,
      source,
      () => current,
    );
    assert.equal(result, null);
    assert.equal(calls.includes('export_message'), mode === 'change-after-export');
    assert.equal(calls.includes('finish_message_export'), mode !== 'cancel');
  }
});

test('failed saving propagates its error and still releases the folder permission', async () => {
  const calls = [];
  await assert.rejects(
    downloadMessage(
      async (command) => {
        calls.push(command);
        if (command === 'begin_message_export') return target;
        if (command === 'export_message') throw new Error('export_failed');
        return null;
      },
      session,
      source,
    ),
    /export_failed/,
  );
  assert.equal(calls.at(-1), 'finish_message_export');
});
