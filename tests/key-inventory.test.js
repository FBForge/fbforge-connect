import assert from 'node:assert/strict';
import { loadKeyInventory, removeInventoryItem } from '../frontend/src/key-inventory.js';
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const session = { apiVersion: 'v3', sessionId: id(1), environment: 'TEST', connected: true };
const row = (n) => ({
  itemId: id(n),
  kind: 'imported',
  purpose: 'decrypt',
  keyId: `key-${n}`,
  destinationId: id(2),
  caseId: null,
  status: 'loaded',
  fingerprint: 'a'.repeat(64),
  expiresAt: '2027-01-01T00:00:00Z',
  removable: true,
  blockedReason: null,
});
const response = (data) => ({ apiVersion: 'v3', sessionId: session.sessionId, environment: 'TEST', data });
const list = Array.from({ length: 21 }, (_, i) => row(i + 10));
const offsets = [];
const actual = await loadKeyInventory(async (command, args) => {
  assert.equal(command, 'list_key_inventory');
  offsets.push(args.offset);
  return response({
    offset: args.offset,
    total: list.length,
    items: list.slice(args.offset, args.offset + 20),
  });
}, session);
assert.equal(actual.length, 21);
assert.deepEqual(offsets, [0, 20]);
assert.ok(Object.isFrozen(actual[0]));
for (const edit of [
  (r) => ({ ...r, privateJwk: 'synthetic-private-material' }),
  (r) => ({ ...r, removable: false, blockedReason: null }),
  (r) => ({ ...r, fingerprint: 'not-a-public-fingerprint' }),
  (r) => ({ ...r, itemId: 'not-a-native-item' }),
])
  await assert.rejects(
    loadKeyInventory(async () => response({ offset: 0, total: 1, items: [edit(row(10))] }), session),
    /engine_protocol_error/,
  );
await assert.rejects(
  loadKeyInventory(
    async () => ({ ...response({ offset: 0, total: 0, items: [] }), sessionId: id(999) }),
    session,
  ),
  /engine_protocol_error/,
);
await assert.rejects(
  loadKeyInventory(
    async (_command, args) =>
      response({
        offset: args.offset,
        total: args.offset ? 22 : 21,
        items: list.slice(args.offset, args.offset + 20),
      }),
    session,
  ),
  /engine_protocol_error/,
);
let removals = 0;
await removeInventoryItem(
  async (command, args) => {
    assert.equal(command, 'remove_key_inventory_item');
    assert.equal(args.itemId, id(10));
    removals++;
    return response({ offset: 0, total: 0, items: [] });
  },
  session,
  id(10),
);
assert.equal(removals, 1);
await assert.rejects(
  removeInventoryItem(
    async () => {
      throw Error('must not invoke');
    },
    session,
    'invalid',
  ),
  /invalid_input/,
);
console.log('Key inventory paging, native context, public-only records and targeted removal checked');
