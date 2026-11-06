import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import original from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const simple = () => {
  const p = structuredClone(original);
  p.cases = p.cases.slice(0, 1);
  p.cases[0].request.attachments = [];
  p.cases[0].request.replyOffer = null;
  p.cases[0].reply = null;
  p.cases[0].receipt = 'none';
  return p;
};
test('offline preparation has no prop warnings and offers XML-compatible variable types', async ({
  page,
}) => {
  const warnings = [];
  page.on('console', (message) => {
    if (/Invalid prop|Unhandled error/.test(message.text())) warnings.push(message.text());
  });
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html?destinations=1');
  await button(page, 'Testwerkzeuge').click();
  await button(page, 'Integration testen').click();
  const xml = structuredClone(original);
  xml.cases = [xml.cases[1]];
  await importPack(page, xml);
  await expect(button(page, 'Neuen Testdurchlauf starten')).toBeDisabled();
  await page.getByText('Variable Angaben und Datensätze', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Feld für variable Angabe', exact: true })
    .selectOption({ index: 1 });
  await button(page, 'Variable Angabe hinzufügen').click();
  const kinds = await page
    .getByRole('combobox', { name: 'Wert erzeugen als', exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  expect(kinds).toEqual(['text', 'date', 'uuid']);
  expect(warnings).toEqual([]);
});
test('a local case opens the capture dialog and creates a portable test without writes', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await button(page, 'Fiktiver Antrag auf Testleistung').click();
  await button(page, 'Als Test wiederverwenden').click();
  const dialog = page.getByRole('dialog', { name: 'Test aus Vorgang erstellen', exact: true });
  await expect(dialog).toBeVisible();
  const loadOffer = dialog.getByRole('button', { name: 'Empfängerangebot laden', exact: true });
  expect((await loadOffer.boundingBox()).width).toBeLessThan(400);
  for (const width of [640, 420]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await loadOffer.boundingBox()).height).toBeGreaterThanOrEqual(42);
    const audit = await new AxeBuilder({ page }).include('.scenario-capture').analyze();
    expect(audit.violations.map((v) => v.id)).toEqual([]);
  }
  await dialog.getByRole('textbox', { name: 'Testname', exact: true }).fill('Fiktiver Vorgang als Test');
  await dialog.getByRole('textbox', { name: 'Leistungskennung', exact: true }).fill('urn:test:leistung');
  await dialog.getByLabel('Fachdaten-Schema', { exact: true }).fill('urn:test:antrag');
  await dialog.getByRole('button', { name: 'Test zur Bearbeitung öffnen', exact: true }).click();
  await expect(dialog).toBeHidden();
  const pack = await page.evaluate(() => window.__caseFixture.capturedTest);
  expect(pack.name).toBe('Fiktiver Vorgang als Test');
  expect(pack.cases[0].request.attachments).toHaveLength(2);
  expect(pack.cases[0].schemas).toHaveLength(1);
  expect(JSON.stringify(pack)).not.toContain('clientSecret');
});
async function open(page, api = 'v3') {
  await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
  await button(page, 'Integration testen').click();
}
async function importPack(page, p) {
  await page.locator('#scenario-import').setInputFiles({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.getByRole('textbox', { name: 'Testname', exact: true })).toHaveValue(p.name);
}
test('recipient offers recover from missing reply schemas and discard a late result after API changes', async ({
  page,
}) => {
  await open(page);
  await button(page, 'Einreichung mit Antwort').click();
  await page.evaluate(() => {
    const base = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== 'load_send_destination') return base(command, args);
      if (window.__holdOffer)
        await new Promise((resolve) => {
          window.__releaseOffer = resolve;
        });
      const schema = { schemaUri: 'urn:test:angebot', mimeType: 'application/json' };
      const service = { identifier: 'urn:test:leistung', submissionSchemas: [schema] };
      const document = {
        destinationId: args.destinationId,
        publicServices: [
          { ...service, name: 'Ohne Antwort', replyChannels: {} },
          {
            ...service,
            identifier: 'urn:test:mit-antwort',
            name: 'Mit Antwort',
            replyChannels: {
              fitConnect: { supportedSchemas: [{ ...schema, schemaUri: 'urn:test:antwort' }] },
            },
          },
        ],
      };
      return {
        apiVersion: args.apiVersion,
        sessionId: args.sessionId,
        environment: 'TEST',
        data: { destinationId: args.destinationId, detailsJson: JSON.stringify(document) },
      };
    };
  });
  await page
    .locator('.scenario-preparation')
    .getByText('Sender und Empfänger zuordnen', { exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Empfangs-Destination', exact: true })
    .fill('11111111-1111-4111-8111-111111111111');
  await page.getByText('Angebot der Gegenstelle übernehmen', { exact: true }).click();
  await button(page, 'Aktuelles Empfängerangebot laden').click();
  await button(page, 'Ausgewähltes Angebot übernehmen').click();
  await expect(page.getByRole('alert')).toContainText('kein passendes Antwortschema');
  await page.getByRole('combobox', { name: 'Leistungsangebot', exact: true }).selectOption('1');
  await button(page, 'Ausgewähltes Angebot übernehmen').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Schema-Kennung', { exact: true })).toHaveValue('urn:test:angebot');
  await page.evaluate(() => {
    window.__holdOffer = true;
  });
  await button(page, 'Aktuelles Empfängerangebot laden').click();
  await expect(page.getByText('Empfängerangebot wird geladen …', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'API-Version für diesen Ablauf', exact: true }).selectOption('v2');
  await page.evaluate(() => window.__releaseOffer());
  await expect(page.getByText('Empfängerangebot wird geladen …', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Leistungsangebot', exact: true })).toHaveCount(0);
});
async function record(page, direction, wrong = false) {
  await page.evaluate(
    ({ direction, wrong, data }) => {
      const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
      window.__integration.data = data;
      window.__integration.wrong = wrong;
      window.__integration.records = [
        {
          recordId: id(direction === 'sent' ? 20 : 21),
          revision: id(22),
          kind: 'submission',
          direction,
          status: direction === 'sent' ? 'sent' : 'verified',
          createdAt: new Date().toISOString(),
          title: 'Fiktiver Test',
          caseId: id(23),
          submissionId: id(24),
          replyId: null,
          destinationId: id(25),
          totalBytes: 100,
          warnings: [],
        },
      ];
    },
    { direction, wrong, data: simple().cases[0].request.data },
  );
  await button(page, 'Nachweise aktualisieren').click();
  await expect(
    page.getByRole('combobox', { name: 'Nachricht für diesen Testschritt', exact: true }),
  ).not.toHaveValue('');
  await button(page, 'Ausgewählte Nachricht prüfen').click();
}
for (const api of ['v2', 'v3'])
  test(`guided runs persist failures and compare with protected references (${api})`, async ({ page }) => {
    await open(page, api);
    await importPack(page, simple());
    await button(page, 'Neuen Testdurchlauf starten').click();
    await expect(page.getByRole('heading', { name: 'Einreichung senden', exact: true })).toBeVisible();
    await record(page, 'sent');
    await record(page, 'received');
    await record(page, 'received');
    await expect(
      page.getByText('3 von 3 Schritten automatisch nachgewiesen.', { exact: false }),
    ).toBeVisible();
    await button(page, 'Als Referenz festlegen').click();
    await expect(button(page, 'Referenz aufheben')).toBeVisible();
    await button(page, 'Vorbereitung').click();
    await button(page, 'Neuen Testdurchlauf starten').click();
    await record(page, 'sent', true);
    await button(page, 'Ergebnisse').click();
    await expect(page.locator('.scenario-check.failed')).toContainText('Fehlgeschlagen');
    await page.getByText(/Gespeicherte Durchläufe und Referenzen/).click();
    const choice = page.getByRole('combobox', { name: 'Durchlauf auswählen', exact: true });
    const reference = await choice
      .locator('option')
      .filter({ hasText: /Referenz ·/ })
      .getAttribute('value');
    await choice.selectOption(reference);
    await button(page, 'Mit aktuellem Durchlauf vergleichen').click();
    await expect(page.getByText(/Neue Abweichung/)).toBeVisible();
    await button(page, 'Durchlauf löschen').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Referenz');
    const writes = await page.evaluate(() =>
      window.__integration.calls.filter((c) =>
        ['execute_send', 'execute_receipt', 'execute_reply'].includes(c.command),
      ),
    );
    expect(writes).toEqual([]);
  });
test('variable editing, variants, selected expectations and legacy imports stay local', async ({ page }) => {
  await open(page);
  await button(page, 'Einreichung mit Antwort').click();
  await page.getByText('Variable Angaben und Datensätze', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Feld für variable Angabe', exact: true })
    .selectOption('/antragstellendePerson/vorname');
  await button(page, 'Variable Angabe hinzufügen').click();
  await page.getByRole('combobox', { name: 'Wert erzeugen als', exact: true }).selectOption('uuid');
  await button(page, 'Datensatz hinzufügen').click();
  await expect(
    page
      .getByRole('combobox', { name: 'Datensatz für den nächsten Durchlauf', exact: true })
      .locator('option'),
  ).toHaveCount(2);
  await page.getByText('Prüferwartungen anpassen', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Feld für Erwartung', exact: true }).selectOption('/anliegen');
  await button(page, 'Erwartung hinzufügen').click();
  await page.getByRole('combobox', { name: 'Inhaltsvergleich', exact: true }).selectOption('rules');
  await expect(page.getByText(/Andere Fachdatenfelder werden nicht verglichen/)).toBeVisible();
  await button(page, 'Test speichern').click();
  await expect(page.getByRole('status')).toContainText('dauerhaft');
  const calls = await page.evaluate(() => window.__integration.calls.map((c) => c.command));
  expect(calls).not.toContain('prepare_send');
  expect(calls).not.toContain('execute_send');
});
test('waiting remains cancellable after navigation and stops on profile change', async ({ page }) => {
  await open(page);
  const p = simple();
  await importPack(page, p);
  await page
    .getByRole('combobox', { name: 'Welche Gegenstelle testen Sie?', exact: true })
    .selectOption('receiver');
  await button(page, 'Neuen Testdurchlauf starten').click();
  await button(page, 'Auf Nachweis warten').click();
  await expect(button(page, 'Warten beenden')).toBeVisible();
  await button(page, 'Virenscan').first().click();
  await button(page, 'Werkzeuge').click();
  await button(page, 'Warten beenden').click();
  await expect(page.getByText('Warten beendet', { exact: true })).toBeVisible();
  await button(page, 'Auf Nachweis warten').click();
  await button(page, 'Anderes Profil').click();
  await expect(button(page, 'Warten beenden')).toHaveCount(0);
});
test('new testing surfaces reflow in the real application and expose accessible controls', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html?destinations=1');
  await button(page, 'Testwerkzeuge').click();
  await button(page, 'Integration testen').click();
  await button(page, 'Einreichung mit Antwort').click();
  for (const width of [1280, 640, 420]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page })
        .include('.scenario-workspace')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
