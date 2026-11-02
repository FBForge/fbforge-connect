import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceScope, exerciseAcceptance } from '../scripts/live-acceptance-scope.mjs';

test('default acceptance still requires the SDK matrix before all installed UI checks', async () => {
  const calls = [];
  const result = await exerciseAcceptance(acceptanceScope({ installer: 'validated-setup.exe' }), {
    native: async () => calls.push('native'),
    desktop: async () => calls.push('desktop'),
  });
  assert.deepEqual(calls, ['native', 'desktop']);
  assert.equal(result, 'combined');
  calls.length = 0;
  const nativeOnly = await exerciseAcceptance(acceptanceScope(), {
    native: async () => calls.push('native'),
    desktop: async () => assert.fail('no installer selected'),
  });
  assert.deepEqual(calls, ['native']);
  assert.equal(nativeOnly, 'native_only');
});

test('explicit UI-only acceptance requires a validated installer and reports its narrower scope', async () => {
  assert.throws(() => acceptanceScope({ uiOnly: true }), /ui_only_requires_validated_installer/);
  const calls = [];
  const result = await exerciseAcceptance(
    acceptanceScope({ uiOnly: true, installer: 'validated-setup.exe' }),
    {
      native: async () => assert.fail('separate SDK matrix is not this scope'),
      desktop: async () => calls.push('desktop'),
    },
  );
  assert.deepEqual(calls, ['desktop']);
  assert.equal(result, 'installed_ui_only');
});

test('failures propagate without retries or declaring an unexecuted UI test successful', async () => {
  let calls = 0;
  await assert.rejects(
    exerciseAcceptance(acceptanceScope({ installer: 'validated-setup.exe' }), {
      native: async () => {
        calls++;
        throw new Error('upstream_http_500');
      },
      desktop: async () => assert.fail('must preserve default fail-fast behavior'),
    }),
    /upstream_http_500/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    exerciseAcceptance(acceptanceScope({ uiOnly: true, installer: 'validated-setup.exe' }), {}),
    /desktop_acceptance_missing/,
  );
});
