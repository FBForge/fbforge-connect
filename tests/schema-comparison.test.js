import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSchemas } from '../frontend/src/schema-comparison.js';
test('JSON schema comparison identifies required fields, enum restrictions and retains unknown rules', () => {
  const before = {
    type: 'object',
    properties: { name: { type: 'string' }, status: { enum: ['offen', 'fertig'] } },
  };
  const after = {
    ...before,
    required: ['name'],
    properties: {
      ...before.properties,
      status: { enum: ['fertig'] },
      neu: { type: 'boolean', 'x-rule': 'custom' },
    },
  };
  const result = compareSchemas(JSON.stringify(before), JSON.stringify(after));
  assert.ok(
    result.changes.some(
      (item) => item.path === '#/properties/name' && item.reason === 'Jetzt ein Pflichtfeld',
    ),
  );
  assert.ok(result.changes.some((item) => item.reason === 'Auswahlwerte entfernt'));
  assert.ok(result.changes.some((item) => item.after?.['x-rule'] === 'custom'));
  assert.match(result.note, /kein vollständiger Kompatibilitätsnachweis/);
});
test('comparison ignores JSON property and set order but includes composition and reference changes', () => {
  assert.equal(
    compareSchemas(
      '{"type":["null","string"],"enum":["a","b"]}',
      '{"enum":["b","a"],"type":["string","null"]}',
    ).changes.length,
    0,
  );
  const result = compareSchemas('{"allOf":[{"$ref":"urn:one"}]}', '{"allOf":[{"$ref":"urn:two"}]}');
  assert.equal(result.changes[0].reason, 'Schema-Referenz geändert');
});
test('XSD comparison resolves namespace aliases and exposes sequence order and cardinality changes', () => {
  const xsd = (prefix, fields) =>
    `<${prefix}:schema xmlns:${prefix}="http://www.w3.org/2001/XMLSchema"><${prefix}:element name="antrag"><${prefix}:complexType><${prefix}:sequence>${fields.replaceAll('xs:', `${prefix}:`)}</${prefix}:sequence></${prefix}:complexType></${prefix}:element></${prefix}:schema>`;
  const fields =
    '<xs:element name="a" type="xs:string" minOccurs="0"/><xs:element name="b" type="xs:string"/>';
  assert.equal(compareSchemas(xsd('xs', fields), xsd('xsd', fields), 'xsd').changes.length, 0);
  const result = compareSchemas(
    xsd('xs', fields),
    xsd('xs', fields.replace('minOccurs="0"', 'minOccurs="1"')),
    'xsd',
  );
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].reason, 'Untergrenze verschärft');
  assert.ok(
    compareSchemas(
      xsd('xs', fields),
      xsd(
        'xs',
        '<xs:element name="b" type="xs:string"/><xs:element name="a" type="xs:string" minOccurs="0"/>',
      ),
      'xsd',
    ).changes.length > 0,
  );
});
test('API error objects, malformed or hostile schemas and excessive depth fail closed', () => {
  for (const [source, format] of [
    ['{"result":"error","error":{"code":404}}', 'json'],
    ['<html/>', 'xsd'],
    ['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x/>', 'xsd'],
    ['{"properties":{"a":'.repeat(70) + '{}' + '}}'.repeat(70), 'json'],
  ])
    assert.throws(() => compareSchemas(source, source, format));
});
