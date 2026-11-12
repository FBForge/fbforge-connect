// Real Windows controls, native file dialogs and authenticated Destination API v3.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check, until } from './desktop.mjs';
import { connectProfile, navigate } from './exchange.mjs';
import { nativeFile, nativeOpenFile } from './downloads.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const ownListReady = (page) =>
  until(
    async () =>
      (await page.locator('.destination-manager-table').isVisible()) &&
      !(await button(page, 'Eigene Destinations laden').isDisabled()),
    'live_ui_backup_list_pending',
  );
function publicOnly(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(
    ([key, item]) =>
      ![
        'keys',
        'privateJwk',
        'privateKey',
        'clientSecret',
        'access_token',
        'secret',
        'd',
        'p',
        'q',
        'dp',
        'dq',
        'qi',
        'oth',
        'k',
      ].includes(key) && publicOnly(item),
  );
}
async function exportSnapshot(desktop, fixture, filename, cancel = false) {
  const page = desktop.page;
  await button(page, 'Sicherung exportieren').click();
  check(
    (await page.locator('input[type="password"]:visible').count()) === 0,
    'live_ui_backup_password_requested',
  );
  const path = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Datei speichern').click(),
    filename,
    cancel,
    'Zustellpunkt-Sicherung exportieren',
  );
  await page
    .getByRole('status')
    .filter({ hasText: cancel ? 'Export abgebrochen.' : 'JSON-Konfiguration exportiert.' })
    .waitFor();
  if (cancel) return null;
  const doc = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  check(
    doc.version === 2 && doc.sourceDestinationId === fixture.destination && publicOnly(doc),
    'live_ui_backup_not_public',
  );
  return doc;
}
export async function reviewDestinationBackups(desktop, fixture) {
  let page = desktop.page;
  const profile = fixture.receiverProfiles.find((p) => p.api === 'v3').id;
  await connectProfile(page, profile);
  await navigate(page, 'Destinations');
  await button(page, 'Bestehende Destinations').click();
  await ownListReady(page);
  const own = page.locator(`[data-open-destination="${fixture.destination}"]`);
  for (let i = 0; i < 200 && !(await own.isVisible()); i += 20) {
    const next = button(page, 'Nächste Seite');
    check(!(await next.isDisabled()), 'live_ui_backup_owned_destination_missing');
    await next.click();
    await until(
      async () => !(await next.isDisabled()) || (await own.isVisible()),
      'live_ui_backup_page_pending',
    );
  }
  await own.click();
  await button(page, 'Zustellpunkt sichern').click();
  const name = `${fixture.runName} öffentliche Konfiguration`;
  await page.getByLabel('Sicherungsname', { exact: true }).fill(name);
  await button(page, 'Sicherung im Profil speichern').click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  const originalId = await page.getByLabel('Gespeicherte Sicherung', { exact: true }).inputValue();
  const saved = await exportSnapshot(desktop, fixture, 'ui-public-destination.json');
  check(
    saved.configuration.destinationId === fixture.destination && Array.isArray(saved.publicKeys),
    'live_ui_backup_configuration_missing',
  );
  const owned = await fixture.readOwnedDestination();
  check(
    saved.configuration.name === owned.name &&
      saved.configuration.status === owned.status &&
      isDeepStrictEqual(saved.configuration.publicServices, JSON.parse(owned.offersJson).publicServices),
    'live_ui_backup_server_readback_differs',
  );
  await exportSnapshot(desktop, fixture, 'ui-backup-cancel.json', true);
  await button(page, 'Sicherung importieren').click();
  await nativeOpenFile(
    desktop,
    fixture,
    () => button(page, 'Datei auswählen und importieren').click(),
    'ui-public-destination.json',
    true,
  );
  await page.getByRole('status').filter({ hasText: 'Import abgebrochen.' }).waitFor();
  await nativeOpenFile(
    desktop,
    fixture,
    () => button(page, 'Datei auswählen und importieren').click(),
    'ui-public-destination.json',
  );
  await page
    .getByRole('status')
    .filter({ hasText: 'Sicherung importiert und geschützt im Profil gespeichert.' })
    .waitFor();
  const importedId = await page.getByLabel('Gespeicherte Sicherung', { exact: true }).inputValue();
  check(importedId !== originalId, 'live_ui_backup_import_overwrote_original');
  // Import rejects forbidden fields before storing anything.
  const unsafe = { ...saved, keys: [{ privateJwk: 'synthetic-forbidden-private-marker' }] };
  await writeFile(
    join(fixture.directory, 'desktop-ui', 'exports', 'ui-invalid-backup.json'),
    JSON.stringify(unsafe),
  );
  await button(page, 'Sicherung importieren').click();
  await nativeOpenFile(
    desktop,
    fixture,
    () => button(page, 'Datei auswählen und importieren').click(),
    'ui-invalid-backup.json',
  );
  await page.getByRole('alert').filter({ hasText: 'ungültig' }).waitFor();
  await button(page, 'Abbrechen').click();
  for (const section of [
    'Hilfe',
    'Diagnose',
    'Einstellungen',
    'Senden',
    'Empfangen',
    'Vorgänge',
    'Prozesse',
    'Event Log',
    'Testwerkzeuge',
    'Virenscan',
    'Start',
  ]) {
    await navigate(page, section);
    check(
      !(await page.getByRole('heading', { name: 'Zustellpunkt-Sicherungen', exact: true }).isVisible()),
      'live_ui_backup_leaked_workspace',
    );
  }
  await desktop.restartGracefully();
  page = desktop.page;
  await connectProfile(page, profile);
  await navigate(page, 'Destinations');
  await button(page, 'Zustellpunkt-Sicherungen').click();
  await page.getByLabel('Gespeicherte Sicherung', { exact: true }).selectOption(importedId);
  await page.getByRole('heading', { name, exact: true }).waitFor();
  const restored = await exportSnapshot(desktop, fixture, 'ui-public-destination-after-restart.json');
  check(
    isDeepStrictEqual(saved.configuration, restored.configuration) &&
      isDeepStrictEqual(saved.publicKeys, restored.publicKeys),
    'live_ui_backup_restart_changed_configuration',
  );
  await button(page, 'Auf bestehende Destination anwenden').click();
  await page.getByLabel('Ziel-Destination-ID', { exact: true }).fill(fixture.destination);
  await button(page, 'Bearbeitung mit Sicherung öffnen').click();
  await page.getByRole('heading', { name: 'Destination bearbeiten', exact: true }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill(owned.name);
  await page.locator('#manager-unit').fill(`${fixture.runName} Snapshot verified`);
  await button(page, 'Änderungsvorschau erstellen').click();
  // The original configuration is unchanged. Preview remains explicit even for a no-op.
  await page.locator('[aria-labelledby="update-preview-title"]').waitFor();
  const same = await fixture.readOwnedDestination();
  check(same.name === owned.name && same.status === owned.status, 'live_ui_backup_preview_wrote_to_server');
  const preview = page.locator('[aria-labelledby="update-preview-title"]');
  await preview
    .getByRole('button', {
      name: 'Diese Änderungen verbindlich in der gewählten Umgebung speichern',
      exact: true,
    })
    .click();
  await preview.getByText('Abgeschlossen', { exact: true }).waitFor();
  const updated = await fixture.readOwnedDestination();
  check(
    JSON.parse(updated.contactJson).unit === `${fixture.runName} Snapshot verified` &&
      updated.name === owned.name &&
      updated.status === owned.status &&
      isDeepStrictEqual(JSON.parse(updated.offersJson), JSON.parse(owned.offersJson)),
    'live_ui_backup_apply_changed_unselected_fields',
  );
  await navigate(page, 'Destinations');
  await button(page, 'Zustellpunkt-Sicherungen').click();
  await page.getByLabel('Gespeicherte Sicherung', { exact: true }).selectOption(importedId);
  await button(page, 'Neue Destination daraus anlegen').click();
  await button(page, 'Anlageassistent öffnen').click();
  const cloneName = `${fixture.runName} Backup-Kopie`;
  fixture.expectCreatedDestination(cloneName);
  await page.locator('#setup-name').fill(cloneName);
  await button(page, 'Weiter').click();
  await button(page, 'Weiter').click();
  await button(page, 'Destination vorbereiten').click();
  const confirm = page.getByRole('dialog', { name: 'Diese Destination anlegen?', exact: true });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: 'Destination jetzt anlegen', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Destination und Schlüsselzuordnung geprüft', exact: true })
    .waitFor();
  const id = (await page.locator('[aria-labelledby="destination-setup-result"] code').allTextContents()).find(
    (value) => /^[a-f0-9-]{36}$/i.test(value.trim()),
  );
  check(id, 'live_ui_backup_clone_identifier_missing');
  await fixture.confirmCreatedDestination(cloneName, id.trim());
  await reviewBulkEdit(page, fixture, id.trim(), cloneName);
  console.log(
    'Real installed desktop: authenticated public snapshot, native JSON export/import/cancellation, forbidden private fields, restart durability, all workspace switches, edit preview and separately confirmed clone creation passed',
  );
}

export async function reviewBulkEdit(page, fixture, cloneId, cloneName) {
  await button(page, 'Bestehende Destinations').click();
  await button(page, 'Eigene Destinations laden').click();
  await ownListReady(page);
  const wanted = new Set([fixture.destination, cloneId]);
  for (let offset = 0; offset <= 200 && wanted.size; offset += 20) {
    for (const [id, fixtureName] of [
      [fixture.destination, fixture.runName],
      [cloneId, cloneName],
    ]) {
      const checkbox = page.getByRole('checkbox', { name: `${fixtureName} auswählen`, exact: true });
      if (wanted.has(id) && (await checkbox.isVisible())) {
        await checkbox.check();
        wanted.delete(id);
      }
    }
    if (!wanted.size) break;
    const next = button(page, 'Nächste Seite');
    check(!(await next.isDisabled()), 'live_ui_bulk_fixture_missing');
    await next.click();
    await ownListReady(page);
  }
  check(wanted.size === 0, 'live_ui_bulk_selection_incomplete');
  await button(page, '2 Destinations gemeinsam bearbeiten').click();
  await page.getByRole('checkbox', { name: 'Organisationseinheit ändern', exact: true }).check();
  await page.locator('#manager-unit').fill(`${fixture.runName} Sammelprüfung`);
  await button(page, 'Änderungsvorschau erstellen').click();
  const preview = page.locator('[aria-labelledby="update-preview-title"]');
  await preview
    .getByRole('button', {
      name: 'Diese Änderungen verbindlich in der gewählten Umgebung speichern',
      exact: true,
    })
    .click();
  await preview.getByText('Abgeschlossen', { exact: true }).waitFor();
  for (const id of [fixture.destination, cloneId]) {
    const detail = await fixture.readManagedFixture(id);
    check(
      JSON.parse(detail.contactJson).unit === `${fixture.runName} Sammelprüfung`,
      'live_ui_bulk_server_readback_failed',
    );
  }
  console.log(
    'Real installed desktop: explicit bulk preview and contact-only update of the two destinations created by this run verified through the actual API',
  );
}
