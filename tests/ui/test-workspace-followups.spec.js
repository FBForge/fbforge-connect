import { preparationPage } from '../../scripts/scenario-navigation.mjs';
import { test, expect } from './fixtures.js';
import { button, openScenario, createScenario, latestRun } from './scenario-helpers.js';

test('test profiles load automatically and explicitly reuse protected credentials for the other API', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.locator('#session-api').selectOption('v2');
  await button(page, 'Verbindung herstellen').click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Testzugang');
  await button(page, 'Anmelden').click();
  await button(page, 'Testwerkzeuge').click();
  await createScenario(page);
  await preparationPage(page, 'Verbindung');
  const sender = page.getByRole('combobox', { name: 'Sender-Profil', exact: true });
  await expect(sender.locator('option', { hasText: 'Testzugang' })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'API-Version für diesen Ablauf', exact: true }).selectOption('v3');
  await expect(sender.locator('option', { hasText: 'für API v3 übernehmen' })).toHaveCount(1);
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(1);
  await sender.selectOption({ label: 'Testzugang · für API v3 übernehmen' });
  await expect.poll(() => page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(2);
  const target = await page.evaluate(() =>
    window.__profilesFixture.profiles.find((p) => p.apiVersion === 'v3'),
  );
  await expect(sender).toHaveValue(target.profileId);
  await expect(page.locator('#session-api')).toHaveValue('v2');
  expect(target.keyCount).toBe(0);
  await page.getByLabel('Empfänger-Profil', { exact: true }).selectOption(target.profileId);
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(2);
});

test('the reply editor follows its enabling checkbox and a closed run remains resumable', async ({
  page,
}) => {
  await openScenario(page);
  await createScenario(page);
  await preparationPage(page, 'Testdaten');
  const checkbox = page.getByRole('checkbox', { name: 'Fachliche Antwort erwarten', exact: true });
  await checkbox.check();
  const selector = page.getByRole('combobox', { name: 'Nachricht bearbeiten', exact: true });
  expect((await selector.boundingBox()).y).toBeGreaterThan((await checkbox.boundingBox()).y);
  await preparationPage(page, 'Verbindung');
  await page
    .getByRole('combobox', { name: 'Welche Gegenstelle testen Sie?', exact: true })
    .selectOption('receiver');
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  const original = await latestRun(page);
  await button(page, 'Auf Nachweis warten').click();
  await button(page, 'Test schließen').click();
  const dialog = page.getByRole('dialog', { name: 'Test schließen?', exact: true });
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(button(page, 'Warten beenden')).toBeVisible();
  await button(page, 'Test schließen').click();
  await dialog.getByRole('button', { name: 'Speichern und schließen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Neuen Test vorbereiten', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Geöffneter Test', exact: true })).toHaveCount(0);
  const saved = await latestRun(page);
  expect(saved.id).toBe(original.id);
  expect(saved.cursor).toBe(original.cursor);
  expect(saved.attempts.at(-1).status).toBe('cancelled');
  await page
    .locator(`[data-run-id="${saved.id}"]`)
    .getByRole('button', { name: /^Durchlauf öffnen:/ })
    .click();
  await expect(button(page, 'Auf Nachweis warten')).toBeVisible();
});

test('a failed final save leaves the run open and preserves its evidence', async ({ page }) => {
  await openScenario(page);
  await createScenario(page);
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  const original = await latestRun(page);
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'test_library' && args.request.action === 'scenario_run_save')
        return Promise.reject('vault_unavailable');
      return invoke(command, args);
    };
  });
  await button(page, 'Test schließen').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern und schließen', exact: true })
    .click();
  await expect(page.locator('.scenario-workspace [role="alert"]').first()).toBeVisible();
  await expect(button(page, 'Test schließen')).toBeVisible();
  expect((await latestRun(page)).id).toBe(original.id);
});
