// TEST acceptance only. Mutate and restore only the destination created by this exact run.
import { isDeepStrictEqual } from 'node:util';
const check = (value, code) => {
  if (!value) throw new Error(code);
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export async function probeReplyOffers({ receiver, destination, runName, report = console.log }) {
  check(
    receiver.api === 'v3' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(destination) &&
      runName.startsWith('FBForge Connect CI '),
    'live_offers_scope_denied',
  );
  const before = await receiver.call('load_managed_destination', { destinationId: destination });
  check(before.destinationId === destination && before.name === runName, 'live_offers_destination_not_owned');
  const original = JSON.parse(before.offersJson);
  check(original.publicServices?.length > 0, 'live_offers_service_missing');
  const updated = structuredClone(original.publicServices);
  const uri = 'urn:fbforge:connect:ci:offer-probe:1';
  const standards = updated[0].replyChannels?.fitConnect?.processStandards;
  check(
    Array.isArray(standards) && standards.length > 0 && !standards.includes(uri),
    'live_offers_fixture_invalid',
  );
  standards.push(uri);
  async function commit(publicServices) {
    const preview = await receiver.call('prepare_destination_update', {
      destinationDocument: JSON.stringify({ destinationIds: [destination], changes: { publicServices } }),
    });
    check(
      preview.status === 'prepared' &&
        preview.changes.length === 1 &&
        preview.changes[0].destinationId === destination,
      'live_offers_preview_invalid',
    );
    const result = await receiver.call('execute_destination_update', { attemptId: preview.attemptId });
    check(
      result.status === 'completed' && result.changes.length === 1 && result.changes[0].status === 'updated',
      'live_offers_update_not_confirmed',
    );
    return receiver.call('load_managed_destination', { destinationId: destination });
  }
  const after = await commit(updated);
  const offers = JSON.parse(after.offersJson);
  check(
    isDeepStrictEqual(canonical(offers), canonical({ ...original, publicServices: updated })),
    'live_offers_readback_mismatch',
  );
  // Restore only after a confirmed successful write. An uncertain outcome must never be retried.
  const restored = await commit(original.publicServices);
  check(
    isDeepStrictEqual(canonical(JSON.parse(restored.offersJson)), canonical(original)),
    'live_offers_restore_mismatch',
  );
  for (const view of [after, restored])
    check(
      view.name === before.name &&
        view.status === before.status &&
        view.type === before.type &&
        isDeepStrictEqual(canonical(view.metadataVersions), canonical(before.metadataVersions)) &&
        isDeepStrictEqual(JSON.parse(view.contactJson), JSON.parse(before.contactJson)),
      'live_offers_unselected_fields_changed',
    );
  report(
    'Real TEST reply-schema registration, normalized response verification, private API readback and confirmed restoration passed',
  );
}
