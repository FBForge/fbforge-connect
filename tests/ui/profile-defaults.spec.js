import { test, expect } from '@playwright/test';
test('profile defaults survive reconnect, preserve edited fields and clear without losing key references', async ({
  page,
}) => {
  const source = '22222222-2222-4222-8222-222222222222',
    receiver = '33333333-3333-4333-8333-333333333333';
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Testschlüssel/ }).check();
  await page.locator('#profile-name').fill('Voreinstellungen TEST');
  await page.getByRole('button', { name: 'Bei TEST anmelden', exact: true }).click();
  const connection = page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true });
  await expect(connection).toBeHidden();
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByText('Standard-Destinations im aktiven Profil', { exact: true }).click();
  await page.locator('#profile-default-source').fill(source);
  await page.locator('#profile-default-receiver').fill(receiver);
  await page.getByRole('button', { name: 'Standard-Destinations speichern', exact: true }).click();
  await expect(
    page.getByText('Die Standard-Destinations sind im Profil gespeichert.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await page.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await expect(connection).toBeHidden();
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.locator('#send-source')).toHaveValue(source);
  await expect(
    page.getByRole('textbox', { name: 'Absender-Destination', exact: true }),
  ).toHaveAccessibleDescription(/Zugangsdaten/);
  await expect(page.getByRole('textbox', { name: 'Empfänger-Destination', exact: true })).toBeVisible();
  const edited = '44444444-4444-4444-8444-444444444444';
  await page.locator('#send-source').fill(edited);
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByText('Standard-Destinations im aktiven Profil', { exact: true }).click();
  await expect(page.locator('#profile-default-receiver')).toHaveValue(receiver);
  await page.locator('#profile-default-source').fill('');
  await page.locator('#profile-default-receiver').fill('');
  await page.getByRole('button', { name: 'Standard-Destinations speichern', exact: true }).click();
  await expect(
    page.getByText('Die Standard-Destinations sind im Profil gespeichert.', { exact: true }),
  ).toBeVisible();
  await connection.getByRole('button', { name: 'Verbindungsdialog schließen', exact: true }).click();
  await expect(page.locator('#send-source')).toHaveValue(edited);
  expect(await page.evaluate(() => window.__profilesFixture.profiles[0].keyCount)).toBe(2);
  await page
    .getByRole('button', { name: /Verbinden|Verbindung|Verbunden/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await page.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await expect(connection).toBeHidden();
  await expect(page.locator('#send-source')).toHaveValue('');
  await page.getByRole('button', { name: 'Empfangen', exact: true }).click();
  await expect(page.locator('#destination-id')).toHaveValue('');
  expect(errors).toEqual([]);
});
