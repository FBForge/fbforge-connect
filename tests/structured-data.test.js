import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStructuredData,
  filterStructuredData,
  structuredFormat,
  STRUCTURED_BYTES,
} from '../frontend/src/structured-data.js';
const flatten = (node) => (node ? [node, ...node.children.flatMap(flatten)] : []);

test('form models preserve original JSON values, duplicate fields and precision without mutating input', () => {
  const source =
    '{"personen":[{"vorName":"Erika","kennung":9007199254740993,"betrag":1.2300e+4,"nullWert":null,"leer":"","aktiv":false}],"x":1,"x":2,"__proto__":{"constructor":"<img src=x onerror=alert(1)>"}}';
  const result = parseStructuredData(source, 'json'),
    nodes = flatten(result.root);
  assert.equal(result.status, 'ready');
  assert.equal(nodes.find((n) => n.key === 'vorName').label, 'Vor Name');
  assert.equal(nodes.find((n) => n.key === 'kennung').value, '9007199254740993');
  assert.equal(nodes.find((n) => n.key === 'betrag').value, '1.2300e+4');
  assert.equal(nodes.find((n) => n.key === 'nullWert').type, 'null');
  assert.equal(nodes.find((n) => n.key === 'leer').value, '');
  assert.equal(nodes.find((n) => n.key === 'aktiv').value, 'false');
  assert.deepEqual(
    nodes.filter((n) => n.key === 'x').map((n) => [n.value, n.duplicate]),
    [
      ['1', true],
      ['2', true],
    ],
  );
  assert.equal(nodes.find((n) => n.key === 'constructor').value, '<img src=x onerror=alert(1)>');
  assert.equal(Object.hasOwn(Object.prototype, 'constructor'), true);
  assert.equal(nodes.find((n) => n.key === 'vorName').path, '/personen/0/vorName');
  assert.equal(source.includes('9007199254740993'), true);
});

test('array order, empty containers, scalar roots and escaped JSON pointers remain explicit', () => {
  const result = parseStructuredData('{"a/b~c":["01",{},[],0,-0]}', 'json');
  assert.equal(result.root.children[0].path, '/a~1b~0c');
  assert.deepEqual(
    result.root.children[0].children.map((n) => [n.label, n.value, n.type]),
    [
      ['Eintrag 1', '01', 'string'],
      ['Eintrag 2', '', 'object'],
      ['Eintrag 3', '', 'array'],
      ['Eintrag 4', '0', 'number'],
      ['Eintrag 5', '-0', 'number'],
    ],
  );
  for (const source of ['null', 'false', '9007199254740993', '"Wert"'])
    assert.equal(parseStructuredData(source, 'json').fieldCount, 1);
});

test('search prunes unrelated fields, preserves ancestors and does not turn matching groups into empty values', () => {
  const model = parseStructuredData(
    '{"antragsteller":{"vorname":"Erika","adresse":{"ort":"Teststadt"}},"andere":{"name":"Max"}}',
    'json',
  ).root;
  const before = JSON.stringify(model);
  const result = filterStructuredData(model, 'erika');
  assert.deepEqual(
    flatten(result)
      .filter((n) => !n.children.length)
      .map((n) => n.value),
    ['Erika'],
  );
  const grouped = filterStructuredData(model, 'antragsteller');
  assert.equal(
    flatten(grouped).some((n) => n.value === 'Teststadt'),
    true,
  );
  assert.equal(
    flatten(grouped).some((n) => n.value === 'Max'),
    false,
  );
  assert.equal(filterStructuredData(model, 'missing'), null);
  assert.equal(filterStructuredData(model, ' '), model);
  assert.equal(JSON.stringify(model), before);
});

test('malformed, oversized and deeply nested structures have a bounded fallback', () => {
  assert.equal(parseStructuredData('{"x":', 'json').status, 'invalid');
  for (const text of [
    JSON.stringify('x'.repeat(STRUCTURED_BYTES)),
    '['.repeat(17) + '0' + ']'.repeat(17),
    JSON.stringify(Array(2000).fill(0)),
  ])
    assert.equal(parseStructuredData(text, 'json').status, 'limited');
  assert.equal(parseStructuredData('{}', 'html').status, 'unsupported');
  assert.equal(parseStructuredData(null, 'json').status, 'unsupported');
});

test('DTDs, entity declarations and size limits are rejected before an XML parser is invoked', () => {
  let parsed = 0;
  class Parser {
    parseFromString() {
      parsed++;
      throw new Error('not expected');
    }
  }
  for (const text of [
    '<!DOCTYPE doc SYSTEM "https://example.invalid/remote"><doc/>',
    '<!DOCTYPE x [<!ENTITY e "expand">]><x>&e;</x>',
    '<!ENTITY e SYSTEM "file:///private">',
  ])
    assert.equal(parseStructuredData(text, 'xml', Parser).status, 'blocked');
  assert.equal(parseStructuredData('x'.repeat(STRUCTURED_BYTES + 1), 'xml', Parser).status, 'limited');
  assert.equal(parsed, 0);
  assert.equal(parseStructuredData('<doc/>', 'xml', undefined).status, 'unsupported');
});

test('format selection prefers declared JSON/XML media types and only uses filenames for unspecified text', () => {
  for (const mimeType of ['application/json', 'application/vnd.example+json; charset=UTF-8'])
    assert.equal(structuredFormat({ mimeType, filename: 'data.xml' }), 'json');
  for (const mimeType of ['application/xml', 'text/xml', 'application/vnd.example+xml'])
    assert.equal(structuredFormat({ mimeType, filename: 'data.json' }), 'xml');
  assert.equal(structuredFormat({ filename: 'Antrag.XML' }), 'xml');
  assert.equal(structuredFormat({ mimeType: 'text/plain', filename: 'Antrag.json' }), 'json');
  assert.equal(structuredFormat({ mimeType: 'text/html', filename: 'Antrag.json' }), null);
});

test('both Chromium and Mozilla parser error documents fall back instead of exposing a partial form', () => {
  for (const errorNamespace of [
    'http://www.w3.org/1999/xhtml',
    'http://www.mozilla.org/newlayout/xml/parsererror.xml',
  ]) {
    class Parser {
      parseFromString() {
        return {
          documentElement: { nodeName: 'partial' },
          getElementsByTagNameNS: (namespace) => (namespace === errorNamespace ? [{}] : []),
        };
      }
    }
    assert.equal(parseStructuredData('<broken>', 'xml', Parser).status, 'invalid');
  }
});

test('XML projection preserves namespaces, attribute values, repeated positions and mixed-content spacing', () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value });
  const element = (name, children = [], attributes = []) => ({
    nodeType: 1,
    nodeName: name,
    namespaceURI: 'urn:test:antrag',
    childNodes: children,
    attributes,
  });
  const root = element(
    'a:antrag',
    [element('a:name', [text('Erika')]), text(' '), element('a:name', [text('Alex')])],
    [{ name: 'id', value: '001', namespaceURI: null }],
  );
  class Parser {
    parseFromString() {
      return { documentElement: root, getElementsByTagNameNS: () => [] };
    }
  }
  const result = parseStructuredData('<synthetic/>', 'xml', Parser),
    nodes = flatten(result.root);
  assert.equal(result.status, 'ready');
  assert.equal(nodes.find((n) => n.key === '@id').value, '001');
  assert.deepEqual(
    nodes.filter((n) => n.key === 'a:name').map((n) => [n.value, n.namespace, n.path]),
    [
      ['Erika', 'urn:test:antrag', '/a:antrag[1]/a:name[1]'],
      ['Alex', 'urn:test:antrag', '/a:antrag[1]/a:name[2]'],
    ],
  );
  assert.equal(nodes.find((n) => n.type === 'whitespace').value, ' ');
  assert.equal(nodes.find((n) => n.type === 'whitespace').path, '/a:antrag[1]/text()[1]');
});
