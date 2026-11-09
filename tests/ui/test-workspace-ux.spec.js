import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import pack from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const base = 'http://127.0.0.1:1420';

test('test tools open one test workspace without overlapping package and flow navigation', async ({
  page,
}) => {
  await page.goto(`${base}/test-fixtures/profiles.html?destinations=1`);
  await button(page, 'Testwerkzeuge').click();
  const tabs = page.getByRole('tablist', { name: 'Testwerkzeuge' });
  await expect(tabs.getByRole('tab')).toHaveText(['Tests', 'Antwortschemas', 'Schema-Vergleich']);
  await expect(page.getByRole('heading', { name: 'Neuen Test vorbereiten', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Anleitung (Website im Browser öffnen)', exact: true }),
  ).toHaveAttribute('href', 'https://fbforge.de/connect/hilfe/0.4/tests');
  await expect(button(page, 'Testpakete')).toHaveCount(0);
  await expect(button(page, 'Testabläufe')).toHaveCount(0);
  await expect(button(page, 'Testfälle und Abläufe')).toHaveCount(0);
  await expect(button(page, 'Test speichern')).toHaveCount(0);
  await expect(page.locator('#scenario-import')).not.toBeVisible();
  await tabs.getByRole('tab', { name: 'Tests', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Antwortschemas', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.getByRole('tab', { name: 'Tests', exact: true })).toBeFocused();
});

test('the overview preserves an edited preparation and opening another test requires consent', async ({
  page,
}) => {
  await page.goto(`${base}/test-fixtures/integration-tools.html?api=v3`);
  await button(page, 'Test vorbereiten').click();
  await page.getByLabel('Testname', { exact: true }).fill('Unfertiger Abnahmetest');
  await button(page, 'Zur Testübersicht').click();
  await button(page, 'Vorbereitung fortsetzen').click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue('Unfertiger Abnahmetest');
  await button(page, 'Zur Testübersicht').click();
  await page.getByLabel('Testvorlage', { exact: true }).selectOption('reject');
  await button(page, 'Test vorbereiten').click();
  const dialog = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await button(page, 'Vorbereitung fortsetzen').click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue('Unfertiger Abnahmetest');
});

for (const width of [1180, 420, 320])
  test(`the single test workspace reflows and remains keyboard accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/test-fixtures/integration-tools.html?api=v3`);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await expect(button(page, 'Test vorbereiten')).toBeVisible();
      const audit = await new AxeBuilder({ page }).include('.test-tools').analyze();
      expect(audit.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await button(page, 'Test vorbereiten').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.test-tools').analyze()).violations).toEqual([]);
  });

test('saved 0.3 test data opens directly in the common workspace without overwriting the original', async ({
  page,
}) => {
  await page.goto(`${base}/test-fixtures/integration-tools.html?api=v3`);
  const id = '11111111-1111-4111-8111-111111111111';
  const original = { ...pack, name: 'Vorhandener Annahmetest' };
  await page.evaluate(
    ({ id, pack }) => {
      window.__integration.savedPacks[id] = structuredClone(pack);
    },
    { id, pack: original },
  );
  await button(page, 'Sammlung aktualisieren').click();
  await page.getByRole('button', { name: `Test öffnen: ${original.name}`, exact: true }).click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue(original.name);
  await page.getByLabel('Testname', { exact: true }).fill('Bearbeitete Kopie');
  await button(page, 'Test speichern').click();
  expect(await page.evaluate((id) => window.__integration.savedPacks[id], id)).toEqual(original);
  await button(page, 'Zur Testübersicht').click();
  await expect(
    page.getByRole('button', { name: 'Test öffnen: Bearbeitete Kopie', exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => window.__integration.calls.map((c) => c.command));
  expect(calls).not.toContain('execute_send');
  expect(calls).not.toContain('execute_receipt');
});

test('the common overview resumes an earlier run with its original proof and preserves the current preparation', async ({
  page,
}) => {
  const old = structuredClone(pack);
  old.cases = [old.cases[0]];
  old.cases[0].reply = null;
  old.cases[0].receipt = 'none';
  old.cases[0].request.attachments = [];
  old.cases[0].request.replyOffer = null;
  await page.goto(`${base}/test-fixtures/integration-tools.html?legacy=flows&api=v3`);
  await page.locator('#test-flow-file').setInputFiles({
    name: 'earlier-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await button(page, 'Durchlauf starten').click();
  const recordId = crypto.randomUUID();
  await page.evaluate(
    ({ recordId, data }) => {
      window.__integration.data = data;
      window.__integration.records = [
        {
          recordId,
          revision: crypto.randomUUID(),
          kind: 'submission',
          direction: 'sent',
          status: 'sent',
          createdAt: new Date().toISOString(),
          title: 'Fiktiver Nachweis',
          caseId: crypto.randomUUID(),
          submissionId: crypto.randomUUID(),
          replyId: null,
          destinationId: crypto.randomUUID(),
          totalBytes: 20,
          warnings: [],
        },
      ];
    },
    { recordId, data: old.cases[0].request.data },
  );
  await button(page, 'Lokale Ergebnisse laden').click();
  await page.getByLabel('Nachricht für diesen Schritt', { exact: true }).selectOption(recordId);
  await button(page, 'Schritt anhand der Inhalte prüfen').click();
  await expect(
    page.getByRole('heading', { name: `Eingang prüfen: ${old.cases[0].name}`, exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(
    () => Object.values(JSON.parse(localStorage.getItem('fixture-test-runs')))[0],
  );
  expect(saved.run.results).toHaveLength(1);
  await page.goto(`${base}/test-fixtures/integration-tools.html?api=v3`);
  await button(page, 'Test vorbereiten').click();
  await page.getByLabel('Testname', { exact: true }).fill('Noch geöffnete Vorbereitung');
  await button(page, 'Zur Testübersicht').click();
  await button(page, 'Früheren Durchlauf öffnen').click();
  await expect(
    page.getByRole('heading', { name: `Eingang prüfen: ${old.cases[0].name}`, exact: true }),
  ).toBeVisible();
  const restored = await page.evaluate(
    () => Object.values(JSON.parse(localStorage.getItem('fixture-test-runs')))[0],
  );
  expect(restored).toEqual(saved);
  await button(page, 'Zur Testübersicht').click();
  await button(page, 'Vorbereitung fortsetzen').click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue('Noch geöffnete Vorbereitung');
  const calls = await page.evaluate(() => window.__integration.calls.map((call) => call.command));
  expect(calls).not.toContain('execute_send');
  expect(calls).not.toContain('execute_receipt');
});
