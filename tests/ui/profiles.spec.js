import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('profiles with synthetic native fixtures', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Testschlüssel/ }).check();
  await page.locator('#profile-name').fill('Bauamt TEST');
  await page.getByRole('button', { name: 'Bei TEST anmelden', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles.length), 1);
  assert.equal(await page.locator('#client-secret').inputValue(), '');
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Gespeicherte TEST-Profile' }).waitFor();
  await page.evaluate(() => (window.__profilesFixture.failRestore = true));
  await page.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'nicht vollständig wiederhergestellt' }).first().waitFor();
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles.length), 1);
  await page.getByRole('button', { name: 'Nur Zugangsdaten verwenden', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__profilesFixture.binding), null);
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Gespeichertes Profil entfernen', exact: true }).click();
  await page.getByRole('dialog', { name: 'Gespeichertes Profil entfernen?', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles.length), 1);
  await page.getByRole('button', { name: 'Gespeichertes Profil entfernen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Profil und gespeicherte Schlüssel entfernen', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Gespeicherte TEST-Profile' }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles.length), 0);
  assert.deepEqual(errors, []);
  console.log(
    'Profile UI passed: explicit opt-in, secret field cleanup, profile login, preserved keys after failed restore, credential-only mode and confirmed removal.',
  );
});
