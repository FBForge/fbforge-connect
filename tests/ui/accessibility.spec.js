import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('main workspaces support keyboard navigation, reflow and automated accessibility checks', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command) {
        if (command === 'list_profiles') return [];
        throw 'session_missing';
      },
    };
  });
  await page.goto('http://127.0.0.1:1420/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Zum Arbeitsbereich' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  for (const name of [
    'Start',
    'Vorgänge',
    'Hilfe',
    'Senden',
    'Empfangen',
    'Destinations',
    'Prozesse',
    'Event Log',
    'Testwerkzeuge',
    'Virenscan',
    'Info',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    if (name === 'Prozesse') {
      await page.getByRole('button', { name: 'Fiktiven Demo-Prozess öffnen', exact: true }).click();
      await expect(page.locator('.bpmn-message-list button')).toHaveCount(4);
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
      name,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 420, height: 800 });
  await page.getByRole('button', { name: 'Darstellung wählen', exact: true }).click();
  await page.getByRole('button', { name: 'Dunkel', exact: true }).click();
  await page.getByRole('button', { name: 'Prozesse', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dark = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    dark.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
});

test('connected sender keeps labels and keyboard focus in high contrast', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await expect(page.getByRole('button', { name: 'Sitzung prüfen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abmelden', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Absender-Destination', exact: true });
  const target = page.getByRole('textbox', { name: 'Empfänger-Destination', exact: true });
  await expect(source).toHaveAccessibleDescription(/Zugangsdaten/);
  await target.focus();
  expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
  await source.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Liste aktualisieren', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Voraussetzungen für Antworten', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Weitere Adressierungsoptionen', { exact: true })).toBeFocused();
  for (const [theme, forcedColors] of [
    ['light', 'none'],
    ['dark', 'none'],
    ['light', 'active'],
    ['dark', 'active'],
  ]) {
    await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' });
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
      `${theme} / ${forcedColors}`,
    ).toEqual([]);
  }
});
