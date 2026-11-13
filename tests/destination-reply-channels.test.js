import test from 'node:test';
import assert from 'node:assert/strict';
import { validReplyChannels } from '../frontend/src/destination-reply-channels.js';
test('documented destination reply channels retain independent settings and reject extra fields', () => {
  assert.equal(
    validReplyChannels({
      fitConnect: { processStandards: ['urn:test:reply'] },
      eMail: { usePgp: true },
      deMail: {},
      elster: {},
      fink: {},
      idBundDeMailbox: { useStatusMonitor: false },
    }),
    true,
  );
  assert.equal(validReplyChannels(null), true);
  for (const value of [
    {},
    { unknown: {} },
    { eMail: { secret: 'no' } },
    { eMail: { usePgp: 'true' } },
    { idBundDeMailbox: {} },
    { deMail: { url: 'https://example.invalid' } },
    { fitConnect: { processStandards: [] } },
  ])
    assert.equal(validReplyChannels(value), false);
});
