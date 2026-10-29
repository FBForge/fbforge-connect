import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateController, validateUpdateStatus } from '../frontend/src/application-updates.js';

const idle = {
  configured: true,
  supported: true,
  phase: 'idle',
  version: null,
  notes: '',
  downloaded: 0,
  total: null,
};
const available = {
  ...idle,
  phase: 'available',
  version: '0.4.0',
  notes: '<script>untrusted release notes</script>',
};
const downloaded = { ...available, phase: 'downloaded', downloaded: 42, total: 42 };
const options = { storage: { getItem: () => null } };

test('automatic startup only checks; download, installation and browser opening require explicit action', async () => {
  const calls = [];
  const controller = createUpdateController(async (command, args) => {
    calls.push({ command, args });
    return command === 'application_update_status' ? idle : available;
  }, options);
  await controller.initialize();
  assert.deepEqual(
    calls.map((call) => call.command),
    ['application_update_status', 'check_application_update'],
  );
  assert.equal(controller.state.version, '0.4.0');
  assert.equal(controller.state.working, false);
  controller.dismiss();
  assert.equal(controller.state.dismissed, true);
});

test('opt-out, unsupported platforms and unconfigured builds perform no release request', async () => {
  for (const state of [idle, { ...idle, configured: false }, { ...idle, supported: false }]) {
    const calls = [];
    const controller = createUpdateController(
      async (command) => {
        calls.push(command);
        return state;
      },
      {
        storage: { getItem: () => (state === idle ? 'false' : null) },
      },
    );
    await controller.initialize();
    assert.deepEqual(calls, ['application_update_status']);
    await controller.check();
    assert.equal(calls.at(-1), 'check_application_update');
  }
});

test('network failure never claims current and never reveals arbitrary response content', async () => {
  for (const error of ['update_network_failed', 'private server response', new Error('sensitive')]) {
    const controller = createUpdateController(async (command) => {
      if (command === 'application_update_status') return idle;
      throw error;
    }, options);
    await controller.initialize();
    assert.equal(controller.state.phase, 'idle');
    assert.ok(controller.state.error);
    assert.doesNotMatch(controller.state.error, /private|sensitive/);
    assert.notEqual(controller.state.code, 'private server response');
  }
});

test('download and installation carry only the native-bound release version', async () => {
  const calls = [],
    locks = [];
  const controller = createUpdateController(
    async (command, args) => {
      calls.push({ command, args });
      if (command === 'application_update_status') return idle;
      if (command === 'check_application_update') return available;
      if (command === 'download_application_update') return downloaded;
      if (command === 'install_application_update') throw 'update_cancelled';
      throw new Error('unexpected');
    },
    { ...options, installing: (value) => locks.push(value) },
  );
  await controller.initialize();
  await controller.download();
  assert.equal(controller.state.phase, 'downloaded');
  await controller.install();
  assert.deepEqual(locks, [true, false]);
  assert.deepEqual(
    calls.filter((call) => call.args).map((call) => call.args),
    [{ version: '0.4.0' }, { version: '0.4.0' }],
  );
  assert.equal(controller.state.error, '');
});

test('invalid signature and cancelled download never trigger installation or an automatic retry', async () => {
  for (const error of ['update_signature_invalid', 'update_cancelled']) {
    const calls = [];
    const controller = createUpdateController(async (command) => {
      calls.push(command);
      if (command === 'application_update_status') return available;
      if (command === 'check_application_update') return available;
      throw error;
    }, options);
    await controller.initialize();
    await controller.download();
    assert.equal(calls.filter((c) => c === 'download_application_update').length, 1);
    assert.ok(!calls.includes('install_application_update'));
    assert.equal(controller.state.phase, 'available');
    assert.equal(Boolean(controller.state.error), error !== 'update_cancelled');
  }
});

test('duplicate clicks cannot overlap operations, and cancellation is a distinct command', async () => {
  let finish;
  const calls = [];
  const controller = createUpdateController(async (command) => {
    calls.push(command);
    if (command === 'application_update_status') return available;
    if (command === 'check_application_update') return available;
    if (command === 'download_application_update')
      return new Promise((resolve) => {
        finish = resolve;
      });
  }, options);
  await controller.initialize();
  const operation = controller.download();
  await controller.download();
  await controller.check();
  await controller.cancel();
  assert.deepEqual(calls.slice(-2), ['download_application_update', 'cancel_application_update']);
  finish(downloaded);
  await operation;
});

test('late polling cannot overwrite the final verified download result', async () => {
  let finish, poll;
  let reads = 0;
  const controller = createUpdateController(async (command) => {
    if (command === 'application_update_status') {
      if (++reads === 1) return available;
      return new Promise((resolve) => {
        poll = resolve;
      });
    }
    if (command === 'check_application_update') return available;
    if (command === 'download_application_update')
      return new Promise((resolve) => {
        finish = resolve;
      });
  }, options);
  await controller.initialize();
  const operation = controller.download();
  const status = controller.poll();
  finish(downloaded);
  await operation;
  poll({ ...available, phase: 'downloading' });
  await status;
  assert.equal(controller.state.phase, 'downloaded');
});

test('failed installer launch clears stale sessions and releases the UI lock', async () => {
  let lost = 0;
  const locks = [];
  const controller = createUpdateController(
    async (command) => {
      if (command === 'application_update_status') return downloaded;
      if (command === 'check_application_update') return downloaded;
      throw 'update_install_failed';
    },
    { ...options, installing: (value) => locks.push(value), disconnected: () => lost++ },
  );
  await controller.initialize();
  await controller.install();
  assert.equal(lost, 1);
  assert.deepEqual(locks, [true, false]);
  assert.equal(controller.state.working, false);
});

test('preferences survive blocked storage and never make the application unusable', async () => {
  const controller = createUpdateController(async () => idle, {
    storage: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    },
  });
  controller.setAutomatic(false);
  assert.equal(controller.state.automatic, false);
  await controller.initialize();
  assert.equal(controller.state.phase, 'idle');
});

test('malformed IPC metadata, unknown fields and oversized progress are rejected', () => {
  for (const extra of [
    { phase: 'sent' },
    { version: 'https://evil' },
    { notes: 'x'.repeat(12001) },
    { downloaded: -1 },
    { downloaded: 200 * 1024 * 1024 },
    { total: 1, downloaded: 2 },
    { phase: 'available' },
    { url: 'https://evil' },
    { configured: 'yes' },
  ])
    assert.throws(() => validateUpdateStatus({ ...idle, ...extra }));
});

test('a download result cannot replace the release identity selected by the user', async () => {
  const controller = createUpdateController(async (command) => {
    if (command === 'application_update_status' || command === 'check_application_update') return available;
    return { ...downloaded, version: '0.5.0' };
  }, options);
  await controller.initialize();
  await controller.download();
  assert.equal(controller.state.code, 'update_manifest_invalid');
  assert.equal(controller.state.version, '0.4.0');
  assert.equal(controller.state.phase, 'available');
});

test('an old current status cannot disguise a failed fresh check as success', async () => {
  let fail = false;
  const current = { ...idle, phase: 'current' };
  const controller = createUpdateController(async (command) => {
    if (command === 'application_update_status') return current;
    if (fail) throw 'update_network_failed';
    return current;
  }, options);
  await controller.initialize();
  assert.equal(controller.state.phase, 'current');
  fail = true;
  await controller.check();
  assert.equal(controller.state.phase, 'idle');
  assert.equal(controller.state.code, 'update_network_failed');
});
