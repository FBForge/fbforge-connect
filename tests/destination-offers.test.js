import test from 'node:test';
import assert from 'node:assert/strict';
import { validOffers, parseOffers } from '../frontend/src/destination-offers.js';
const offer = {
  identifier: 'urn:de:fim:leika:leistung:99008001014002',
  regions: ['DE'],
  submissionSchemas: [{ schemaUri: 'urn:test:application', mimeType: 'application/json' }],
  replyChannels: { fitConnect: { processStandards: ['urn:test:reply'] } },
};
const value = {
  publicServices: [offer],
  processMessages: [
    {
      processModelId: 'model-1',
      messageId: 'message-1',
      regions: ['DE'],
      schemas: [{ schemaUri: 'https://example.invalid/process.xsd', mimeType: 'application/xml' }],
    },
  ],
};
test('offer editing retains explicit service/process IDs, schema versions and reply channels', () => {
  assert.ok(validOffers(value));
  assert.deepEqual(parseOffers(JSON.stringify(value)), value);
});
test('offer editing rejects duplicate identities, arbitrary API fields and executable or local schema locations', () => {
  for (const bad of [
    { ...value, publicServices: [offer, offer] },
    { ...value, callback: {} },
    { ...value, publicServices: [{ ...offer, clientSecret: 'synthetic' }] },
    {
      ...value,
      publicServices: [
        { ...offer, submissionSchemas: [{ schemaUri: 'file:///secret', mimeType: 'application/json' }] },
      ],
    },
    { ...value, processMessages: [{ ...value.processMessages[0], regions: ['OTHER'] }] },
  ])
    assert.equal(validOffers(bad), false);
  assert.throws(() => parseOffers('{"publicServices":{}}'), /engine_protocol_error/);
});
