import { expect } from '@playwright/test';

// The full application, including workspace navigation, uses an explicitly synthetic native bridge.
export async function captureDestinationBackups({ page, open, button, capture }) {
  await open('test-fixtures/profiles.html');
  await button('Verbindung herstellen').click();
  await page.locator('#client-id').fill('synthetic-guide-client');
  await page.locator('#client-secret').fill('synthetic-guide-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Testsender');
  await button('Anmelden').click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await page.evaluate(async () =>
    (await import('/test-fixtures/destination-backup-fixture.js')).installBackupBridge(),
  );
  await button('Destinations').click();
  await button('Zustellpunkt-Sicherungen').click();
  await page.getByLabel('Gespeicherte Sicherung', { exact: true }).selectOption({ index: 1 });
  const heading = page.getByRole('heading', { name: 'Bauamt vor Konfigurationsänderung', exact: true });
  await expect(heading).toBeVisible();
  await capture('destination-backups', page.locator('#destination-backups-title'));
  await button('Neue Destination daraus anlegen').click();
  await capture('destination-backup-create', heading);
}
