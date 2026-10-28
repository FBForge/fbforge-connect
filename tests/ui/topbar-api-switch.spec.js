import { test, expect } from '@playwright/test';

async function login(page, saved = false) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.locator('#session-api').selectOption('v2');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-switch-client');
  await page.locator('#client-secret').fill('synthetic-switch-secret');
  if (saved) {
    await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
    await page.locator('#profile-name').fill('API-Wechsel');
  }
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  return page.evaluate(() => window.__profilesFixture.active.sessionId);
}

test('topbar reuses a temporary login and retains both API sessions without returning credentials', async ({
  page,
}) => {
  const original = await login(page);
  await page.locator('#session-api').selectOption('v3');
  await expect(page.locator('#session-api')).toHaveValue('v3');
  await expect(page.getByRole('button', { name: 'Verbunden', exact: true })).toBeVisible();
  const result = await page.evaluate(() => window.__profilesFixture);
  expect(result.profiles).toHaveLength(0);
  expect(Object.keys(result.sessions)).toHaveLength(2);
  const calls = result.calls.filter((c) => c.command === 'open_session_for_api');
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toEqual({ apiVersion: 'v2', sessionId: original, targetApiVersion: 'v3' });
  await page.locator('#session-api').selectOption('v2');
  await expect(page.locator('#session-api')).toHaveValue('v2');
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await expect(page.locator('.connection-identity')).toContainText('synthetic-switch-client');
  await expect(page.locator('.connection-identity')).toContainText('API v2');
  await expect(page.locator('#client-secret')).toHaveValue('');
  expect(
    await page.evaluate(
      () =>
        window.__profilesFixture.calls.filter((c) =>
          ['open_session', 'open_session_for_api'].includes(c.command),
        ).length,
    ),
  ).toBe(2);
});

test('topbar reuses saved credentials while preserving the original profile and session', async ({
  page,
}) => {
  const original = await login(page, true);
  await page.locator('#session-api').selectOption('v3');
  await expect(page.locator('#session-api')).toHaveValue('v3');
  let fixture = await page.evaluate(() => window.__profilesFixture);
  expect(fixture.profiles).toHaveLength(2);
  expect(fixture.profiles.find((p) => p.apiVersion === 'v2').keyCount).toBe(2);
  expect(fixture.profiles.find((p) => p.apiVersion === 'v3').keyCount).toBe(0);
  expect(fixture.sessions[original].connected).toBe(true);
  await page.locator('#session-api').selectOption('v2');
  await expect(page.locator('#session-api')).toHaveValue('v2');
  await page.locator('#session-api').selectOption('v3');
  await expect(page.locator('#session-api')).toHaveValue('v3');
  fixture = await page.evaluate(() => window.__profilesFixture);
  expect(fixture.calls.filter((c) => c.command === 'copy_profile_for_api')).toHaveLength(1);
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await expect(page.locator('.connection-identity')).toContainText('synthetic-switch-client');
  await expect(page.locator('.connection-identity')).toContainText('API v3');
});

test('disabled target API preserves the original login for temporary and saved credentials', async ({
  browser,
}) => {
  for (const saved of [false, true]) {
    const page = await browser.newPage();
    const original = await login(page, saved);
    await page.evaluate(() => {
      window.__profilesFixture.failApiSwitch = true;
      window.__profilesFixture.failApiCopy = true;
    });
    await page.locator('#session-api').selectOption('v3');
    await expect(page.locator('main').getByRole('alert')).toContainText('Freischaltung und Berechtigungen');
    await expect(page.locator('#session-api')).toHaveValue('v2');
    await expect(page.getByRole('button', { name: 'Verbunden', exact: true })).toBeVisible();
    const fixture = await page.evaluate(() => window.__profilesFixture);
    expect(Object.keys(fixture.sessions)).toEqual([original]);
    expect(fixture.profiles).toHaveLength(saved ? 1 : 0);
    await page.close();
  }
});

test('topbar does not replace an already connected different identity', async ({ page }) => {
  const original = await login(page);
  await page.locator('#session-api').selectOption('v3');
  await expect(page.locator('#session-api')).toHaveValue('v3');
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-other-client');
  await page.locator('#client-secret').fill('synthetic-other-secret');
  await page.getByRole('button', { name: 'Mit anderen Zugangsdaten anmelden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await page.locator('#session-api').selectOption('v2');
  await expect(page.locator('main').getByRole('alert')).toContainText('anderen Zugangsdaten');
  await expect(page.locator('#session-api')).toHaveValue('v3');
  expect(await page.evaluate((id) => window.__profilesFixture.sessions[id].connected, original)).toBe(true);
});
