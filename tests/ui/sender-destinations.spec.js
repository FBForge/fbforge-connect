import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const open = (page, scenario = '') =>
  page.goto(`http://127.0.0.1:1420/test-fixtures/sender-destinations.html?scenario=${scenario}`);

test('own senders load automatically, paginate and preserve manual selection', async ({ page }, testInfo) => {
  await open(page);
  const source = page.getByRole('combobox', { name: 'Absender-Destination', exact: true });
  await expect(source).toBeVisible();
  await expect(source).toHaveValue('');
  await expect(source.locator('option')).toHaveCount(21);
  await expect(source).toContainText(`Test-Onlinedienst 1 — ${id(1)}`);
  await source.focus();
  await page.keyboard.press('ArrowDown');
  await expect(source).toHaveValue(id(1));
  await page.getByRole('button', { name: 'Weitere Destinations laden', exact: true }).click();
  await expect(source.locator('option')).toHaveCount(26);
  await expect(page.getByRole('button', { name: 'Weitere Destinations laden' })).toHaveCount(0);
  await source.selectOption(id(25));
  await page.getByRole('button', { name: 'ID eingeben', exact: true }).click();
  const manual = page.getByRole('textbox', { name: 'Absender-Destination', exact: true });
  await expect(manual).toHaveValue(id(25));
  await manual.fill(id(99));
  await page.getByRole('button', { name: 'Liste aktualisieren', exact: true }).click();
  await expect(manual).toHaveValue(id(99));
  await page.getByRole('button', { name: 'Aus Liste wählen', exact: true }).click();
  await expect(source).toHaveValue(id(99));
  expect(await page.evaluate(() => window.__senderFixture.requests.map((r) => r.offset))).toEqual([0, 20, 0]);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sender-destinations.png'), fullPage: true });
  await page.setViewportSize({ width: 420, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('single active destination is selected without replacing a saved default', async ({ page }) => {
  await open(page, 'single');
  await expect(page.locator('#send-source')).toHaveValue(id(1));
  await open(page, 'saved');
  await expect(page.locator('#send-source')).toHaveValue(id(99));
  await expect(page.getByRole('combobox', { name: 'Absender-Destination', exact: true })).toBeVisible();
});

test('missing list permission keeps manual input available and retryable', async ({ page }) => {
  await open(page, 'denied');
  await expect(page.getByRole('status')).toContainText('Ihr Zugang darf Destinations nicht auflisten.');
  const source = page.getByRole('textbox', { name: 'Absender-Destination', exact: true });
  await source.fill(id(99));
  await page.evaluate(() => {
    window.__senderFixture.denied = false;
    window.__senderFixture.rows = [];
  });
  await page.getByRole('button', { name: 'Liste aktualisieren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('keine Destinations gefunden');
  await expect(source).toHaveValue(id(99));
});

test('old session results cannot populate the next session sender list', async ({ page }) => {
  await open(page, 'delayed');
  await expect.poll(() => page.evaluate(() => Boolean(window.__senderFixture.resolve))).toBe(true);
  await page.evaluate(() => {
    const fixture = window.__senderFixture;
    fixture.delayed = false;
    fixture.rows = [
      {
        destinationId: '22222222-2222-4222-8222-222222222222',
        name: 'Neuer Zugang',
        status: 'active',
        type: 'C',
      },
    ];
    fixture.session = { ...fixture.session, sessionId: '33333333-3333-4333-8333-333333333333' };
    fixture.resolve();
  });
  const source = page.getByRole('combobox', { name: 'Absender-Destination', exact: true });
  await expect(source).toHaveValue('22222222-2222-4222-8222-222222222222');
  await expect(source).not.toContainText('Test-Onlinedienst');
});

test('v2 does not request or require a sender destination', async ({ page }) => {
  await open(page, 'v2');
  await expect(page.getByRole('heading', { name: 'Einreichung senden', exact: true })).toBeVisible();
  await expect(page.locator('#send-source')).toHaveCount(0);
  expect(await page.evaluate(() => window.__senderFixture.requests)).toEqual([]);
});
