import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { receiveReadingExample, caseReadingExample, readingText } from './reading-fixtures.js';

for (const [name, open] of [
  ['received submission', receiveReadingExample],
  ['local case', caseReadingExample],
]) {
  test(`${name} keeps attachments beside a long form while scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const main = page.locator('.document-main');
    const aside = page.getByRole('complementary', { name: 'Anlagen und Aktionen', exact: true });
    await page.locator('.document-layout').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const initial = await aside.boundingBox();
    const content = await main.boundingBox();
    expect(initial.x).toBeGreaterThan(content.x + content.width);
    expect(Math.abs(initial.y - content.y)).toBeLessThanOrEqual(1);
    const viewport = page.locator('.workspace-scroll');
    await viewport.evaluate((element) => (element.scrollTop += 850));
    const pinned = await aside.boundingBox();
    const viewportBounds = await viewport.boundingBox();
    expect(pinned.y).toBeGreaterThanOrEqual(viewportBounds.y);
    expect(pinned.y).toBeLessThanOrEqual(viewportBounds.y + 18);
    await expect(aside.getByRole('heading', { name: /Anlagen/ })).toBeInViewport({ ratio: 1 });
    if (name === 'received submission') {
      for (const action of ['Annehmen', 'Ablehnen', 'Antwort verfassen'])
        await expect(aside.getByRole('button', { name: action, exact: true })).toBeInViewport({ ratio: 1 });
    }
    await expect(aside.getByRole('button', { name: 'Ansehen', exact: true }).first()).toBeInViewport({
      ratio: 1,
    });
    await aside.getByRole('button', { name: 'Ansehen', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(aside.getByRole('button', { name: 'Ansehen', exact: true }).first()).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('long attachment lists scroll independently without hiding the receive actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await receiveReadingExample(page, 18);
  await page.locator('.document-layout').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const viewport = page.locator('.workspace-scroll');
  await viewport.evaluate((element) => (element.scrollTop += 850));
  const before = await viewport.evaluate((element) => element.scrollTop);
  const aside = page.getByRole('complementary', { name: 'Anlagen und Aktionen', exact: true });
  const files = aside.getByRole('list', { name: 'Anlagenliste', exact: true });
  await expect(files.locator(':scope > li')).toHaveCount(19);
  expect(await files.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await files.focus();
  await page.keyboard.press('End');
  await expect(files.getByText('Fiktiver Nachweis 18.txt', { exact: true })).toBeInViewport({ ratio: 1 });
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(before);
  for (const action of ['Annehmen', 'Ablehnen', 'Antwort verfassen'])
    await expect(aside.getByRole('button', { name: action, exact: true })).toBeInViewport({ ratio: 1 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => window.__applicationFixture.calls.some((name) => name.startsWith('execute_'))),
  ).toBe(false);
});

test('schema labels are readable while raw values and source stay available', async ({ page }) => {
  await receiveReadingExample(page);
  const main = page.locator('.document-main');
  await expect(main.locator('.application-field-value').filter({ hasText: /^Nein$/ })).toBeVisible();
  await expect(
    main.locator('.application-field-value').filter({ hasText: /^Ehrenamtliche Tätigkeit$/ }),
  ).toBeVisible();
  await main.getByRole('searchbox', { name: 'Felder durchsuchen', exact: true }).fill('false');
  await expect(main.locator('.application-field-value')).toHaveText(['Nein']);
  await main.getByText('Struktur, Quelltext und Feldangaben', { exact: true }).click();
  await main.getByRole('checkbox', { name: 'Technische Feldangaben anzeigen', exact: true }).check();
  await main.getByText('Feldherkunft', { exact: true }).click();
  await expect(main.locator('dt:has-text("Originalwert") + dd')).toHaveText('false');
  await main.getByRole('button', { name: 'Quelltext', exact: true }).click();
  await expect(main.locator('.application-source')).toHaveText(readingText);
});

for (const width of [360, 960]) {
  test(`reading reflows at ${width}px with keyboard shortcuts, larger text and dark contrast`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    await receiveReadingExample(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await page.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
    });
    const shortcut = page.getByRole('link', { name: 'Zu Anlagen und Aktionen', exact: true });
    if (width === 360) {
      await shortcut.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('complementary', { name: 'Anlagen und Aktionen', exact: true }),
      ).toBeFocused();
      const back = page.getByRole('link', { name: 'Zurück zu den Fachdaten', exact: true });
      await back.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.document-main')).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await page
        .locator('.document-main')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    for (const forcedColors of ['none', 'active']) {
      await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
}
