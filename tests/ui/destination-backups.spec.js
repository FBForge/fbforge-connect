import { test, expect } from './fixtures.js';
async function open(page, options = {}) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(
    async (options) =>
      (await import('/test-fixtures/destination-backup-fixture.js')).installBackupBridge(options),
    options,
  );
}
async function select(page) {
  await page.getByRole('button', { name: 'Zustellpunkt-Sicherungen', exact: true }).click();
  await page.getByLabel('Gespeicherte Sicherung', { exact: true }).selectOption({ index: 1 });
  await expect(
    page.getByRole('heading', { name: 'Bauamt vor Konfigurationsänderung', exact: true }),
  ).toBeVisible();
}
test('public configuration export and import need no password and never change the server', async ({
  page,
}) => {
  await open(page);
  await select(page);
  await expect(page.getByText('Private Schlüssel bleiben im Profil.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Sicherung exportieren', exact: true }).click();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Datei speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('JSON-Konfiguration exportiert');
  await page.getByRole('button', { name: 'Sicherung importieren', exact: true }).click();
  await page.getByRole('button', { name: 'Datei auswählen und importieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importierte Sicherung', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
test('new destination from public backup preserves offers and uses separately chosen profile keys', async ({
  page,
}) => {
  await open(page);
  await select(page);
  await page.getByRole('button', { name: 'Neue Destination daraus anlegen', exact: true }).click();
  await page.getByRole('button', { name: 'Anlageassistent öffnen', exact: true }).click();
  await expect(page.locator('#setup-name')).toHaveValue('Bauamt Teststadt');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: 'Destination vorbereiten', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Diese Destination anlegen?', exact: true })).toBeVisible();
  const draft = await page.evaluate(() => window.__backupFixture.lastDraft.configuration);
  expect(draft.publicServices).toHaveLength(2);
  expect(draft.processMessages).toHaveLength(1);
  expect(await page.evaluate(() => window.__backupFixture.generated)).toBe(1);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
test('backup application edits an owned destination and still requires a fresh preview', async ({ page }) => {
  await open(page);
  await select(page);
  await page.getByRole('button', { name: 'Auf bestehende Destination anwenden', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeitung mit Sicherung öffnen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Destination bearbeiten', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Bauamt nach Übernahme');
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zur Bestätigung', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
  const patch = await page.evaluate(() => JSON.parse(window.__destinationFixture.state.changes[0].afterJson));
  expect(patch.name).toBe('Bauamt nach Übernahme');
  expect(patch.publicServices).toHaveLength(2);
  expect(patch.contactInformation.cc).toEqual(['post@example.invalid']);
  expect(patch.senderAccessRestricted.enabled).toBe(true);
  expect(patch).not.toHaveProperty('status');
  expect(patch).not.toHaveProperty('callback');
});
test('v2 explains the v3 requirement and retains a usable back action', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html?api=v2');
  await page.getByRole('button', { name: 'Zustellpunkt-Sicherungen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('API-v3-Verbindung');
  await page.getByRole('button', { name: 'Zur Destination-Übersicht', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Eigene Destinations verwalten', exact: true }),
  ).toBeVisible();
});
test('deleting only the public snapshot requires confirmation', async ({ page }) => {
  await open(page);
  await select(page);
  await page.getByRole('button', { name: 'Lokale Sicherung löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(await page.evaluate(() => window.__backupFixture.items.length)).toBe(1);
  await page.getByRole('button', { name: 'Lokale Sicherung löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Sicherung jetzt löschen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Die Destination bei FIT-Connect besteht weiter');
});

test('selected destinations are saved independently and the refreshed library shows every snapshot', async ({
  page,
}) => {
  await open(page, { empty: true });
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByRole('button', { name: 'Alle auswählen (diese Seite)', exact: true }).click();
  await page.getByRole('button', { name: 'Auswahl sichern', exact: true }).click();
  await page.getByRole('button', { name: 'Auswahl im Profil speichern', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 von 2 gesichert' })).toBeVisible();
  const rows = await page.evaluate(() => window.__backupFixture.items);
  expect(new Set(rows.map((r) => r.sourceDestinationId)).size).toBe(2);
  await expect(page.getByLabel('Gespeicherte Sicherung', { exact: true }).locator('option')).toHaveCount(3);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
