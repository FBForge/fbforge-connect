import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { openScenario, createScenario, button, latestRun } from './scenario-helpers.js';
import { preparationPage, testOptions } from '../../scripts/scenario-navigation.mjs';

test('preparation guides a keyboard user without disclosures and retains input across optional settings', async ({
  page,
}) => {
  await openScenario(page);
  await createScenario(page, 'reply');
  await page.getByLabel('Testname', { exact: true }).fill('Geführter Antworttest');
  await page.getByLabel('Empfangs-Destination', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
  await expect(page.locator('.scenario-setup details:visible')).toHaveCount(0);
  await expect(button(page, 'Test starten')).toHaveCount(0);
  const mode = page.getByRole('combobox', { name: 'Welche Gegenstelle testen Sie?', exact: true });
  await mode.selectOption('sender');
  await expect(page.getByRole('combobox', { name: 'Sender-Profil', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Empfänger-Profil', exact: true })).toHaveCount(0);
  await mode.selectOption('receiver');
  await expect(page.getByRole('combobox', { name: 'Sender-Profil', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Empfänger-Profil', exact: true })).toBeVisible();
  await mode.selectOption('both');
  await button(page, 'Weiter zu Testdaten').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.scenario-setup h3')).toBeFocused();
  await page.getByLabel('Fachdaten', { exact: true }).fill('{"anliegen":"Fiktiver Test"}');
  await expect(page.locator('.scenario-setup details:visible')).toHaveCount(0);
  await testOptions(page, 'responses');
  await button(page, 'Weitere Antwort hinzufügen').click();
  await page.getByLabel('Bezeichnung der Antwort', { exact: true }).fill('Abschluss');
  await expect(page.locator('.scenario-setup details:visible')).toHaveCount(0);
  await button(page, 'Zurück zur Vorbereitung').click();
  await expect(page.getByLabel('Fachdaten', { exact: true })).toHaveValue('{"anliegen":"Fiktiver Test"}');
  await button(page, 'Weiter zur Übersicht').click();
  await expect(page.locator('.scenario-summary')).toContainText('Geführter Antworttest');
  await expect(page.locator('.scenario-summary-cases')).toContainText('2 fachliche');
  await expect(
    page.getByRole('checkbox', { name: 'Vorbereitung automatisch geschützt speichern', exact: true }),
  ).toBeChecked();
  await button(page, 'Zurück').click();
  await expect(page.getByLabel('Fachdaten', { exact: true })).toHaveValue('{"anliegen":"Fiktiver Test"}');
  await button(page, 'Zurück').click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue('Geführter Antworttest');
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  expect((await latestRun(page)).definition.followups[0].name).toBe('Abschluss');
  expect(
    await page.evaluate(() => window.__integration.calls.filter((c) => c.command.startsWith('execute_'))),
  ).toEqual([]);
});

for (const width of [1180, 420, 320])
  test(`every preparation stage and optional settings reflow accessibly at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openScenario(page);
    await createScenario(page, 'process');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (const stage of ['Verbindung', 'Testdaten', 'Prüfen und starten', 'options']) {
        if (stage === 'options') await testOptions(page, 'addressing');
        else await preparationPage(page, stage);
        expect(await page.locator('.scenario-setup').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
          true,
        );
        const audit = await new AxeBuilder({ page })
          .include('.scenario-setup')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual(
          [],
        );
      }
    }
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    for (const stage of ['Verbindung', 'Testdaten', 'Prüfen und starten']) {
      await preparationPage(page, stage);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
