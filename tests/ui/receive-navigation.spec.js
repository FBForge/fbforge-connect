import { test, expect } from '@playwright/test';
import { receiveReadingExample } from './reading-fixtures.js';

const submissionId = '00000003-1111-4111-8111-111111111111';

async function expectReturnAvailable(page) {
  const button = page.getByRole('button', { name: 'Zurück zum Eingang', exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toBeInViewport({ ratio: 1 });
  expect(
    await button.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      );
    }),
  ).toBe(true);
  return button;
}

for (const [width, height, theme] of [
  [360, 640, 'dark'],
  [1180, 790, 'light'],
  [1440, 900, 'dark'],
]) {
  test(`inbox navigation stays reachable throughout a long application at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await receiveReadingExample(page);
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    const viewport = page.locator('.workspace-scroll');
    const navigation = page.getByRole('navigation', { name: 'Empfangsnavigation', exact: true });
    await expect(navigation.getByRole('button', { name: 'Zurück zum Eingang', exact: true })).toHaveCount(1);
    const maximum = await viewport.evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(maximum).toBeGreaterThan(height);
    for (const top of [0, maximum / 2, maximum]) {
      await viewport.evaluate((element, value) => (element.scrollTop = value), top);
      await expectReturnAvailable(page);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await page.evaluate(() =>
        window.__applicationFixture.calls.some((name) => name.startsWith('execute_')),
      ),
    ).toBe(false);
    await (await expectReturnAvailable(page)).click();
    await expect(page.getByRole('heading', { name: 'Einreichungen suchen', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }),
    ).toBeFocused();
    await expect(page.locator('#pickup-submission')).toHaveValue(submissionId);
    await expect(navigation).toHaveCount(0);
  });
}

for (const api of ['v2', 'v3']) {
  test(`inbox navigation is available when ${api} content verification fails`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1&api=${api}`);
    await page.evaluate(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'verify_submission') throw 'resource_unavailable';
        return original(command, args);
      };
    });
    await page.locator('#pickup-submission').fill(submissionId);
    await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
    await expect(page.locator('.receive-workspace [role="alert"]')).toBeVisible();
    for (const top of [0, Number.MAX_SAFE_INTEGER]) {
      await page.locator('.workspace-scroll').evaluate((element, value) => (element.scrollTop = value), top);
      await expectReturnAvailable(page);
    }
    await (await expectReturnAvailable(page)).click();
    await expect(page.getByRole('heading', { name: 'Einreichungen suchen', exact: true })).toBeVisible();
  });
}
