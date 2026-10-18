import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  await readFile(new URL('../public-schemas/manifest.json', import.meta.url), 'utf8'),
);
const cached = manifest.every((item) =>
  existsSync(new URL('../../frontend/test-fixtures/.public-schema-cache/' + item.file, import.meta.url)),
);

test('official pinned FIM JSON and XML schemas label fictional values without changing originals', async ({
  page,
}) => {
  test.skip(
    !cached,
    'Run node scripts/fetch-public-schemas.mjs to include the pinned public integration fixtures.',
  );
  await page.goto('http://127.0.0.1:1420/test-fixtures/public-schema-view.html');
  await page.waitForFunction(() => typeof window.__inspectPublicSchema === 'function');
  const inputs = {
    json: JSON.stringify({ 'G00000233V1.1': { 'F60000227V1.1': 'Musterfrau', 'F60000228V2.0': 'Erika' } }),
    xml: '<fim:root xmlns:fim="urn:xoev-de:xfall:standard:fim-s00000000159_2.0.0"><fim:G00000000448><fim:G00000000188><fim:F60000000227>Musterfrau</fim:F60000000227><fim:F60000000228>Erika</fim:F60000000228></fim:G00000000188></fim:G00000000448></fim:root>'.replaceAll(
      'fim:root',
      'fim:fim.S00000000159.00000000159002000',
    ),
  };
  for (const item of manifest) {
    const bytes = await readFile(
      new URL('../../frontend/test-fixtures/.public-schema-cache/' + item.file, import.meta.url),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
    const result = await page.evaluate(
      ({ format, text, schema, uri }) => window.__inspectPublicSchema(format, text, schema, uri),
      { format: item.format, text: inputs[item.format], schema: bytes.toString('utf8'), uri: item.url },
    );
    expect(result.unchanged).toBe(true);
    expect(result.status).not.toBe('unavailable');
    expect(result.fields.find((f) => f.value === 'Musterfrau')?.label).toBe('Familienname');
    expect(result.fields.find((f) => f.value === 'Erika')?.label).toBe('Vornamen');
    expect(result.fields.find((f) => f.value === 'Erika')?.schema.sources.length).toBeGreaterThan(0);
  }
});

test('local XML schema annotation regressions preserve namespaces, provenance and ambiguous fallbacks', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/schema-annotations.html');
  await page.waitForFunction(() => Boolean(window.__schemaTestResult));
  const result = await page.evaluate(() => window.__schemaTestResult);
  expect(result.failures).toEqual([]);
  expect(result.checks.length).toBeGreaterThan(10);
});
