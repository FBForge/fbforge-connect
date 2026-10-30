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
  assert.ok(rows.some((r) => r.label.includes('Eintrag 2')));
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
