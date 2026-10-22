import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('profile-maintenance with synthetic native fixtures', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Testschlüssel/ }).check();
  await page.locator('#profile-name').fill('Bauamt TEST');
  await page.getByRole('button', { name: 'Bei TEST anmelden', exact: true }).click();
  await page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByText('Profil verwalten', { exact: true }).click();
  await page.getByRole('button', { name: 'Profilname oder Secret ändern', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Gespeichertes TEST-Profil bearbeiten', exact: true });
  await dialog.waitFor();
  await dialog.getByLabel('Profilname', { exact: true }).fill('Bauamt TEST neu');
  await dialog.locator('input[type=password]').fill('synthetic-new-secret');
  await page.evaluate(() => (window.__profilesFixture.failSecret = true));
  await dialog.getByRole('button', { name: 'Profil geschützt speichern', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await page.locator('[id^=profile-edit-secret-]').inputValue(), '');
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles[0].name), 'Bauamt TEST');
  await page.evaluate(() => (window.__profilesFixture.failSecret = false));
  await dialog.locator('input[type=password]').fill('synthetic-new-secret');
  await dialog.getByRole('button', { name: 'Profil geschützt speichern', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles[0].name), 'Bauamt TEST neu');
  assert.equal(await page.locator('[id^=profile-edit-secret-]').inputValue(), '');
  await page.getByRole('button', { name: 'Geschützte Sicherung exportieren', exact: true }).click();
  await page.getByText(/Geschützte Sicherung gespeichert/).waitFor();
  assert.equal(await page.evaluate(() => window.__profilesFixture.backups), 1);
  await page.getByText('Geschützte Profilsicherung importieren', { exact: true }).click();
  await page.getByRole('button', { name: 'Geschützte Sicherung importieren', exact: true }).click();
  await page
    .locator('#saved-profile-choice')
    .selectOption({ label: 'Wiederhergestellt TEST · v3 · synthetic-restored-client' });
  await page.locator('.selected-profile').getByText('Wiederhergestellt TEST', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__profilesFixture.profiles.length), 2);
  assert.deepEqual(errors, []);
  console.log(
    'Profile maintenance UI passed: separate edit dialog, failed secret keeps old profile, secret field cleared, public backup outcomes and import refresh.',
  );
});
