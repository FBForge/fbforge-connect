import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationBackupFilename } from '../frontend/src/destination-backup-filename.js';
test('backup filenames include a safe destination name, ID and capture time in Berlin', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  for (const [date, time] of [
    ['2026-11-13T14:05:06Z', '2026-11-13_15-05-06'],
    ['2026-06-13T14:05:06Z', '2026-06-13_16-05-06'],
  ]) {
    assert.equal(
      destinationBackupFilename({
        destinationName: '../Bürgerbüro:*?',
        sourceDestinationId: id,
        capturedAt: Date.parse(date),
      }),
      `Burgerburo_${id}_${time}_Berlin.json`,
    );
  }
});
