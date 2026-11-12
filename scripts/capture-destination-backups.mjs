import { expect } from '@playwright/test';

// Real components with the explicitly synthetic native bridge. No server writes or real keys.
export async function captureDestinationBackups({ page, open, button, capture }) {
  await open('test-fixtures/destination-manager.html');
  await page.evaluate(async () =>
    (await import('/test-fixtures/destination-backup-fixture.js')).installBackupBridge(),
  );
  await button('Zustellpunkt-Sicherungen').click();
  await page.getByLabel('Gespeicherte Sicherung', { exact: true }).selectOption({ index: 1 });
  const heading = page.getByRole('heading', { name: 'Bauamt vor Konfigurationsänderung', exact: true });
  await expect(heading).toBeVisible();
  await capture('destination-backups', page.locator('#destination-backups-title'));
  await button('Neue Destination daraus anlegen').click();
  await capture('destination-backup-create', heading);
}
