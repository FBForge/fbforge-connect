import { test, expect } from './fixtures.js';

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
