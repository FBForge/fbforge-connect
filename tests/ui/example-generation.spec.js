import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { namespace, xmlPacket } from '../../frontend/test-fixtures/xml-message-schema.js';
const unavailable = { result: 'error', error: { msg: 'Not Found', code: 404 } };

async function setup(page, reply, options = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    `http://127.0.0.1:1420/test-fixtures/${reply ? 'application-view.html?browser=1' : 'sending.html'}`,
  );
  await page.evaluate(({ mime = 'application/json', packet, nativeError }) => {
    const fixture = (window.__exampleFixture = { calls: [], packet, nativeError });
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      fixture.calls.push(command);
      if (['load_send_schema', 'load_reply_schema'].includes(command) && fixture.nativeError)
        throw fixture.nativeError;
      const result = await original(command, args);
      if (command === 'load_send_destination') {
        const destination = JSON.parse(result.data.detailsJson);
        destination.publicServices[0].submissionSchemas[0].mimeType = mime;
        result.data.detailsJson = JSON.stringify(destination);
      }
      if (command === 'reply_target') result.data.schemas[0].mimeType = mime;
      if (['load_send_schema', 'load_reply_schema'].includes(command)) {
        const uri = result.data.schemaUri;
        const body = fixture.packet || {
          schemaPackage: 1,
          documents: { [uri]: { result: 'error', error: { msg: 'Not Found', code: 404 } } },
        };
        const bytes = new TextEncoder().encode(JSON.stringify({ ...body, schemaUri: uri }));
        Object.assign(result.data, {
          totalBytes: bytes.length,
          byteOffset: 0,
          chunk: btoa(String.fromCharCode(...bytes)),
        });
      }
      return result;
    };
  }, options);
  if (reply) {
    await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
    await page.getByRole('button', { name: 'Antwortmöglichkeiten laden', exact: true }).click();
  } else {
    await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
    await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
    await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
    await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  }
  await page.locator(reply ? '#reply-schema-sources' : '#send-schema-sources').check();
}

for (const reply of [false, true]) {
  const content = reply ? '#reply-data' : '#send-data';
  const buttonName = reply ? 'Fiktiven Antwortentwurf erzeugen' : 'Fiktive Beispieldaten erzeugen';
  test(`${reply ? 'reply' : 'submission'} preserves text and selected files on schema API errors`, async ({
    page,
  }) => {
    await setup(page, reply);
    const original = '{"test":"bereits eingegebene Fachdaten"}';
    await page.locator(content).fill(original);
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Schema|Antwortschema/ })).toContainText(
      'nicht verfügbar',
    );
    await expect(page.locator(content)).toHaveValue(original);
    await expect(page.getByText(/Fiktive.*(?:erzeugt|wurden)/)).toHaveCount(0);
    await page.locator(reply ? '#reply-data-file' : '#send-data-file').setInputFiles({
      name: 'vorhandener-antrag.json',
      mimeType: 'application/json',
      buffer: Buffer.from(original),
    });
    await page.evaluate(() => (window.__exampleFixture.nativeError = 'schema_http_error'));
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'HTTP-Fehler' })).toBeVisible();
    await expect(page.getByText('vorhandener-antrag.json', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Eingabefeld verwenden', exact: true }).click();
    await expect(page.locator(content)).toHaveValue(original);
    const calls = await page.evaluate(() => window.__exampleFixture.calls);
    expect(calls).not.toContain(reply ? 'prepare_reply' : 'prepare_send');
    expect(calls).not.toContain(reply ? 'execute_reply' : 'execute_send');
  });

  test(`${reply ? 'reply' : 'submission'} cancels example replacement without losing text or a selected file`, async ({
    page,
  }) => {
    await setup(page, reply, { mime: 'application/xml', packet: xmlPacket });
    const original = '<vorhanden>Unverändert</vorhanden>';
    await page.locator(content).fill(original);
    await page
      .locator(reply ? '#reply-data-file' : '#send-data-file')
      .setInputFiles({ name: 'bestehend.xml', mimeType: 'application/xml', buffer: Buffer.from(original) });
    const trigger = page.getByRole('button', { name: buttonName, exact: true });
    await trigger.click();
    const chooser = page.getByRole('dialog', { name: 'Fiktive Beispieldaten', exact: true });
    await expect(chooser).toContainText('bisheriger Inhalt');
    await expect(
      chooser.getByRole('button', { name: 'Beispieldaten übernehmen', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(chooser).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByText('bestehend.xml', { exact: false }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Eingabefeld verwenden', exact: true }).click();
    await expect(page.locator(content)).toHaveValue(original);
    expect(
      await page.evaluate(() =>
        window.__exampleFixture.calls.some((command) =>
          ['prepare_send', 'prepare_reply', 'execute_send', 'execute_reply'].includes(command),
        ),
      ),
    ).toBe(false);
  });

  test(`${reply ? 'reply' : 'submission'} requires a specific XML message before replacing existing data`, async ({
    page,
  }, testInfo) => {
    await setup(page, reply, { mime: 'application/xml', packet: xmlPacket });
    const original = '<vorhanden>Unverändert</vorhanden>';
    await page.locator(content).fill(original);
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Fiktive Beispieldaten', exact: true });
    const picker = chooser.getByRole('combobox');
    await expect(picker).toBeFocused();
    await expect(picker).toHaveValue('');
    await expect(page.locator(content)).toHaveValue(original);
    await expect(picker.locator('option')).toHaveCount(3);
    await picker.selectOption({ label: 'Anzeige des Bauvorhabens · genehmigungsfreistellung.anzeige.0600' });
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
    await chooser.getByRole('button', { name: 'Beispieldaten übernehmen', exact: true }).click();
    await expect(page.locator(content)).toHaveValue(/<genehmigungsfreistellung\.anzeige\.0600/);
    const data = await page.locator(content).inputValue();
    expect(data).toContain('<genehmigungsfreistellung.anzeige.0600');
    expect(data).toContain('xmlns="urn:test:building"');
    expect(data).not.toContain('vorgang.transportieren');
    expect(data).toContain('<nachrichtenkopf xmlns=""');
    expect(data.match(/<anzeigender/g)).toHaveLength(2);
    expect(data).toContain('listURI="urn:test:codelist">TEST</anzeigender>');
    expect(data).toContain('standard="Fiktiver Teststandard"');
    expect(data).toContain('version="1.0"');
    expect(data).not.toContain('unbenutzt');
    expect(data).toContain('>0600</nachrichtentyp>');
    expect(data).toContain('>12345</telefon>');
    expect(data).not.toContain('>0100<');
    if (!reply) {
      await page.screenshot({ path: testInfo.outputPath('xml-message-choice.png'), fullPage: true });
      await page.evaluate(() => {
        window.__exampleFixture.packet.schemas[0].text =
          window.__exampleFixture.packet.schemas[0].text.replaceAll(
            'urn:test:building',
            'urn:test:building:changed',
          );
      });
      await page.getByRole('button', { name: buttonName, exact: true }).click();
      await expect(picker).toHaveValue('');
      await expect(picker).toBeFocused();
      await expect(page.locator(content)).toHaveValue(data);
      await chooser.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(page.locator(content)).toHaveValue(data);
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await page.locator('#send-target').fill('33333333-3333-4333-8333-333333333333');
      await expect(picker).toHaveCount(0);
    }
  });
}

test('XML roots, fragments and unsupported structures cannot silently fall back to a transport message', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const result = await page.evaluate(
    async ({ packet, namespace, unavailable }) => {
      const { generateExample, exampleMessages } = await import('/src/generate-example.js');
      const source = JSON.stringify(packet),
        uri = 'urn:test:building';
      const errors = [];
      const attempt = async (source, requested) => {
        try {
          await generateExample(source, 'application/xml', uri, requested);
          errors.push(null);
        } catch (cause) {
          errors.push(cause.message);
        }
      };
      await attempt(source);
      await attempt(source, { name: 'genehmigungsfreistellung.anzeige.0600', namespace: 'urn:stale' });
      await attempt(
        source.replace(
          'genehmigungsfreistellung.anzeige.0600</beschreibung>',
          'unbekannte.nachricht</beschreibung>',
        ),
        { name: 'genehmigungsfreistellung.anzeige.0600', namespace },
      );
      const fragment = await generateExample(
        source,
        'application/xml',
        `${uri}#genehmigungsfreistellung.anzeige.0600`,
      );
      const bound = exampleMessages(
        source,
        'application/xml',
        `${uri}#genehmigungsfreistellung.anzeige.0600`,
      );
      let wrongFragment;
      try {
        await generateExample(source, 'application/xml', `${uri}#genehmigungsfreistellung.anzeige.0600`, {
          name: 'vorgang.transportieren',
          namespace,
        });
      } catch (cause) {
        wrongFragment = cause.message;
      }
      for (const type of [
        '<xs:complexType name="Loop"><xs:sequence><xs:element name="weiter" type="t:Loop"/></xs:sequence></xs:complexType>',
        '<xs:complexType name="Loop"><xs:sequence><xs:element name="fehlend" type="t:Missing"/></xs:sequence></xs:complexType>',
        '<xs:complexType name="Loop"><xs:sequence><xs:any/></xs:sequence></xs:complexType>',
      ])
        await attempt(
          `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${namespace}" targetNamespace="${namespace}">${type}<xs:element name="antrag" type="t:Loop"/></xs:schema>`,
        );
      await attempt(JSON.stringify(unavailable));
      await attempt('<html><body>Not Found</body></html>');
      const single = await generateExample(
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="antrag" type="xs:string"/></xs:schema>',
        'application/xml',
        uri,
      );
      return {
        errors,
        fragment,
        single,
        roots: exampleMessages(source, 'application/xml', uri).roots.map((r) => r.name),
        boundRoots: bound.roots.map((r) => r.name),
        wrongFragment,
      };
    },
    { packet: xmlPacket, namespace, unavailable },
  );
  expect(result.errors).toEqual([
    'xml_message_required',
    'example_unavailable',
    'example_unavailable',
    'example_unavailable',
    'example_unavailable',
    'example_unavailable',
    'schema_unavailable',
    'schema_unavailable',
  ]);
  expect(result.fragment).toContain('<genehmigungsfreistellung.anzeige.0600');
  expect(result.single).toContain('<antrag');
  expect(result.roots).toEqual(['genehmigungsfreistellung.anzeige.0600', 'vorgang.transportieren']);
  expect(result.boundRoots).toEqual(['genehmigungsfreistellung.anzeige.0600']);
  expect(result.wrongFragment).toBe('example_unavailable');
});

test('a context change dismisses the shared example dialog without returning stale data', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/example-dialog.html');
  await page.getByRole('button', { name: 'Beispielauswahl öffnen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Fiktive Beispieldaten', exact: true })).toBeVisible();
  await page.evaluate(() => window.__exampleDialogFixture.changeContext());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__exampleDialogFixture.done)).toBe(true);
  expect(await page.evaluate(() => window.__exampleDialogFixture.result)).toBeNull();
});
