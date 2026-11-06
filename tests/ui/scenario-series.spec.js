import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { scenario } from '../helpers/scenarios.js';
import { button, openScenario, importScenario, latestRun, proveEvidence } from './scenario-helpers.js';
import { scenarioSteps } from '../../frontend/src/integration/scenarios/model.ts';

const simple = () => {
  const s = scenario();
  s.pack.cases = s.pack.cases.slice(0, 1);
  Object.assign(s.pack.cases[0], { reply: null, receipt: 'none' });
  Object.assign(s.pack.cases[0].request, { replyOffer: null, attachments: [] });
  return s;
};
test('a series starts only the chosen API/dataset and preserves its snapshot and aggregate proof', async ({
  page,
}) => {
  const s = simple();
  s.variants.push({ id: crypto.randomUUID(), name: 'Zweiter Datensatz', values: [] });
  await openScenario(page);
  await importScenario(page, s);
  await page.getByText('Testserien planen und fortsetzen', { exact: true }).click();
  const series = page.locator('.scenario-series');
  await series.getByRole('checkbox', { name: 'API v2', exact: true }).check();
  await series.getByRole('checkbox', { name: 'Zweiter Datensatz', exact: true }).uncheck();
  await button(series, 'Testserie anlegen').click();
  await expect(series.locator('tbody tr')).toHaveCount(2);
  await expect(series.getByText('Nicht ausgeführt', { exact: true })).toHaveCount(2);
  const row = series.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'v3', exact: true }) });
  await button(row, 'Durchlauf starten').click();
  const run = await latestRun(page);
  await expect(button(series, 'Aktuellen Durchlauf zuordnen')).toHaveCount(0);
  for (const step of scenarioSteps(run.definition))
    await proveEvidence(page, step, run.pack.cases[0].request.data);
  await expect(series.getByText('Erfolgreich', { exact: true })).toBeVisible();
  await expect(series.getByText('Nicht ausgeführt', { exact: true })).toHaveCount(1);
  await button(page, 'Vorbereitung').click();
  await page.getByLabel('Testname', { exact: true }).fill('Später geänderte Vorbereitung');
  await expect(series.getByRole('heading', { name: s.name + ' · Testserie', exact: true })).toBeVisible();
  await button(series, 'Prüfstand aktualisieren').click();
  await button(row, 'Ergebnis öffnen').click();
  await expect(page.getByText('Alle Schritte sind bearbeitet.', { exact: false })).toBeVisible();
  const download = page.waitForEvent('download');
  await button(series, 'Serienergebnis exportieren').click();
  const file = await download;
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(await file.path(), 'utf8'));
  expect(exported.rows.map((row) => row.status).sort()).toEqual(['not_started', 'passed']);
  expect(JSON.stringify(exported)).not.toContain('base64');
  await button(series, 'Serie entfernen').click();
  await page.getByText(/Gespeicherte Durchläufe und Referenzen/).click();
  await expect(
    page.getByRole('combobox', { name: 'Durchlauf auswählen', exact: true }).locator('option'),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      window.__integration.calls.filter((c) =>
        ['execute_send', 'execute_receipt', 'execute_reply'].includes(c.command),
      ),
    ),
  ).toEqual([]);
});
test('v3-only series mark v2 as inapplicable and never present it as passed', async ({ page }) => {
  await openScenario(page);
  await button(page, 'Nachforderung und Nachreichung').click();
  await page.getByText('Testserien planen und fortsetzen', { exact: true }).click();
  const series = page.locator('.scenario-series');
  await series.getByRole('checkbox', { name: 'API v2', exact: true }).check();
  await button(series, 'Testserie anlegen').click();
  const row = series.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'v2', exact: true }) });
  await expect(row).toContainText('Nicht anwendbar (API v3 erforderlich)');
  await expect(button(row, 'Durchlauf starten')).toHaveCount(0);
  await expect(series.getByText(/0 von 2 Durchläufen/)).toBeVisible();
});
test('series reject stale context results, recover a missing run and keep failed linkage repairable', async ({
  page,
}) => {
  const s = simple();
  await openScenario(page);
  await importScenario(page, s);
  await page.getByText('Testserien planen und fortsetzen', { exact: true }).click();
  const series = page.locator('.scenario-series');
  await button(series, 'Testserie anlegen').click();
  await button(series, 'Durchlauf starten').click();
  const run = await latestRun(page);
  await page.evaluate(
    async (id) =>
      window.__TAURI_INTERNALS__.invoke('test_library', { request: { action: 'scenario_run_delete', id } }),
    run.id,
  );
  await button(series, 'Prüfstand aktualisieren').click();
  await expect(series.getByText('Durchlauf nicht verfügbar', { exact: true })).toBeVisible();
  await button(series, 'Fehlende Verknüpfung lösen').click();
  await expect(button(series, 'Durchlauf starten')).toBeVisible();
  await button(series, 'Aktuellen Durchlauf zuordnen').click();
  await expect(series.getByRole('alert')).toContainText('unvollständig oder ungültig');
  await expect(button(series, 'Durchlauf starten')).toBeVisible();
  await button(series, 'Weitere Serie vorbereiten').click();
  await page.evaluate(() => {
    const base = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'test_library' && args.request.action === 'scenario_series_save')
        await new Promise((resolve) => (window.__finishSeriesSave = resolve));
      return base(command, args);
    };
  });
  await button(series, 'Testserie anlegen').click();
  await expect.poll(() => page.evaluate(() => typeof window.__finishSeriesSave)).toBe('function');
  await button(page, 'Anderes Profil').click();
  await page.evaluate(() => window.__finishSeriesSave());
  await expect(series.locator('tbody tr')).toHaveCount(0);
  await expect(button(series, 'Testserie anlegen')).toBeEnabled();
});
test('series planning and result tables fit compact screens, large text and both themes', async ({
  page,
}) => {
  await openScenario(page);
  await importScenario(page, simple());
  await page.getByText('Testserien planen und fortsetzen', { exact: true }).click();
  const series = page.locator('.scenario-series');
  await button(series, 'Testserie anlegen').click();
  for (const width of [1280, 640, 420]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page })
        .include('.scenario-series')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
