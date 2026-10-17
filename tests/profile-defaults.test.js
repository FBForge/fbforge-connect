import assert from 'node:assert/strict';
import { getProfileDefaults, saveProfileDefaults } from '../frontend/src/profiles.js';
const session = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  apiVersion: 'v3',
  environment: 'TEST',
  connected: true,
};
const defaults = {
  sourceDestination: '22222222-2222-4222-8222-222222222222',
  receiverDestination: '33333333-3333-4333-8333-333333333333',
};
assert.equal(await getProfileDefaults(async () => null, session), null);
assert.deepEqual(
  await getProfileDefaults(async (command, args) => {
    assert.equal(command, 'get_profile_defaults');
    assert.equal(args.sessionId, session.sessionId);
    return defaults;
  }, session),
  defaults,
);
assert.deepEqual(
  await saveProfileDefaults(
    async (command, args) => {
      assert.equal(command, 'save_profile_defaults');
      assert.deepEqual(args.defaults, defaults);
      return args.defaults;
    },
    session,
    defaults,
  ),
  defaults,
);
assert.deepEqual(
  await saveProfileDefaults(async (_command, args) => args.defaults, session, {
    sourceDestination: null,
    receiverDestination: null,
  }),
  { sourceDestination: null, receiverDestination: null },
);
for (const invalid of [
  { ...defaults, clientSecret: 'must-never-return' },
  { ...defaults, receiverDestination: 'invalid' },
])
  await assert.rejects(
    getProfileDefaults(async () => invalid, session),
    /engine_protocol_error/,
  );
await assert.rejects(
  getProfileDefaults(async () => defaults, { ...session, apiVersion: 'v2' }),
  /engine_protocol_error/,
);
await assert.rejects(
  saveProfileDefaults(
    async () => ({ sourceDestination: null, receiverDestination: null }),
    session,
    defaults,
  ),
  /engine_protocol_error/,
);
await assert.rejects(
  getProfileDefaults(async () => defaults, { ...session, connected: false }),
  /session_missing/,
);
console.log('Protected-profile UUID defaults validate native results and preserve explicit clearing');
