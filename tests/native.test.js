import test from 'node:test';
import assert from 'node:assert/strict';
import { serialInvoke } from '../frontend/src/native.js';
import { readFile } from 'node:fs/promises';

test('desktop command registration, generated permissions and main-window grants agree', async () => {
  const [main, build, capability] = await Promise.all([
    readFile(new URL('../desktop/src/main.rs', import.meta.url), 'utf8'),
    readFile(new URL('../desktop/build.rs', import.meta.url), 'utf8'),
    readFile(new URL('../desktop/capabilities/main.json', import.meta.url), 'utf8'),
  ]);
  const registered = main
    .match(/generate_handler!\[([\s\S]*?)\]/)?.[1]
    .split(',')
    .map((name) => name.trim().split('::').at(-1))
    .filter(Boolean)
    .sort();
  assert.equal(new Set(registered).size, registered.length, 'command names must be unique across modules');
  const declared = [...build.matchAll(/"([a-z][a-z0-9_]+)"/g)].map((match) => match[1]).sort();
  const grants = JSON.parse(capability);
  assert.deepEqual(grants.windows, ['main']);
  assert.equal(grants.remote, undefined, 'remote pages must not receive native permissions');
  assert.deepEqual(declared, registered, 'every command needs a generated permission');
  assert.deepEqual(
    grants.permissions.toSorted(),
    registered.map((name) => `allow-${name.replaceAll('_', '-')}`).sort(),
  );
});

test('context cleanup completes before the next native lookup without overlapping exchanges', async () => {
  const calls = [];
  let finish;
  const invoke = serialInvoke(async (command) => {
    calls.push(command);
    if (command === 'discard_received')
      await new Promise((resolve) => {
        finish = resolve;
      });
    return command;
  });
  const cleanup = invoke('discard_received'),
    lookup = invoke('load_submission');
  await Promise.resolve();
  assert.deepEqual(calls, ['discard_received']);
  finish();
  assert.deepEqual(await Promise.all([cleanup, lookup]), ['discard_received', 'load_submission']);
});
test('a native failure is returned once without retrying or blocking subsequent cleanup', async () => {
  const calls = [];
  const invoke = serialInvoke((command) => {
    calls.push(command);
    if (command === 'verify_submission') throw new Error('verification_failed');
    return 'discarded';
  });
  const failure = invoke('verify_submission'),
    cleanup = invoke('discard_received');
  await assert.rejects(failure, /verification_failed/);
  assert.equal(await cleanup, 'discarded');
  assert.deepEqual(calls, ['verify_submission', 'discard_received']);
});
