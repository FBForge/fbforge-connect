import test from 'node:test';
import assert from 'node:assert/strict';
import { probeSenderRestrictions } from '../scripts/live-sender-restrictions.mjs';

const destination = '11111111-1111-4111-8111-111111111111';
const senderDestination = '22222222-2222-4222-8222-222222222222';
const runName = 'FBForge Connect CI synthetic-test-only';
function fixture({ wrongOwner = false, failV2 = false, definite = false } = {}) {
  const calls = [],
    reports = [],
    apis = [];
  let restriction = { enabled: false, allowedSenders: [], allowedSenderDestinations: [] };
  const options = {
    destination,
    senderDestination,
    runName,
    clientId: 'synthetic',
    clientSecret: 'synthetic-secret',
    report: (line) => reports.push(line),
    exchange: async (api) => {
      apis.push(api);
      if (api === 'v2' && failV2) {
        const error = new Error('not logged: sensitive response');
        error.definiteAuthorizationRejection = definite;
        throw error;
      }
    },
    request: async (url, request) => {
      calls.push({ url, method: request.method, body: request.body });
      assert.equal(request.redirect, 'error');
      if (url.endsWith('/token'))
        return { ok: true, json: async () => ({ access_token: 'synthetic-token' }) };
      assert.equal(url, `https://test.fit-connect.fitko.dev/destination-api/v3/destinations/${destination}`);
      assert.equal(request.headers.Authorization, 'Bearer synthetic-token');
      if (request.method === 'PATCH')
        restriction = { ...restriction, ...JSON.parse(request.body).senderAccessRestricted };
      return {
        ok: true,
        json: async () => ({
          destinationId: destination,
          name: wrongOwner ? 'another destination' : runName,
          senderAccessRestricted: restriction,
        }),
      };
    },
  };
  return { options, calls, reports, apis };
}
test('the live probe checks both SDK versions using only the destination allowlist and restores it', async () => {
  const f = fixture();
  await probeSenderRestrictions(f.options);
  assert.deepEqual(f.apis, ['v2', 'v3']);
  assert.deepEqual(
    f.calls.filter((c) => c.method === 'PATCH').map((c) => JSON.parse(c.body)),
    [
      { senderAccessRestricted: { enabled: true, allowedSenderDestinations: [senderDestination] } },
      { senderAccessRestricted: { enabled: false, allowedSenderDestinations: [] } },
    ],
  );
});
test('a rejected v2 probe still tests v3, restores access configuration and logs no response secrets', async () => {
  const f = fixture({ failV2: true });
  await assert.rejects(probeSenderRestrictions(f.options), /restriction_v2_failed/);
  assert.deepEqual(f.apis, ['v2', 'v3']);
  assert.equal(JSON.parse(f.calls.at(-1).body).senderAccessRestricted.enabled, false);
  assert.doesNotMatch(f.reports.join(' '), /synthetic-token|sensitive|synthetic-secret/);
});
test('a destination outside the isolated fixture cannot be modified', async () => {
  const f = fixture({ wrongOwner: true });
  await assert.rejects(probeSenderRestrictions(f.options), /restriction_fixture_not_owned/);
  assert.equal(
    f.calls.some((c) => c.method === 'PATCH'),
    false,
  );
  assert.deepEqual(f.apis, []);
});

test('even a definite authorization rejection is not retried after successful v3', async () => {
  const f = fixture({ failV2: true, definite: true });
  await assert.rejects(probeSenderRestrictions(f.options), /restriction_v2_failed/);
  assert.deepEqual(f.apis, ['v2', 'v3']);
  assert.equal(JSON.parse(f.calls.at(-1).body).senderAccessRestricted.enabled, false);
});
