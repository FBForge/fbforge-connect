import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const url = 'http://127.0.0.1:1420/test-fixtures/environments.html';
test('environment changes confirm, filter profiles and close previous sessions before selecting another environment', async ({
  page,
}) => {
  await page.goto(url);
  const picker = page.getByLabel('Umgebung', { exact: true });
  await expect(picker).toHaveValue('TEST');
  await picker.selectOption('PROD');
  const warning = page.getByRole('dialog', { name: 'Zu PROD wechseln?', exact: true });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('PROD verarbeitet echte Daten');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveValue('TEST');
  await expect(picker).toBeFocused();
  await picker.selectOption('STAGE');
  await page.getByRole('button', { name: 'Zu STAGE wechseln', exact: true }).click();
  await expect(picker).toHaveValue('STAGE');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true });
  await expect(login).toContainText('FIT-Connect STAGE');
  await expect(login.getByRole('option', { name: /Fiktives Profil STAGE/ })).toHaveCount(1);
  await expect(login.getByRole('option', { name: /Fiktives Profil (TEST|PROD)/ })).toHaveCount(0);
  await login.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await expect(page.locator('.connection-button')).toContainText('Verbunden');
  await picker.selectOption('PROD');
  await page.getByRole('button', { name: 'Zu PROD wechseln', exact: true }).click();
  await expect(picker).toHaveValue('PROD');
  await expect(page.locator('.environment-warning')).toContainText('PROD · Produktivbetrieb');
  await expect(page.locator('.connection-button')).toHaveText('Verbinden');
  const calls = await page.evaluate(() => window.__environmentsFixture.calls);
  const close = calls.findIndex((item) => item.command === 'close_session');
  expect(close).toBeGreaterThan(-1);
  expect(
    calls
      .slice(close + 1)
      .some((item) => item.command === 'select_environment' && item.environment === 'STAGE'),
  ).toBe(true);
  expect(calls.some((item) => item.command.startsWith('execute_'))).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('V-PKI import offers separate certificate chains and PKCS#12 passwords without transmitting a write', async ({
  page,
}) => {
  await page.goto(`${url}?certificates=1`);
  await page.getByText('V-PKI-Schlüsselpaar importieren', { exact: true }).click();
  await expect(page.locator('#encryption-certificate')).toBeVisible();
  await expect(page.locator('#signing-certificate')).toBeVisible();
  await page.locator('#encryption-certificate').setInputFiles({
    name: 'synthetic.p12',
    mimeType: 'application/x-pkcs12',
    buffer: Buffer.from([0x30, 0x82, 0xff, 0]),
  });
  const password = page.locator('#encryption-certificate-password');
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('synthetic-password');
  await page.locator('#signing-certificate').setInputFiles({
    name: 'synthetic.jwk',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kty":"RSA","x5c":[]}'),
  });
  await page.getByRole('button', { name: 'Zertifikate prüfen und Schlüssel laden', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('V-PKI-Zertifikate');
  const calls = await page.evaluate(() => window.__environmentsFixture.calls);
  expect(calls.map((item) => item.command)).toEqual(['import_certified_keys']);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('an unknown V-PKI revocation status stays visible and never enables an unchecked key', async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Umgebung', exact: true }).selectOption('STAGE');
  await page.getByRole('button', { name: 'Zu STAGE wechseln', exact: true }).click();
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await page.getByRole('button', { name: 'Empfangen', exact: true }).click();
  await page.locator('#destination-id').fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
  await expect(page.getByText('1 Zertifikat(e) wurden nicht freigegeben.', { exact: false })).toBeVisible();
  await page.getByText('Zertifikatsprüfung (1)', { exact: true }).click();
  await expect(
    page.getByText('Der Sperrstatus des V-PKI-Zertifikats konnte nicht sicher festgestellt werden.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator('#private-test-key')).toBeDisabled();
  expect(
    await page.evaluate(() =>
      window.__environmentsFixture.calls.some((item) => item.command.startsWith('execute_')),
    ),
  ).toBe(false);
});
