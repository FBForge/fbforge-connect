import { requestResource } from './resources.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const fields = [
  'itemId',
  'kind',
  'purpose',
  'keyId',
  'destinationId',
  'caseId',
  'status',
  'fingerprint',
  'expiresAt',
  'removable',
  'blockedReason',
];
const fail = () => {
  throw new Error('engine_protocol_error');
};
function page(value, offset) {
  if (
    !value ||
    Object.keys(value).sort().join() !== 'items,offset,total' ||
    value.offset !== offset ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    value.total > 112 ||
    !Array.isArray(value.items) ||
    value.items.length !== Math.min(20, value.total - offset)
  )
    fail();
  const ids = new Set();
  for (const row of value.items) {
    if (
      !row ||
      Object.keys(row).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(row, field)) ||
      !uuid(row.itemId) ||
      ids.has(row.itemId) ||
      !['imported', 'generated', 'reply'].includes(row.kind) ||
      !['decrypt', 'sign', 'decrypt+sign', 'reply'].includes(row.purpose) ||
      (row.kind === 'generated'
        ? row.purpose !== 'decrypt+sign'
        : row.kind === 'reply'
          ? row.purpose !== 'reply'
          : !['decrypt', 'sign'].includes(row.purpose)) ||
      typeof row.keyId !== 'string' ||
      !row.keyId ||
      row.keyId.length > 1030 ||
      /[\x00-\x1f\x7f]/.test(row.keyId) ||
      !((row.destinationId === null && row.kind === 'generated') || uuid(row.destinationId)) ||
      !(row.caseId === null || (row.kind === 'reply' && uuid(row.caseId))) ||
      !['loaded', 'ready', 'reserved', 'bound', 'pending', 'unresolved', 'recovered'].includes(row.status) ||
      typeof row.fingerprint !== 'string' ||
      !/^[0-9a-f]{64}( \/ [0-9a-f]{64})?$/.test(row.fingerprint) ||
      !(
        row.expiresAt === null ||
        (typeof row.expiresAt === 'string' &&
          row.expiresAt.length <= 64 &&
          Number.isFinite(Date.parse(row.expiresAt)))
      ) ||
      typeof row.removable !== 'boolean' ||
      ![null, 'managed_pair', 'pending_operation', 'unresolved_operation'].includes(row.blockedReason) ||
      row.removable !== (row.blockedReason === null)
    )
      fail();
    ids.add(row.itemId);
  }
  return value;
}
export async function loadKeyInventory(invoke, session) {
  const items = [];
  let total;
  do {
    const result = page(
      await requestResource(invoke, session, 'list_key_inventory', { offset: items.length }),
      items.length,
    );
    if (total !== undefined && result.total !== total) fail();
    total = result.total;
    items.push(...result.items);
  } while (items.length < total);
  if (new Set(items.map((item) => item.itemId)).size !== items.length) fail();
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}
export async function removeInventoryItem(invoke, session, itemId) {
  if (!uuid(itemId)) throw new Error('invalid_input');
  return page(await requestResource(invoke, session, 'remove_key_inventory_item', { itemId }), 0);
}
