import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

const url = 'http://127.0.0.1:1420/test-fixtures/environments.html';
const layouts = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: '200% device scale', width: 960, height: 540, deviceScaleFactor: 2 },
  { name: 'narrow dark window', width: 360, height: 640, dark: true },
  { name: 'high contrast with increased text spacing', width: 640, height: 480, contrast: true },
];

for (const layout of layouts) {
  test(`environment warnings remain readable and keyboard operable in a ${layout.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: layout.width, height: layout.height },
      deviceScaleFactor: layout.deviceScaleFactor || 1,
      reducedMotion: 'reduce',
      forcedColors: layout.contrast ? 'active' : 'none',
    });
    const page = await context.newPage();
    try {
      await page.goto(url);
      if (layout.dark) {
        await page.getByRole('button', { name: 'Darstellung wählen', exact: true }).click();
        await page.getByRole('button', { name: 'Dunkel', exact: true }).click();
      }
      if (layout.contrast)
        await page.addStyleTag({
          content:
            '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
        });
      const picker = page.getByRole('combobox', { name: 'Umgebung', exact: true });
      for (const environment of ['STAGE', 'PROD']) {
        await picker.selectOption(environment);
        const dialog = page.getByRole('dialog', { name: `Zu ${environment} wechseln?`, exact: true });
        const cancel = dialog.getByRole('button', { name: 'Abbrechen', exact: true });
        const confirm = dialog.getByRole('button', { name: `Zu ${environment} wechseln`, exact: true });
        await expect(cancel).toBeFocused();
        await expect(dialog).toContainText('Nicht gespeicherte Inhalte und Schlüssel');
        await expect(dialog).toContainText(
          environment === 'PROD' ? 'PROD verarbeitet echte Daten.' : 'V-PKI-Zertifikate erforderlich',
        );
        const bounds = await dialog.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(layout.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(layout.height);
        // Both actions stay reachable while long warning text scrolls independently.
        for (const action of [cancel, confirm]) await expect(action).toBeInViewport({ ratio: 1 });
        await page.keyboard.press('Tab');
        await expect(confirm).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(cancel).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        const details = dialog.getByRole('region', { name: 'Hinweise zum Umgebungswechsel', exact: true });
        await expect(details).toBeFocused();
        if (layout.contrast) {
          await details.evaluate((element) => (element.scrollTop = 0));
          await page.keyboard.press('End');
          await expect.poll(() => details.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        }
        await dialog
          .getByText(`Melden Sie sich anschließend mit Ihren Zugangsdaten für ${environment} neu an.`)
          .scrollIntoViewIfNeeded();
        expect(
          await dialog.evaluate((element) =>
            [element, ...element.querySelectorAll('div, p')].every(
              (item) => item.scrollWidth <= item.clientWidth + 1,
            ),
          ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(picker).toBeFocused();
        await expect(picker).toHaveValue('TEST');
      }
      expect(
        await page.evaluate(() =>
          window.__environmentsFixture.calls.some((item) => item.command === 'select_environment'),
        ),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
}

test('Info shows the regular version without an obsolete release qualifier', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  const info = page.locator('.info-view');
  await expect(info.getByText(`Version ${version}`, { exact: true })).toBeVisible();
  await expect(info).not.toContainText(/Alpha|Beta|Release Candidate|Entwicklungsstand/);
  await expect(info.getByText('FIT-Connect TEST, STAGE und PROD', { exact: true })).toBeVisible();
});
