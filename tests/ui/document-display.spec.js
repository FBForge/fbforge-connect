import { test, expect } from '@playwright/test';

test('JSON and inherited XML display types format only proven values and preserve raw source', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(async () => {
    const { parseStructuredData, filterStructuredData } = await import('/src/structured-data.js');
    const { annotateSchema } = await import('/src/schema-annotations.js');
    const { fieldDisplay } = await import('/src/field-display.js');
    const uri = 'urn:test:types';
    const xml =
      '<Antrag xmlns="urn:test:types"><Zustimmung>1</Zustimmung><Geburt>2000-01-02</Geburt><Eingang>2026-10-20T12:30:00+02:00</Eingang><Unbekannt>2000-01-02</Unbekannt></Antrag>';
    const schema =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:test:types" targetNamespace="urn:test:types" elementFormDefault="qualified"><xs:simpleType name="Zusage"><xs:restriction base="xs:boolean"/></xs:simpleType><xs:simpleType name="Tag"><xs:restriction base="xs:date"/></xs:simpleType><xs:element name="Antrag"><xs:complexType><xs:sequence><xs:element name="Zustimmung" type="t:Zusage"/><xs:element name="Geburt" type="t:Tag"/><xs:element name="Eingang" type="xs:dateTime"/><xs:element name="Unbekannt" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema>';
    const model = parseStructuredData(xml, 'xml');
    const original = JSON.stringify(model);
    const annotated = annotateSchema(
      model,
      JSON.stringify({
        schemaPackage: 1,
        schemaUri: uri,
        schemas: [{ name: 'https://schemas.example.test/types.xsd', text: schema, primary: true }],
      }),
      uri,
    );
    const fields = annotated.root.children.filter((node) => node.key !== '@xmlns');
    return {
      values: fields.map(fieldDisplay),
      raw: fields.map((node) => node.value),
      unchanged: original === JSON.stringify(model),
      found: Boolean(filterStructuredData(annotated.root, '02.01.2000')),
      status: annotated.message,
    };
  });
  expect(result.values).toEqual(['Ja', '02.01.2000', '20.10.2026 · 12:30:00+02:00', '2000-01-02']);
  expect(result.raw).toEqual(['1', '2000-01-02', '2026-10-20T12:30:00+02:00', '2000-01-02']);
  expect(result.unchanged).toBe(true);
  expect(result.found).toBe(true);
});

test('inline reading preserves a selected file and editing text, and never prepares a send', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.evaluate(() => {
    window.__inlineCalls = [];
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__inlineCalls.push(command);
      return original(command, args);
    };
  });
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  const text = '{"name":"Erika", "zustimmung":true}';
  await page.locator('#send-data').fill(text);
  await page.getByRole('button', { name: 'Formularansicht', exact: true }).click();
  await expect(page.locator('.draft-inline-preview')).toContainText('Ja');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('#send-data')).toHaveValue(text);
  await page.locator('#send-data-file').setInputFiles({
    name: 'antrag.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"name":"Dateiinhalt"}'),
  });
  await page.getByRole('button', { name: 'Formularansicht', exact: true }).click();
  await expect(page.locator('.draft-inline-preview')).toContainText('Dateiinhalt');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.getByText('antrag.json', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Eingabefeld verwenden', exact: true }).click();
  await expect(page.locator('#send-data')).toHaveValue(text);
  expect(
    await page.evaluate(() =>
      window.__inlineCalls.some((command) => ['prepare_send', 'execute_send'].includes(command)),
    ),
  ).toBe(false);
});
