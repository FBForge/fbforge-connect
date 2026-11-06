import { test, expect } from './fixtures.js';

test('enumeration annotations use bounded text traversal and cache repeated associations', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(async () => {
    const { xmlExample } = await import('/src/xml-examples.js');
    const schema = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="enum"><xs:restriction base="xs:string"><xs:enumeration value="r"><xs:annotation><xs:appinfo><message>r</message><documentation>${'x'.repeat(64 * 1024)}</documentation></xs:appinfo></xs:annotation></xs:enumeration></xs:restriction></xs:simpleType><xs:element name="r"><xs:complexType><xs:sequence><xs:element name="v" type="enum" minOccurs="100" maxOccurs="100"/></xs:sequence></xs:complexType></xs:element></xs:schema>`;
    const get = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(Node.prototype, 'textContent', {
      ...get,
      get() {
        throw Error('full textContent traversal forbidden');
      },
    });
    try {
      const data = xmlExample([{ name: 'root.xsd', text: schema }], 'urn:test:enum', {
        name: 'r',
        namespace: '',
      });
      return new DOMParser().parseFromString(data.data, 'application/xml').querySelectorAll('v').length;
    } finally {
      Object.defineProperty(Node.prototype, 'textContent', get);
    }
  });
  expect(result).toBe(100);
});

test('repeated XML constraints use bounded hints and a bounded worker request', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(async () => {
    const { generateExample } = await import('/src/generate-example.js');
    const Original = window.Worker;
    const requests = [];
    window.Worker = class extends Original {
      postMessage(value, ...rest) {
        requests.push(value);
        return super.postMessage(value, ...rest);
      }
    };
    try {
      const schema = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="v"><xs:annotation><xs:documentation>${'x'.repeat(128 * 1024)}</xs:documentation></xs:annotation><xs:simpleType><xs:restriction base="xs:string"><xs:minLength value="1"/></xs:restriction></xs:simpleType></xs:element><xs:element name="r"><xs:complexType><xs:sequence minOccurs="2" maxOccurs="2"><xs:element ref="v" minOccurs="100" maxOccurs="100"/></xs:sequence></xs:complexType></xs:element></xs:schema>`;
      const data = await generateExample(schema, 'application/xml', 'urn:test:hints', {
        name: 'r',
        namespace: '',
      });
      const properties = Object.values(JSON.parse(requests[0]).properties);
      return {
        count: properties.length,
        longest: Math.max(...properties.map((p) => p.title.length)),
        bytes: new TextEncoder().encode(requests[0]).length,
        elements: new DOMParser().parseFromString(data, 'application/xml').querySelectorAll('v').length,
      };
    } finally {
      window.Worker = Original;
    }
  });
  expect(result.count).toBe(200);
  expect(result.longest).toBeLessThanOrEqual(1024);
  expect(result.bytes).toBeLessThan(2 * 1024 * 1024);
  expect(result.elements).toBe(200);
});

test('cached XSD group copies consume the shared budget before expanded allocation', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(async () => {
    const { parseStructuredData } = await import('/src/structured-data.js');
    const { annotateSchema } = await import('/src/schema-annotations.js');
    const uri = 'https://schemas.example.test/groups.xsd';
    const refs = (name, count) => Array.from({ length: count }, () => `<xs:group ref="t:${name}"/>`).join('');
    const groups = `<xs:group name="leaf"><xs:sequence><xs:element name="x" minOccurs="0" type="xs:string"/></xs:sequence></xs:group><xs:group name="inner"><xs:sequence>${refs('leaf', 1000)}</xs:sequence></xs:group>`;
    const schema = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:groups" targetNamespace="urn:groups">${groups}<xs:element name="r"><xs:complexType><xs:sequence>${refs('inner', 70)}</xs:sequence></xs:complexType></xs:element></xs:schema>`;
    const model = parseStructuredData('<r xmlns="urn:groups"/>', 'xml');
    return annotateSchema(
      model,
      JSON.stringify({ schemaPackage: 1, schemaUri: uri, schemas: [{ name: uri, text: schema }] }),
      uri,
    );
  });
  expect(result.status).toBe('limited');
  expect(result.matchedCount).toBe(0);
});

test('XML example output is bounded before serialization or repeated default allocation', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(async () => {
    const { xmlExample } = await import('/src/xml-examples.js');
    let serialized = 0;
    const Original = window.XMLSerializer;
    window.XMLSerializer = class extends Original {
      serializeToString(node) {
        serialized++;
        return super.serializeToString(node);
      }
    };
    try {
      const schema = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="r"><xs:complexType><xs:sequence minOccurs="10" maxOccurs="10"><xs:element name="v" minOccurs="20" maxOccurs="20" fixed="${'x'.repeat(16 * 1024)}" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema>`;
      try {
        xmlExample([{ name: 'root.xsd', text: schema }], 'urn:test:output');
        return { code: 'unexpected', serialized };
      } catch (error) {
        return { code: error.message, serialized };
      }
    } finally {
      window.XMLSerializer = Original;
    }
  });
  expect(result).toEqual({ code: 'example_unavailable', serialized: 0 });
});

test('flat XSD provenance visits siblings linearly and preserves exact source positions', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const results = await page.evaluate(async () => {
    const { parseStructuredData } = await import('/src/structured-data.js');
    const { annotateSchema } = await import('/src/schema-annotations.js');
    const uri = 'https://schemas.example.test/flat.xsd';
    return [128, 256, 512].map((count) => {
      let visits = 0;
      class CountingParser {
        parseFromString(text, kind) {
          const document = new DOMParser().parseFromString(text, kind);
          const root = document.documentElement;
          const children = root.children;
          Object.defineProperty(root, 'children', {
            get: () => ({
              *[Symbol.iterator]() {
                for (const child of children) {
                  visits++;
                  yield child;
                }
              },
            }),
          });
          return document;
        }
      }
      const declarations = Array.from(
        { length: count },
        (_, i) => `<xs:element name="e${i}" type="xs:string"/>`,
      ).join('');
      const schema = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:flat"><xs:annotation/>${declarations}</xs:schema>`;
      const model = parseStructuredData(`<e${count - 1} xmlns="urn:flat">fixture</e${count - 1}>`, 'xml');
      const original = JSON.stringify(model);
      const result = annotateSchema(
        model,
        JSON.stringify({ schemaPackage: 1, schemaUri: uri, schemas: [{ name: uri, text: schema }] }),
        uri,
        CountingParser,
      );
      return {
        count,
        visits,
        matched: result.matchedCount,
        location: result.root.schema?.sources[0]?.location,
        unchanged: JSON.stringify(model) === original,
      };
    });
  });
  for (const result of results) {
    expect(result.matched).toBeGreaterThan(0);
    expect(result.unchanged).toBe(true);
    expect(result.location).toBe(`/xs:schema[1]/xs:element[${result.count}]`);
    expect(result.visits).toBeLessThan(8 * (result.count + 1));
  }
  expect(results[2].visits).toBeLessThan(3 * results[1].visits);
});
