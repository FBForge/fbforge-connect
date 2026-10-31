import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDetailRows } from '../frontend/src/event-details.js';
const type = 'https://schema.fitko.de/fit-connect/events/reject-submission';
test('event overview exposes attachment tags and every rejection problem without executing content', () => {
  const payload = {
    events: {
      [type]: [
        {
          attachments: [{ attachmentId: 'synthetic-id', authenticationTag: 'abc+/=' }],
          problems: [
            {
              type: 'urn:test:technical-error',
              title: 'Technical error',
              detail: 'Falsches Metadatenschema <img src=x>',
              instance: 'other',
            },
            { detail: 'Zweiter Grund' },
          ],
        },
      ],
    },
  };
  const rows = eventDetailRows(JSON.stringify(payload), type);
  assert.ok(rows.some((r) => r.label.includes('Authentifizierungstag') && r.value === 'abc+/='));
  assert.ok(rows.some((r) => r.label.includes('Anlagen-ID') && r.value === 'synthetic-id'));
  assert.ok(rows.some((r) => r.value === 'Falsches Metadatenschema <img src=x>'));
  assert.ok(rows.some((r) => r.value === 'Zweiter Grund'));
  assert.ok(rows.some((r) => r.label.includes('Problem 2')));
  assert.equal(rows[0].label, 'Problem 1 · Beschreibung');
  assert.equal(rows[1].label, 'Problem 2 · Beschreibung');
  assert.ok(rows.some((r) => r.label === 'Anlage 1 · Anlagen-ID'));
  assert.ok(rows.some((r) => r.label === 'Anlage 1 · Authentifizierungstag'));
  assert.ok(rows.every((r) => !r.label.includes('Eintrag')));
  assert.ok(rows[0].path.includes('problems'));
});
test('numeric literals, duplicate fields and deep payloads retain exact original values', () => {
  const raw =
    '{"events":{"' + type + '":{"id":9007199254740993,"id":9007199254740995,"empty":[],"none":null}}}';
  const rows = eventDetailRows(raw, type);
  assert.deepEqual(
    rows.map((r) => r.value),
    ['9007199254740993', '9007199254740995', '[]', 'null'],
  );
  const deep = '['.repeat(20) + '"value"' + ']'.repeat(20);
  assert.equal(eventDetailRows(deep, type)[0].value, deep);
  assert.throws(() => eventDetailRows('{invalid', type));
});
test('several event payloads retain their identity and duplicate tags under concise labels', () => {
  const raw =
    '{"events":{"' +
    type +
    '":[' +
    '{"attachments":[{"attachmentId":"a","authTag":"first","authTag":"second"}],"problems":[{"detail":"Reason A"}]},' +
    '{"attachments":[{"attachmentId":"b","authenticationTag":"other"}],"problems":[{"detail":"Reason B"}]}]}}';
  const rows = eventDetailRows(raw, type);
  assert.equal(rows.find((r) => r.value === 'Reason A').label, 'Ereignis 1 · Problem 1 · Beschreibung');
  assert.equal(rows.find((r) => r.value === 'Reason B').label, 'Ereignis 2 · Problem 1 · Beschreibung');
  assert.deepEqual(
    rows.filter((r) => r.label.includes('Authentifizierungstag')).map((r) => r.value),
    ['first', 'second', 'other'],
  );
});
