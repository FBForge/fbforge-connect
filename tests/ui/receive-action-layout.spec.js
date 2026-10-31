import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const api of ['v2', 'v3']) {
  for (const [width, theme] of [
    [1180, 'light'],
    [420, 'dark'],
  ]) {
    test(`receive actions form aligned, readable groups (${api}, ${width}px, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
      const aside = page.locator('.document-aside');
      await expect(aside.getByRole('button', { name: 'Annehmen', exact: true })).toBeEnabled();
      const groups = [
        aside.locator('.document-next-actions > .client-actions'),
        aside.locator('.application-attachment-list .client-actions').first(),
      ];
      for (const group of groups) {
        const geometry = await group.evaluate((el) => {
          const parent = el.getBoundingClientRect();
          return {
            width: parent.width,
            buttons: Array.from(el.querySelectorAll('button'), (button) => {
              const rect = button.getBoundingClientRect();
              return {
                left: rect.left - parent.left,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                clipped: button.scrollWidth > button.clientWidth,
              };
            }),
          };
        });
        expect(geometry.buttons.length).toBeGreaterThan(1);
        for (const [index, button] of geometry.buttons.entries()) {
          expect(Math.abs(button.width - geometry.width)).toBeLessThan(1);
          expect(Math.abs(button.left)).toBeLessThan(1);
          expect(Math.round(button.height)).toBeGreaterThanOrEqual(40);
          expect(Math.abs(button.height - geometry.buttons[0].height)).toBeLessThan(1);
          expect(button.clipped).toBe(false);
          if (index) expect(button.top - geometry.buttons[index - 1].bottom).toBeGreaterThanOrEqual(8);
        }
      }
      const accept = aside.getByRole('button', { name: 'Annehmen', exact: true });
      const reject = aside.getByRole('button', { name: 'Ablehnen', exact: true });
      expect(await accept.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        await reject.evaluate((el) => getComputedStyle(el).backgroundColor),
      );
      await reject.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('combobox', { name: 'Ablehnungsgrund', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Ablehnungsgrund', exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).include('.document-aside').analyze();
      expect(audit.violations).toEqual([]);
    });
  }
}
