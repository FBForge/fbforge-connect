import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import {
  channelTemplate,
  createChannelSchema,
  checkedChannelDefinition,
  schemaIdentifier,
  readChannelFile,
  CHANNEL_FIELD_TYPES,
  CHANNEL_FILE_LIMIT,
} from '../frontend/src/channel-schemas.js';
const file = (value) =>
  new File([typeof value === 'string' ? value : JSON.stringify(value)], 'schema.json', {
    type: 'application/json',
  });
test('all generated field types and examples match the fixture validated by both actual SDK validators', async () => {
  const definition = channelTemplate();
  definition.fields = CHANNEL_FIELD_TYPES.map((type, i) => ({
    name: `field${i}`,
    title: `Test ${type}`,
    type,
    required: true,
  }));
  const generated = createChannelSchema(definition);
  assert.deepEqual(
    generated,
    JSON.parse(
      await readFile(
        new URL('../frontend/test-fixtures/assets/channel-generated.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  assert.equal(generated.schema.additionalProperties, false);
  assert.equal(generated.schema.$id, generated.offer.schemaUri);
  assert.equal(generated.schema.properties.field4.format, 'date');
  assert.deepEqual(await readChannelFile(file(generated.draft), true), definition);
  assert.equal(await readChannelFile(file(generated.schema)), definition.schemaUri);
});
test('status and request templates round-trip as editable definitions without references or writes', () => {
  for (const kind of ['status', 'request']) {
    const v = channelTemplate(kind),
      generated = createChannelSchema(v);
    assert.deepEqual(generated.example.status, v.statuses[0]);
    assert.deepEqual(generated.schema.required, [
      'status',
      ...v.fields.filter((f) => f.required).map((f) => f.name),
    ]);
    assert.equal(JSON.stringify(generated.schema).includes('$ref'), false);
    generated.draft.definition.fields[0].title = 'Changed';
    assert.notEqual(v.fields[0].title, 'Changed');
  }
});
test('authoring refuses ambiguous fields, prototype keys, invalid enum types and excessive definitions', () => {
  const base = channelTemplate();
  for (const fields of [
    [...base.fields, base.fields[0]],
    ...['status', 'constructor', 'prototype', '__proto__'].map((name) => [{ ...base.fields[0], name }]),
    [{ ...base.fields[0], name: ['otherwise-valid'] }],
    [{ ...base.fields[0], required: 'true' }],
    [{ ...base.fields[0], type: 'object' }],
    Array.from({ length: 33 }, (_, n) => ({ ...base.fields[0], name: `field${n}` })),
  ])
    assert.throws(() => checkedChannelDefinition({ ...base, fields }), /channel_schema_invalid/);
  for (const statuses of [
    [],
    ['same', 'same'],
    [['coerced']],
    ['Uppercase'],
    ['too long'],
    Array.from({ length: 17 }, (_, n) => `v${n}`),
  ])
    assert.throws(() => createChannelSchema({ ...base, statuses }), /channel_schema_invalid/);
  assert.throws(() => createChannelSchema({ ...base, extra: true }), /channel_schema_invalid/);
});
test('schema identity cannot be a local path, credential URL, fragment or invalid URI', () => {
  for (const uri of [
    'file:///tmp/schema.json',
    'C:\\schema.json',
    'http://example.invalid/a',
    'https://u:p@example.invalid/a',
    'urn:x:a#part',
    'urn:',
    'https://example.invalid/%ZZ',
    'urn:x:space value',
    'https://example.invalid/<a>',
  ])
    assert.throws(() => schemaIdentifier(uri), /channel_schema_invalid/);
  for (const uri of ['urn:example:reply:1', 'https://example.invalid/replies/v1.schema.json'])
    assert.equal(schemaIdentifier(uri), uri);
});
test('imports reject malformed UTF-8, oversized data and arbitrary schemas passed as editable drafts', async () => {
  for (const source of ['{', 'null', '[]', { type: 'object' }, { type: 'string', $id: 'urn:test:x' }])
    await assert.rejects(readChannelFile(file(source)), /channel_schema_invalid/);
  await assert.rejects(
    readChannelFile(new File([new Uint8Array([255])], 'bad.json')),
    /channel_schema_invalid/,
  );
  await assert.rejects(
    readChannelFile(new File(['x'.repeat(CHANNEL_FILE_LIMIT + 1)], 'large.json')),
    /channel_schema_invalid/,
  );
  await assert.rejects(
    readChannelFile(file(createChannelSchema(channelTemplate()).schema), true),
    /channel_schema_invalid/,
  );
});
