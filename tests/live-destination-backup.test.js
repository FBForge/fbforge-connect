import test from 'node:test';
import assert from 'node:assert/strict';
import { probePublicBackup } from '../scripts/live-destination-backup.mjs';
const destination = '11111111-1111-4111-8111-111111111111';
const fixture = () => [
  { kind: 'configuration', value: { destinationId: destination, type: 'A', clientCount: 1 } },
  { kind: 'public_key', value: { kid: 'synthetic-public-key' } },
];
test('actual public snapshot parts retain API metadata for the product validator, including an omitted terminal item', async () => {
  const parts = fixture(),
    calls = [];
  let validated;
  await probePublicBackup({
    destination,
    name: 'Synthetic acceptance',
    engine: {
      async call(command, args) {
        calls.push({ command, args });
        return { offset: args.offset, total: parts.length, item: parts[args.offset] };
      },
    },
    validate: (value) => (validated = value),
  });
  assert.deepEqual(
    calls.map((c) => c.args.offset),
    [0, 1, 2],
  );
  assert.ok(
    calls.every((c) => c.command === 'export_destination_item' && c.args.destinationId === destination),
  );
  assert.equal(validated.configuration.clientCount, 1);
  assert.deepEqual(validated.publicKeys, [parts[1].value]);
  assert.equal(validated.environment, 'TEST');
  assert.equal(validated.sourceDestinationId, destination);
});
test('private, displaced and changing snapshot parts never reach the bridge validator', async () => {
  for (const fault of ['private', 'offset', 'total', 'owner']) {
    const parts = fixture();
    if (fault === 'private') parts[1].kind = 'private_key';
    if (fault === 'owner') parts[0].value.destinationId = 'foreign';
    await assert.rejects(
      probePublicBackup({
        destination,
        name: 'Synthetic acceptance',
        engine: {
          async call(_, { offset }) {
            return {
              offset: fault === 'offset' ? 99 : offset,
              total: fault === 'total' && offset > 0 ? 3 : parts.length,
              item: parts[offset],
            };
          },
        },
        validate: () => assert.fail('invalid transfer reached the bridge'),
      }),
      /public_backup_contract_invalid/,
    );
  }
});
