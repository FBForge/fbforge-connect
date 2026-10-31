import test from 'node:test';
import assert from 'node:assert/strict';
import { probeReplyOffers } from '../scripts/live-destination-offers.mjs';
const destination = '11111111-1111-4111-8111-111111111111';
const runName = 'FBForge Connect CI fiktive-abnahme';
function fixture(uncertain = false) {
  const original = {
    publicServices: [
      {
        identifier: 'urn:test:service',
        replyChannels: { fitConnect: { processStandards: ['urn:test:reply'] } },
      },
    ],
    processMessages: [],
  };
  const state = {
    api: 'v3',
    writes: 0,
    prepared: [],
    document: {
      destinationId: destination,
      name: runName,
      status: 'active',
      contactJson: '{"unit":"Fiktive Testeinheit"}',
      offersJson: JSON.stringify(original),
    },
  };
  state.call = async (command, args) => {
    if (command === 'load_managed_destination') {
      assert.equal(args.destinationId, destination);
      return structuredClone(state.document);
    }
    if (command === 'prepare_destination_update') {
      const request = JSON.parse(args.destinationDocument);
      assert.deepEqual(request.destinationIds, [destination]);
      assert.deepEqual(Object.keys(request.changes), ['publicServices']);
      state.prepared.push(request.changes.publicServices);
      return { status: 'prepared', attemptId: 'owned-attempt', changes: [{ destinationId: destination }] };
    }
    assert.equal(command, 'execute_destination_update');
    state.writes++;
    const next = structuredClone(state.prepared.at(-1));
    next[0].replyChannels.fitConnect.processStandards.reverse();
    state.document.offersJson = JSON.stringify({ ...original, publicServices: next });
    return { status: uncertain ? 'uncertain' : 'completed', changes: [{ status: 'updated' }] };
  };
  return state;
}
test('live offer probe verifies real transport results by membership and restores only its owned offers', async () => {
  const receiver = fixture();
  const before = receiver.document.offersJson;
  await probeReplyOffers({ receiver, destination, runName, report() {} });
  assert.equal(receiver.writes, 2);
  assert.equal(receiver.document.offersJson, before);
});
test('an uncertain offer update is never restored or automatically repeated', async () => {
  const receiver = fixture(true);
  await assert.rejects(
    probeReplyOffers({ receiver, destination, runName }),
    /live_offers_update_not_confirmed/,
  );
  assert.equal(receiver.writes, 1);
  assert.equal(receiver.prepared.length, 1);
});
test('live offer probe refuses a destination belonging to another run before preparing any write', async () => {
  const receiver = fixture();
  receiver.document.name = 'Andere Testdestination';
  await assert.rejects(
    probeReplyOffers({ receiver, destination, runName }),
    /live_offers_destination_not_owned/,
  );
  assert.equal(receiver.writes, 0);
  assert.equal(receiver.prepared.length, 0);
});

test('live offer probe refuses unsupported API scope before any preparation', async () => {
  const receiver = fixture();
  receiver.api = 'v2';
  await assert.rejects(probeReplyOffers({ receiver, destination, runName }), /live_offers_scope_denied/);
  assert.equal(receiver.writes, 0);
  assert.equal(receiver.prepared.length, 0);
});
