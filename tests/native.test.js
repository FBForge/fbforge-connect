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
  const commandList = build.match(/\.commands\(&\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(commandList, 'generated command declaration must be present');
  const declared = [...commandList.matchAll(/"([a-z][a-z0-9_]+)"/g)].map((match) => match[1]).sort();
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

test('scanner status and cancellation stay responsive during installation without overlapping Java calls', async () => {
  const calls = [];
  let finishInstall, finishReceive;
  const invoke = serialInvoke(async (command) => {
    calls.push(command);
    if (command === 'install_local_scanner')
      await new Promise((resolve) => {
        finishInstall = resolve;
      });
    if (command === 'verify_submission')
      await new Promise((resolve) => {
        finishReceive = resolve;
      });
    return command;
  });
  const install = invoke('install_local_scanner'),
    receive = invoke('verify_submission'),
    cleanup = invoke('discard_received');
  await Promise.resolve();
  assert.equal(await invoke('local_scanner_status'), 'local_scanner_status');
  assert.equal(await invoke('cancel_local_scanner_operation'), 'cancel_local_scanner_operation');
  assert.ok(!calls.includes('discard_received'));
  finishReceive();
  await receive;
  await cleanup;
  assert.ok(calls.includes('discard_received'));
  finishInstall();
  await install;
});

test('profile removal serializes with protected workspace writes before acquiring the binding lock', async () => {
  const workspace = await readFile(new URL('../desktop/src/profile_workspace.rs', import.meta.url), 'utf8');
  const profiles = await readFile(new URL('../desktop/src/profiles.rs', import.meta.url), 'utf8');
  const removal = profiles.slice(
    profiles.indexOf('pub async fn forget_profile('),
    profiles.indexOf('pub async fn open_saved_profile('),
  );
  assert.ok(workspace.includes('pub(crate) static WORKSPACE_LOCK: Mutex<()>'));
  assert.equal(
    (workspace.match(/let _guard = WORKSPACE_LOCK.lock\(\).await;/g) || []).length,
    3,
    'all workspace mutation entry points must serialize',
  );
  assert.ok(
    removal.indexOf('WORKSPACE_LOCK.lock().await') < removal.indexOf('state.profiles.lock().await'),
    'prevent lock inversion and orphaned files during forget',
  );
  assert.ok(removal.indexOf('WORKSPACE_LOCK.lock().await') < removal.indexOf('remove_dir_all(workspace)'));
});
