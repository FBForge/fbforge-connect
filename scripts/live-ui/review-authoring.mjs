// Real installed UI checks of the 0.3 authoring and profile workflows.
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, until } from './desktop.mjs';
import { navigate, connectProfile, sendSubmission, openSubmission, replyAndAccept } from './exchange.mjs';
import { receiveReply } from './readback.mjs';
import { nativeFile } from './downloads.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function readSaved(path) {
  await until(
    async () =>
      readFile(path)
        .then(() => true)
        .catch(() => false),
    'live_ui_authored_file_missing',
  );
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function reviewProfile(desktop, fixture) {
  const page = desktop.page;
  await page.locator('.connection-button').click();
  const profileId = await page.locator('#saved-profile-choice').inputValue();
  await page.getByText('Profil verwalten', { exact: true }).click();
  await button(page, 'Profilname oder Secret ändern').click();
  const editor = page.getByRole('dialog', { name: 'Gespeichertes Profil bearbeiten', exact: true });
  await editor.waitFor();
  check((await page.locator('dialog[open]').count()) === 1, 'live_ui_profile_modal_nested');
  check((await editor.boundingBox()).width <= 610, 'live_ui_profile_modal_too_wide');
  const name = editor.getByRole('textbox', { name: 'Profilname', exact: true });
  const original = await name.inputValue();
  await name.fill('CI UI sender cancelled');
  await button(page, 'Abbrechen').click();
  await until(
    async () => button(page, 'Profilname oder Secret ändern').evaluate((el) => el === document.activeElement),
    'live_ui_profile_cancel_focus_lost',
  );
  await button(page, 'Profilname oder Secret ändern').click();
  check((await name.inputValue()) === original, 'live_ui_cancelled_profile_changed');
  await name.fill(`${original} geprüft`);
  await button(page, 'Profil geschützt speichern').click();
  await editor.waitFor({ state: 'hidden' });
  await until(
    async () => button(page, 'Profilname oder Secret ändern').evaluate((el) => el === document.activeElement),
    'live_ui_profile_save_focus_lost',
  );
  const backup = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Geschützte Sicherung exportieren').click(),
    'ui-profil.fctest-profile',
    false,
    'Geschütztes Profil sichern',
  );
  await until(
    async () =>
      readFile(backup)
        .then(() => true)
        .catch(() => false),
    'live_ui_profile_backup_missing',
  );
  const encrypted = await readFile(backup);
  check(
    encrypted.length > 0 &&
      encrypted.length < 8 * 1024 * 1024 &&
      !encrypted.includes(Buffer.from(process.env.SENDERSECRET)),
    'live_ui_profile_backup_not_protected',
  );
  check(original.startsWith('CI UI sender'), 'live_ui_profile_not_owned');
  const count = await page.locator('#saved-profile-choice option').count();
  await page.getByText('Geschützte Profilsicherung importieren', { exact: true }).click();
  await page.locator('#profile-backup-file').setInputFiles(backup);
  await page
    .getByText('Dieses Profil ist bereits gespeichert und wird nicht überschrieben.', { exact: false })
    .waitFor();
  check(
    (await page.locator('#saved-profile-choice option').count()) === count,
    'live_ui_backup_overwrote_existing_profile',
  );
  await button(page, 'Gespeichertes Profil entfernen').click();
  await page
    .getByRole('dialog', { name: 'Gespeichertes Profil entfernen?', exact: true })
    .getByRole('button', { name: 'Profil und gespeicherte Schlüssel entfernen', exact: true })
    .click();
  await until(
    async () => (await page.locator('#saved-profile-choice option').count()) === count - 1,
    'live_ui_owned_profile_delete_failed',
  );
  await page.locator('#profile-backup-file').setInputFiles(backup);
  await until(
    async () => (await page.locator('#saved-profile-choice option').count()) === count,
    'live_ui_profile_restore_missing',
  );
  await page.locator('#saved-profile-choice').selectOption(profileId);
  await button(page, 'Verbindungsdialog schließen').click();
  await connectProfile(page, profileId);
  console.log(
    'Real desktop UI: compact replacement profile editor preserved cancellation, saved a rename, restored focus, exported an encrypted backup, refused overwriting an existing profile, then restored only the owned test profile after explicit deletion',
  );
}
async function installOffer(page, fixture, path, uri) {
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await navigate(page, 'Destinations');
  await button(page, 'Bestehende Destinations').click();
  const target = page.locator(`[data-edit-destination="${fixture.destination}"]`);
  for (let i = 0; i < 100 && !(await target.isVisible()); i += 20) {
    const next = button(page, 'Nächste Seite');
    check(!(await next.isDisabled()), 'live_ui_owned_schema_destination_missing');
    await next.click();
    await until(async () => !(await next.isDisabled()) || target.isVisible(), 'live_ui_offer_page_pending');
  }
  await target.click();
  await page
    .getByRole('checkbox', { name: 'Leistungen, Schemata und Prozessnachrichten bearbeiten', exact: true })
    .check();
  await page.locator('#manager-offer-0-reply-file').setInputFiles(path);
  await until(
    async () =>
      (await page.locator('#manager-offer-0-replies').inputValue())
        .split(',')
        .map((v) => v.trim())
        .includes(uri),
    'live_ui_authored_offer_not_applied',
  );
  await button(page, 'Änderungsvorschau erstellen').click();
  await button(page, 'Diese Änderungen verbindlich in der gewählten Umgebung speichern').click();
  await page
    .locator('[aria-labelledby="update-preview-title"]')
    .getByText('Abgeschlossen', { exact: true })
    .waitFor();
  const actual = JSON.parse((await fixture.readOwnedDestination()).offersJson);
  check(
    actual.publicServices.some((s) => s.replyChannels?.fitConnect?.processStandards?.includes(uri)),
    'live_ui_authored_offer_not_registered',
  );
}
export async function reviewAuthoring(desktop, fixture, senders) {
  const page = desktop.page;
  await navigate(page, 'Testwerkzeuge');
  await button(page, 'Antwortschemas').click();
  const uri = 'urn:fbforge:connect:ci:reply:status:1';
  await page.locator('#channel-uri').fill(uri);
  await page.locator('#channel-title').fill('Fiktive Live-Statusmitteilung');
  await page.locator('#channel-statuses').fill('eingegangen\nin_bearbeitung\nabgeschlossen');
  const schema = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'JSON-Schema herunterladen').click(),
    'ui-antwort.schema.json',
  );
  const example = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Fiktives Beispiel herunterladen').click(),
    'ui-antwort.beispiel.json',
  );
  const draft = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Schemaentwurf speichern').click(),
    'ui-antwort.entwurf.json',
  );
  const definition = await readSaved(schema),
    data = await readSaved(example);
  await readSaved(draft);
  check(
    definition.$id === uri &&
      definition.properties.status.enum.includes(data.status) &&
      definition.properties.nachricht.type === 'string',
    'live_ui_authored_schema_invalid',
  );
  await page.locator('#channel-title').fill('Nicht behalten');
  await page.getByText('Vorlage oder gespeicherten Entwurf öffnen', { exact: true }).click();
  await page.locator('#channel-draft').setInputFiles(draft);
  await until(
    async () => (await page.locator('#channel-title').inputValue()) === 'Fiktive Live-Statusmitteilung',
    'live_ui_schema_draft_restore_failed',
  );
  await installOffer(page, fixture, schema, uri);
  const custom = { ...fixture, replyUri: uri, replySchemaFile: schema, replyData: JSON.stringify(data) };
  await connectProfile(page, senders.v3);
  const message = await sendSubmission(page, custom);
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await openSubmission(page, fixture, message);
  await replyAndAccept(desktop, custom, message);
  await connectProfile(page, senders.v3);
  await receiveReply(desktop, custom, message);
  await navigate(page, 'Vorgänge');
  const back = button(page, 'Zur Vorgangsübersicht');
  if (await back.isVisible()) await back.click();
  await button(page, 'Übersicht aktualisieren').click();
  await page.getByRole('searchbox', { name: 'Vorgänge durchsuchen', exact: true }).fill(message.caseId);
  await page.locator('.case-list .case-open').first().click();
  await page.locator('.case-timeline button').filter({ hasText: 'Empfangen: Antwort' }).click();
  await until(
    async () => (await page.locator('.case-detail').innerText()).includes(data.status),
    'live_ui_custom_reply_not_readable',
  );
  check(isDeepStrictEqual(JSON.parse(custom.replyData), data), 'live_ui_custom_reply_fixture_changed');
  console.log(
    'Real desktop UI: authored JSON schema, example and editable draft exported and reimported, schema ID registered only on the owned TEST destination, real custom-schema reply sent, received, validated and acknowledged',
  );
}
