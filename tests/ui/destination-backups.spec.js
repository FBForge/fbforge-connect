import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
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
for (const [width, scheme] of [
  [1280, 'light'],
  [420, 'dark'],
]) {
  test(`destination backups ${width} ${scheme}: capture, missing keys, password feedback and responsive controls`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, { incomplete: true });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, scheme);
    await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
    await page.getByRole('button', { name: 'Ansehen', exact: true }).first().click();
    await page.getByRole('button', { name: 'Zustellpunkt sichern', exact: true }).click();
    await page.getByLabel('Sicherungsname', { exact: true }).fill('Fiktive Kundentest-Sicherung');
    await page.getByRole('button', { name: 'Sicherung im Profil speichern', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Fiktive Kundentest-Sicherung', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('1 von 2 gesichert', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neue Destination daraus anlegen', exact: true }).click();
    await expect(
      page.getByLabel('Gesichertes Schlüsselpaar für die neue Destination verwenden', { exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Sicherung exportieren', exact: true }).click();
    await page.getByLabel('Dateipasswort', { exact: true }).fill('synthetisches-testpasswort');
    await page.getByLabel('Passwort wiederholen', { exact: true }).fill('anderes-testpasswort');
    await page.getByRole('button', { name: 'Datei speichern', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('stimmen nicht überein');
    expect(await page.evaluate(() => window.__backupFixture.exported)).toBe(0);
    await page.getByLabel('Passwort wiederholen', { exact: true }).fill('synthetisches-testpasswort');
    await page.getByRole('button', { name: 'Datei speichern', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Passwortverschlüsselte Sicherung exportiert');
    expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`destination-backups-${width}.png`), fullPage: true });
  });
}
test('a saved backup creates a new draft with every service and message and one explicit key choice', async ({
  page,
}) => {
  await open(page);
  await select(page);
  await page.getByRole('button', { name: 'Neue Destination daraus anlegen', exact: true }).click();
  await expect(
    page.getByLabel('Gesichertes Schlüsselpaar für die neue Destination verwenden', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Gesichertes Schlüsselpaar für die neue Destination verwenden', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Anlageassistent öffnen', exact: true }).click();
  await expect(page.locator('#setup-name')).toHaveValue('Bauamt Teststadt');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Leistungen und Schemata aus der Sicherung', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: 'Destination vorbereiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diese Destination anlegen?', exact: true });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => window.__backupFixture.lastDraft.configuration.publicServices.length),
  ).toBe(2);
  expect(
    await page.evaluate(() => window.__backupFixture.lastDraft.configuration.processMessages.length),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__backupFixture.lastDraft.configuration.senderAccessRestricted.enabled),
  ).toBe(true);
  expect(await page.evaluate(() => window.__backupFixture.generated)).toBe(0);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
  await page.getByRole('button', { name: 'Destination jetzt anlegen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Destination und Schlüsselzuordnung geprüft', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(1);
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
test('import reports a wrong password, clears it, and keeps an imported backup when the library is reopened', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Zustellpunkt-Sicherungen', exact: true }).click();
  await page.getByRole('button', { name: 'Sicherung importieren', exact: true }).click();
  await page.getByLabel('Dateipasswort', { exact: true }).fill('falsches-testpasswort');
  await page.getByRole('button', { name: 'Datei auswählen und importieren', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Prüfen Sie das Passwort');
  await expect(page.getByLabel('Dateipasswort', { exact: true })).toHaveValue('');
  await page.getByLabel('Dateipasswort', { exact: true }).fill('synthetisches-testpasswort');
  await page.getByRole('button', { name: 'Datei auswählen und importieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importierte Sicherung', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('geschützt im Profil gespeichert');
  await page.getByRole('button', { name: 'Zur Destination-Übersicht', exact: true }).click();
  await page.getByRole('button', { name: 'Zustellpunkt-Sicherungen', exact: true }).click();
  await page
    .getByLabel('Gespeicherte Sicherung', { exact: true })
    .selectOption({ label: 'Importierte Sicherung' });
  await expect(page.getByRole('heading', { name: 'Importierte Sicherung', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
test('original keys can be restored without server changes and deleting a snapshot requires confirmation', async ({
  page,
}) => {
  await open(page);
  await select(page);
  await page.getByRole('button', { name: 'Schlüssel für Ursprungsdestination laden', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 private Schlüssel geprüft und im Profil gesichert');
  await page.getByRole('button', { name: 'Lokale Sicherung löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(await page.evaluate(() => window.__backupFixture.items.length)).toBe(1);
  await page.getByRole('button', { name: 'Lokale Sicherung löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Sicherung jetzt löschen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Die Destination bei FIT-Connect besteht weiter');
  expect(await page.evaluate(() => window.__backupFixture.items.length)).toBe(0);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
