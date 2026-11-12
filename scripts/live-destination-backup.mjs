// Actual SDK snapshot -> actual Rust validator. Nothing is persisted, logged or sent to a renderer.
import { randomUUID } from 'node:crypto';
export async function probePublicBackup({ engine, destination, name: backupName, validate }) {
  const fail = () => {
    throw new Error('public_backup_contract_invalid');
  };
  let total,
    configuration = null;
  const publicKeys = [];
  for (let offset = 0; offset <= 305; offset++) {
    const part = await engine.call('export_destination_item', { destinationId: destination, offset });
    if (
      part.offset !== offset ||
      !Number.isSafeInteger(part.total) ||
      part.total < 1 ||
      part.total > 305 ||
      (total !== undefined && total !== part.total)
    )
      fail();
    total = part.total;
    if (offset === total) {
      if ((part.item !== null && part.item !== undefined) || configuration?.destinationId !== destination)
        fail();
      validate({
        format: 'fbforge-connect-destination-backup',
        version: 2,
        id: randomUUID(),
        name: backupName,
        environment: 'TEST',
        sourceDestinationId: destination,
        capturedAt: Date.now(),
        configuration,
        publicKeys,
      });
      return;
    }
    if (offset === 0 && part.item?.kind === 'configuration') configuration = part.item.value;
    else if (configuration && part.item?.kind === 'public_key' && publicKeys.length < 128)
      publicKeys.push(part.item.value);
    else fail();
  }
  fail();
}
