import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Representative Full-HD client area at Windows-like device scales. This checks
// CSS reflow and accessibility, not the real monitor DPI or a spoken screen reader.
for (const scale of [1.25, 1.5, 2]) {
  test(`workspaces and modal remain usable at ${scale * 100}% device scale`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: Math.floor(1920 / scale), height: Math.floor(1080 / scale) },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
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
    expect(await page.evaluate(() => devicePixelRatio)).toBe(scale);
    for (const name of [
      'Vorgänge',
      'Hilfe',
      'Senden',
      'Empfangen',
      'Event Log',
      'Zustellpunkte',
      'Prozesse',
      'Info',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      if (name === 'Prozesse') {
        await page.getByRole('button', { name: 'Fiktiven Demo-Prozess öffnen', exact: true }).click();
        await expect(page.locator('.bpmn-diagram svg').first()).toBeVisible();
        const canvas = await page.locator('.bpmn-diagram').boundingBox();
        expect(canvas.height).toBeGreaterThanOrEqual(240);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
        `${name}: scrolling stays inside the workspace`,
      ).toBe(true);
    }
    await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Client-ID', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Client-Secret', { exact: true })).toHaveAttribute('type', 'password');
    await expect(
      dialog.getByRole('button', { name: 'Verbindungsdialog schließen', exact: true }),
    ).toBeVisible();
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await dialog.getByLabel('Client-ID', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Client-Secret', { exact: true })).toBeFocused();
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations.map(({ id }) => id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Verbinden', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
  });
}
