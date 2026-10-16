import test from 'node:test';
import assert from 'node:assert/strict';
import { serialInvoke } from '../frontend/src/native.js';

test('context cleanup completes before the next native lookup without overlapping exchanges', async () => {
  const calls = []; let finish;
  const invoke = serialInvoke(async command => {
    calls.push(command);
    if (command === 'discard_received') await new Promise(resolve => { finish = resolve; });
    return command;
  });
  const cleanup = invoke('discard_received'), lookup = invoke('load_submission');
  await Promise.resolve();
  assert.deepEqual(calls, ['discard_received']);
  finish();
  assert.deepEqual(await Promise.all([cleanup, lookup]), ['discard_received', 'load_submission']);
});
test('a native failure is returned once without retrying or blocking subsequent cleanup', async () => {
  const calls = [];
  const invoke = serialInvoke(command => {
    calls.push(command);
    if (command === 'verify_submission') throw new Error('verification_failed');
    return 'discarded';
  });
  const failure = invoke('verify_submission'), cleanup = invoke('discard_received');
  await assert.rejects(failure, /verification_failed/);
  assert.equal(await cleanup, 'discarded');
  assert.deepEqual(calls, ['verify_submission', 'discard_received']);
});
