import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('saved credentials can set up both APIs and reuse an existing API profile without copying keys', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.locator('#session-api').selectOption('v2');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-reused-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Gemeinsamer Zugang');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await page.locator('#saved-profile-api').selectOption('v3');
  await page.getByRole('button', { name: 'Mit API v3 verbinden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await expect(page.locator('#session-api')).toHaveValue('v3');
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(2);
  const profiles = await page.evaluate(() => window.__profilesFixture.profiles);
  expect(profiles.find((p) => p.apiVersion === 'v2').keyCount).toBeGreaterThan(0);
  expect(profiles.find((p) => p.apiVersion === 'v3').keyCount).toBe(0);
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await page
    .locator('#saved-profile-choice')
    .selectOption(profiles.find((p) => p.apiVersion === 'v2').profileId);
  await page.locator('#saved-profile-api').selectOption('v3');
  await page.getByRole('button', { name: 'Mit API v3 verbinden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(2);
  expect(await page.locator('#client-secret').inputValue()).toBe('');
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  expect(
    await page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).textContent(),
  ).not.toContain('synthetic-secret-marker');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => (window.__profilesFixture.failApiCopy = true));
  await page
    .locator('#saved-profile-choice')
    .selectOption(profiles.find((p) => p.apiVersion === 'v2').profileId);
  await page.locator('#saved-profile-api').selectOption('v3');
  await page.getByRole('button', { name: 'Mit API v3 verbinden', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).getByRole('alert'),
  ).toContainText('Freischaltung und Berechtigungen');
  await expect(page.locator('.connection-identity')).toContainText('API v3');
  await expect(page.locator('.connection-identity')).toContainText('synthetic-reused-client');
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(2);
});

test('one importer accepts PKCS12 with an ephemeral password and automatically handles JWK', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-keys.html?stage=1&fresh=1');
  await page.locator('#destination-id').fill('00000000-0000-4000-8000-000000000002');
  await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
  await expect(page.getByText('Zertifizierten privaten Schlüssel importieren', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('group', { name: 'Private Schlüssel importieren', exact: true })).toHaveCount(
    1,
  );
  await page.locator('#private-test-key').setInputFiles({
    name: 'synthetic.pfx',
    mimeType: 'application/x-pkcs12',
    buffer: Buffer.from([255, 0, 65]),
  });
  const password = page.getByLabel('Passwort für synthetic.pfx', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('synthetic-only-password');
  await page.locator('#private-key-purpose').selectOption('decrypt');
  await page.getByRole('button', { name: 'Schlüssel prüfen und importieren', exact: true }).click();
  await expect(page.getByText('Passender Entschlüsselungsschlüssel geladen', { exact: true })).toBeVisible();
  await expect(password).toHaveCount(0);
  const imports = await page.evaluate(() => window.__keyImports);
  expect(JSON.parse(imports[0].keyDocument)).toEqual({
    format: 'pkcs12',
    content: '/wBB',
    password: 'synthetic-only-password',
  });
  await page.getByRole('button', { name: 'Einrichtung ändern', exact: true }).click();
  await page.locator('#private-test-key').setInputFiles({
    name: 'synthetic.jwk',
    mimeType: 'application/json',
    buffer: Buffer.from('{"synthetic":"jwk"}'),
  });
  await expect.poll(async () => page.evaluate(() => window.__keyImports.length)).toBe(2);
  const last = await page.evaluate(() => window.__keyImports.at(-1));
  expect(last.purpose).toBe('auto');
  expect(last.keyDocument).toBe('{"synthetic":"jwk"}');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a disabled second API leaves the original profile and its keys intact', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.locator('#session-api').selectOption('v2');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-reused-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Nur v2 freigeschaltet');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await page.evaluate(() => (window.__profilesFixture.failApiCopy = true));
  await page.locator('#saved-profile-api').selectOption('v3');
  await page.getByRole('button', { name: 'Mit API v3 verbinden', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).getByRole('alert'),
  ).toContainText('Freischaltung und Berechtigungen');
  const profiles = await page.evaluate(() => window.__profilesFixture.profiles);
  expect(profiles).toHaveLength(1);
  expect(profiles[0].apiVersion).toBe('v2');
  expect(profiles[0].keyCount).toBeGreaterThan(0);
  await expect(page.locator('#session-api')).toHaveValue('v2');
  await expect(page.locator('.connection-identity')).toContainText('synthetic-reused-client');
});
