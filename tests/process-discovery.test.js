import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProcessDestinations } from '../frontend/src/process-discovery.js';
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
const selection = { processModelId: 'urn:test:model', messageId: 'request-more' };
const page = {
  ...selection,
  region: 'DE',
  offset: 0,
  totalCount: 1,
  destinations: [
    {
      destinationId: id(2),
      type: 'A',
      schemas: [{ schemaUri: 'urn:test:reply', mimeType: 'application/json' }],
      serviceIdentifiers: [],
    },
  ],
};
const wrap = (data) => ({ apiVersion: 'v3', sessionId: id(1), environment: 'TEST', data });
test('public lookup binds both process IDs and region; no write operation is invoked', async () => {
  const result = await searchProcessDestinations(
    async (command, args) => {
      assert.equal(command, 'search_process_destinations');
      assert.deepEqual(JSON.parse(args.destinationDocument), { ...selection, region: 'DE', offset: 0 });
      return wrap(page);
    },
    session,
    selection,
  );
  assert.equal(result.destinations[0].destinationId, id(2));
  assert.ok(Object.isFrozen(result.destinations[0]));
  for (const patch of [{ messageId: 'other' }, { region: 'DE1' }, { offset: 20 }, { totalCount: 0 }])
    await assert.rejects(
      searchProcessDestinations(async () => wrap({ ...page, ...patch }), session, selection),
      /engine_protocol_error/,
    );
  await assert.rejects(
    searchProcessDestinations(
      () => assert.fail('v2 must not search'),
      { ...session, apiVersion: 'v2' },
      selection,
    ),
    /invalid_input/,
  );
  await assert.rejects(
    searchProcessDestinations(
      async () =>
        wrap({ ...page, destinations: [page.destinations[0], page.destinations[0]], totalCount: 2 }),
      session,
      selection,
    ),
    /engine_protocol_error/,
  );
});
