import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('PDF page and close controls remain visible after scrolling at a small window size', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 540 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await page.getByRole('button', { name: 'Ansehen', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Lokale Vorschau', exact: true });
  const next = dialog.getByRole('button', { name: 'Nächste Seite', exact: true });
  const previous = dialog.getByRole('button', { name: 'Vorherige Seite', exact: true });
  const scroller = dialog.getByRole('region', { name: 'PDF-Seiteninhalt', exact: true });
  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();
  await scroller.evaluate((element) => (element.scrollTop = element.scrollHeight));
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(next).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'Vorschau schließen', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(dialog.getByText('Seite 2 von 2', { exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ansehen', exact: true }).first()).toBeFocused();
});
