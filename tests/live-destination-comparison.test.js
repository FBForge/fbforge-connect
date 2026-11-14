import test from 'node:test';
import assert from 'node:assert/strict';
import { sameDestinationOffers } from '../scripts/live-destination-comparison.mjs';
const fixture = () => ({
  publicServices: [
    {
      identifier: 'urn:test:one',
      replyChannels: {
        fitConnect: { processStandards: ['urn:test:a', 'urn:test:b'] },
        eMail: { usePgp: true },
      },
    },
    {
      identifier: 'urn:test:two',
      submissionSchemas: [{ schemaUri: 'urn:test:data', mimeType: 'application/json' }],
    },
  ],
  processMessages: [],
});
test('backup readback permits SDK set ordering without changing either source', () => {
  const before = fixture(),
    after = fixture();
  after.publicServices[0].replyChannels.fitConnect.processStandards.reverse();
  after.publicServices.reverse();
  const unchanged = structuredClone(after);
  assert.equal(sameDestinationOffers(before, after), true);
  assert.deepEqual(after, unchanged);
  assert.deepEqual(before, fixture());
});
test('backup readback still rejects missing, changed, additional and duplicate standards', () => {
  for (const values of [
    ['urn:test:a'],
    ['urn:test:a', 'urn:test:changed'],
    ['urn:test:a', 'urn:test:b', 'urn:test:c'],
    ['urn:test:a', 'urn:test:b', 'urn:test:b'],
  ]) {
    const after = fixture();
    after.publicServices[0].replyChannels.fitConnect.processStandards = values;
    assert.equal(sameDestinationOffers(fixture(), after), false);
  }
});
test('backup readback rejects changed channel options, services and process messages', () => {
  for (const change of [
    (doc) => {
      doc.publicServices[0].replyChannels.eMail.usePgp = false;
    },
    (doc) => {
      doc.publicServices.pop();
    },
    (doc) => {
      doc.processMessages.push({ identifier: 'urn:test:unexpected' });
    },
  ]) {
    const after = fixture();
    change(after);
    assert.equal(sameDestinationOffers(fixture(), after), false);
  }
});
