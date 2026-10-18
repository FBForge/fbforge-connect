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
    'Vorgänge',
    'Hilfe',
    'Senden',
    'Empfangen',
    'Zustellpunkte',
    'Prozesse',
    'Event Log',
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
  await page.getByRole('button', { name: 'Dunkles Design verwenden', exact: true }).click();
  await page.getByRole('button', { name: 'Prozesse', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dark = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    dark.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
});
