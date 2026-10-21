import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseTestPack,
  serializeTestPack,
  validateTestPack,
  attachmentBytes,
  packFromDraft,
} from '../frontend/src/test-packs.js';
import { parseLocalXml } from '../frontend/src/safe-xml.js';
const source = await readFile(
  new URL('../frontend/src/examples/integration.fctest.json', import.meta.url),
  'utf8',
);
const pack = () => JSON.parse(source);
test('portable test packages retain exact JSON/XML bytes, attachments and reply expectations', () => {
  const parsed = parseTestPack(source);
  assert.deepEqual(parseTestPack(serializeTestPack(parsed)), parsed);
  assert.equal(
    new TextDecoder().decode(attachmentBytes(parsed.cases[0].request.attachments[0])),
    'Fiktiver Nachweis.',
  );
  assert.equal(parsed.cases[1].request.data, pack().cases[1].request.data);
});
test('packages reject credentials, ambiguous attachments, wrong schema IDs and incompatible replies', () => {
  for (const mutate of [
    (p) => (p.clientSecret = 'never-allowed'),
    (p) => (p.cases[0].request.destinationId = 'not-portable'),
    (p) => (p.cases[0].id = null),
    (p) => p.cases.push(structuredClone(p.cases[0])),
    (p) => (p.cases[0].request.attachments[0].fileName = '../secret'),
    (p) => p.cases[0].request.attachments.push(structuredClone(p.cases[0].request.attachments[0])),
    (p) => (p.cases[0].request.attachments[0].base64 = 'invalid-base64'),
    (p) => (p.cases[0].reply.schemaUri = 'urn:anderes-schema'),
    (p) =>
      p.cases[0].schemas.push({
        uri: 'urn:test',
        mimeType: 'application/json',
        content: '{"$id":"urn:anders","type":"object"}',
      }),
    (p) => (p.cases[1].schemas[0].content = '<html/>'),
  ]) {
    const value = pack();
    mutate(value);
    assert.throws(() => validateTestPack(value));
  }
});
test('local schemas have their own size limit and may use historical HTTP identifiers', () => {
  const value = pack();
  const schema = {
    uri: 'http://example.invalid/antrag.schema.json',
    mimeType: 'application/json',
    content: JSON.stringify({
      $id: 'http://example.invalid/antrag.schema.json',
      type: 'object',
      description: 'x'.repeat(600 * 1024),
    }),
  };
  value.cases[0].schemas.push(schema);
  assert.equal(validateTestPack(value), value);
  schema.content = JSON.stringify({ description: 'x'.repeat(2 * 1024 * 1024) });
  assert.throws(() => validateTestPack(value));
  value.cases[0].schemas = [];
  value.cases[0].request.data = JSON.stringify({ text: 'x'.repeat(600 * 1024) });
  assert.throws(() => validateTestPack(value));
});
test('local XML parsing rejects DTDs, entities, malformed documents, excessive depth and multiple roots', () => {
  for (const xml of [
    '<!DOCTYPE antrag [<!ENTITY ex SYSTEM "file:///secret">]><antrag>&ex;</antrag>',
    '<a><b></a>',
    '<a/><b/>',
    '<?test?><a/>',
    '<a>'.repeat(70) + '</a>'.repeat(70),
  ])
    assert.throws(() => parseLocalXml(xml), /xml_invalid/);
  assert.equal(parseLocalXml('<antrag><text>A &amp; B</text></antrag>').children[0].text, 'A & B');
});
test('exporting a draft excludes destinations, Case IDs and all authentication context', async () => {
  const request = pack().cases[0].request;
  const exported = await packFromDraft(
    { ...request, destinationId: 'private-target', caseId: 'private-case', clientSecret: 'private-secret' },
    new File([request.data], 'Antrag.json', { type: request.mimeType }),
    [
      {
        file: new File(['Fiktive Anlage'], 'anlage.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        description: '',
      },
    ],
  );
  const serialized = serializeTestPack(exported);
  for (const marker of ['private-target', 'private-case', 'private-secret'])
    assert.ok(!serialized.includes(marker));
  assert.equal(exported.cases[0].reply, null);
  assert.equal(exported.cases[0].receipt, 'none');
});
