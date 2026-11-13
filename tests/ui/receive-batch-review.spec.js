import { test, expect } from './fixtures.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { openBatch } from '../../frontend/test-fixtures/message-batch.js';

const screenshots = process.env.FBFORGE_QA_SCREENSHOTS || 'test-results/receive-review';
test.beforeEach(async () => {
  await mkdir(screenshots, { recursive: true });
});

for (const api of ['v2', 'v3']) {
  test(`inbox asks for public schemas and explicitly accepts schema problems (${api})`, async ({ page }) => {
    await openBatch(page, { api });
    await page.evaluate(() =>
      Object.assign(window.__batchFixture, { requirePublicSchemas: true, schemaMismatch: true }),
    );
    await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
    await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
    const batch = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
    await expect(
      batch.getByRole('checkbox', { name: 'Trotz Schemaabweichungen annehmen und diese als Problem melden' }),
    ).not.toBeChecked();
    await batch
      .getByRole('checkbox', { name: 'Trotz Schemaabweichungen annehmen und diese als Problem melden' })
      .check();
    await batch.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben' }).check();
    await page.screenshot({ path: join(screenshots, 'receive-batch-confirmation.png') });
    await batch.getByRole('button', { name: 'Zielordner wählen und starten' }).click();
    const consent = page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?' });
    await expect(consent).toBeVisible();
    expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
    await consent.getByRole('button', { name: 'Für diese Verbindung erlauben' }).click();
    await expect(
      batch.getByText('Gespeichert und mit Schemaabweichungen angenommen', { exact: true }),
    ).toHaveCount(3);
    const state = await page.evaluate(() => window.__batchFixture);
    expect(state.writes).toHaveLength(3);
    expect(
      state.calls.filter((c) => c.command === 'execute_receipt').every((c) => c.reviewConfirmed === true),
    ).toBe(true);
    expect(
      state.calls.filter(
        (c) => c.command === 'verify_submission' && !JSON.parse(c.schemaDocument).allowExternalSchemas,
      ),
    ).toHaveLength(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('declining public schemas cancels the selected download without saving or accepting', async ({
  page,
}) => {
  await openBatch(page);
  await page.evaluate(() => (window.__batchFixture.requirePublicSchemas = true));
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
  await page.getByRole('button', { name: 'Auswahl herunterladen', exact: true }).click();
  const batch = page.getByRole('dialog', { name: 'Nachrichten herunterladen', exact: true });
  await batch.getByRole('button', { name: 'Zielordner wählen und starten' }).click();
  const consent = page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?' });
  await consent.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(batch.getByRole('button', { name: 'Schließen' })).toBeVisible();
  const state = await page.evaluate(() => window.__batchFixture);
  expect(state.saves).toEqual([]);
  expect(state.writes).toEqual([]);
});

test('single acceptance confirms schema problems in the app and saves before sending', async ({ page }) => {
  await openBatch(page);
  await page.evaluate(() => (window.__batchFixture.schemaMismatch = true));
  await page.getByRole('button', { name: 'Öffnen und prüfen', exact: true }).first().click();
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung annehmen?' });
  await expect(dialog).toContainText('als Problem an FIT-Connect gemeldet');
  await dialog.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern' }).check();
  await page.screenshot({ path: join(screenshots, 'receive-schema-confirmation.png') });
  await dialog.getByRole('button', { name: 'Speichern und mit Problemen annehmen' }).click();
  await expect(dialog).toBeHidden();
  const state = await page.evaluate(() => window.__batchFixture);
  expect(state.saves).toHaveLength(1);
  expect(state.writes).toHaveLength(1);
  expect(state.calls.find((c) => c.command === 'execute_receipt').reviewConfirmed).toBe(true);
  expect(state.calls.findIndex((c) => c.command === 'export_message')).toBeLessThan(
    state.calls.findIndex((c) => c.command === 'execute_receipt'),
  );
});

test('schema override stays readable in a small dark window with enlarged text', async ({ page }) => {
  await openBatch(page);
  await page.setViewportSize({ width: 420, height: 500 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  const choice = dialog.getByRole('checkbox', {
    name: 'Trotz Schemaabweichungen annehmen und diese als Problem melden',
  });
  await choice.check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Zielordner wählen und starten' })).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(screenshots, 'receive-batch-compact-dark.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
