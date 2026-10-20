import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const fixture = 'http://127.0.0.1:1420/test-fixtures/case-workspace.html';
test('Case ID groups keep full histories through filtering, exact ID navigation and individual deletion', async ({
  page,
}) => {
  await page.goto(fixture);
  const list = page.getByRole('list', { name: 'Lokale Vorgänge' });
  await expect(list.locator(':scope > li')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Nachrichten', exact: true }).selectOption('sent');
  await page.getByLabel('Vorgänge durchsuchen').fill('00000008-1111-4111-8111-111111111111');
  await expect(list.locator(':scope > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  const timeline = page.getByRole('navigation', { name: 'Nachrichten im Vorgang' });
  await expect(timeline.getByRole('button')).toHaveCount(2);
  await expect(timeline.locator('button[aria-current="true"]')).toContainText('Gesendet: Antwort');
  await expect(page.locator('.document-attachments')).toContainText('Keine Anlagen vorhanden');
  await timeline.getByRole('button', { name: /Empfangen: Einreichung/ }).click();
  await expect(timeline.locator('button[aria-current="true"]')).toContainText('Empfangen: Einreichung');
  await expect(page.locator('.document-attachments li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Diese lokale Kopie löschen', exact: true }).click();
  await expect(timeline.getByRole('button')).toHaveCount(1);
  await expect(timeline.locator('button[aria-current="true"]')).toContainText('Gesendet: Antwort');
  await expect(page.locator('#case-detail-title')).toHaveText('Vorgang');
  await page.getByRole('button', { name: 'Zur Vorgangsübersicht', exact: true }).click();
  await expect(page.getByLabel('Vorgänge durchsuchen')).toHaveValue('00000008-1111-4111-8111-111111111111');
  await expect(page.getByRole('combobox', { name: 'Nachrichten', exact: true })).toHaveValue('sent');
  await page.getByRole('button', { name: 'Vorgang', exact: true }).click();
  await page.getByRole('button', { name: 'Diese lokale Kopie löschen', exact: true }).click();
  await expect(page.getByLabel('Vorgänge durchsuchen')).toBeFocused();
  await expect(list).toHaveCount(0);
  const calls = await page.evaluate(() => window.__caseFixture.calls);
  expect(calls.filter((call) => call.operation === 'delete')).toHaveLength(2);
  expect(calls.some((call) => call.operation === 'clear')).toBe(false);
});
test('late reads cannot restore a document after changing profile', async ({ page }) => {
  await page.goto(fixture);
  await page.evaluate(() => (window.__caseFixture.delayRead = true));
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__caseFixture.releaseRead))).toBe(true);
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await page.evaluate(() => {
    window.__caseFixture.delayRead = false;
    window.__caseFixture.releaseRead();
  });
  await expect(page.locator('.case-detail')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
});
for (const width of [1440, 640]) {
  test(`case document and history reflow at ${width}px in light, dark and forced colors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(fixture);
    await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
    for (const [theme, forcedColors] of [
      ['light', 'none'],
      ['dark', 'none'],
      ['dark', 'active'],
    ]) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' });
      await expect(page.locator('.application-field-value').filter({ hasText: 'Erika' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
          .violations,
      ).toEqual([]);
    }
  });
}
