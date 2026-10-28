import test from 'node:test';
import assert from 'node:assert/strict';
import { readSchemaReview, schemaSources } from '../frontend/src/schema-review.js';

test('native schema deviations retain exact field paths and do not imply successful validation', () => {
  const error = { path: '/person/alter', keyword: 'type', message: 'Erwartet: integer', line: 0, column: 0 };
  assert.deepEqual(readSchemaReview(JSON.stringify({ validation: { status: 'invalid', errors: [error] } })), {
    status: 'invalid',
    errors: [error],
  });
  for (const validation of [
    { status: 'valid', errors: [error] },
    { status: 'invalid', errors: [] },
    { status: 'invalid', errors: [{ ...error, path: 42 }] },
    { status: 'invalid', errors: Array(129).fill(error) },
  ])
    assert.equal(readSchemaReview(JSON.stringify({ validation })), null);
  assert.equal(readSchemaReview('{bad'), null);
  assert.equal(readSchemaReview(undefined), null);
});

test('the visible schema source excludes received diagnostics and preserves schema references', () => {
  const document = JSON.stringify({
    documents: { 'urn:test:person': { type: 'object' } },
    validation: { status: 'invalid', errors: [] },
  });
  assert.match(schemaSources(document), /urn:test:person/);
  assert.doesNotMatch(schemaSources(document), /validation/);
  assert.equal(
    schemaSources(JSON.stringify({ schemas: [{ name: 'test.xsd', text: '<xs:schema/>' }] })),
    'test.xsd\n<xs:schema/>',
  );
});
