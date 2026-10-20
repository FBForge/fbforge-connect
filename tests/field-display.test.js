import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldDisplay } from '../frontend/src/field-display.js';
import { parseStructuredData } from '../frontend/src/structured-data.js';
import { annotateSchema } from '../frontend/src/schema-annotations.js';
test('only typed, valid booleans and dates receive presentation formatting', () => {
  for (const [node, expected] of [
    [{ value: 'true', type: 'boolean' }, 'Ja'],
    [{ value: 'false', type: 'boolean' }, 'Nein'],
    [{ value: 'true', type: 'string' }, 'true'],
    [{ value: '1', schema: { valueType: 'boolean' } }, 'Ja'],
    [{ value: '2024-02-29', schema: { valueType: 'date' } }, '29.02.2024'],
    [{ value: '2025-02-29', schema: { valueType: 'date' } }, '2025-02-29'],
    [{ value: '2026-10-20', type: 'string' }, '2026-10-20'],
    [{ value: '2026-10-20', schema: { valueType: 'date', ambiguous: true } }, '2026-10-20'],
    [{ value: '2026-10-20T12:30:00+02:00', schema: { format: 'date-time' } }, '20.10.2026 · 12:30:00+02:00'],
    [{ value: '2026-10-20T12:30:00Z', schema: { valueType: 'date-time' } }, '20.10.2026 · 12:30:00 UTC'],
    [{ value: '2026-10-20T12:30:00', schema: { format: 'date-time' } }, '2026-10-20T12:30:00'],
    [{ value: '2026-10-20T25:30:00Z', schema: { format: 'date-time' } }, '2026-10-20T25:30:00Z'],
    [{ value: '2026-10-20Z', schema: { valueType: 'date' } }, '2026-10-20Z'],
  ]) {
    const original = JSON.stringify(node);
    assert.equal(fieldDisplay(node), expected);
    assert.equal(JSON.stringify(node), original);
  }
});
test('JSON schema annotations supply unambiguous display types without altering source', () => {
  const text = '{"birth":"2000-01-02","approved":true}';
  const model = parseStructuredData(text, 'json');
  const before = JSON.stringify(model);
  const uri = 'urn:test:form';
  const result = annotateSchema(
    model,
    JSON.stringify({
      schemaPackage: 1,
      schemaUri: uri,
      documents: {
        [uri]: {
          type: 'object',
          properties: { birth: { type: 'string', format: 'date' }, approved: { type: 'boolean' } },
        },
      },
    }),
    uri,
  );
  assert.deepEqual(result.root.children.map(fieldDisplay), ['02.01.2000', 'Ja']);
  assert.equal(JSON.stringify(model), before);
});

test('a JSON schema cannot make invalid string or numeric booleans appear as valid answers', () => {
  const text = '{"numeric":1,"string":"true","valid":true}';
  const uri = 'urn:test:boolean-types';
  const model = parseStructuredData(text, 'json');
  const before = JSON.stringify(model);
  const result = annotateSchema(
    model,
    JSON.stringify({
      schemaPackage: 1,
      schemaUri: uri,
      documents: {
        [uri]: {
          type: 'object',
          properties: {
            numeric: { type: 'boolean' },
            string: { type: 'boolean' },
            valid: { type: 'boolean' },
          },
        },
      },
    }),
    uri,
  );
  assert.deepEqual(result.root.children.map(fieldDisplay), ['1', 'true', 'Ja']);
  assert.equal(JSON.stringify(model), before);
});
