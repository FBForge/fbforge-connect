// Real installed WebView2 acceptance. No mocked IPC, traces or credential artifacts.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check, until } from './desktop.mjs';
import { navigate, connectProfile, sendSubmission, openSubmission, replyAndAccept } from './exchange.mjs';
import { receiveReply } from './readback.mjs';
import { nativeFile } from './downloads.mjs';
import { reviewProcessAndInbox, reviewShortcuts } from './review-runtime.mjs';
import { reviewAuthoring, reviewProfile } from './review-authoring.mjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const flowPanel = (page) => page.locator('[aria-labelledby="test-flows-title"]');
async function testTools(page, tab) {
  await navigate(page, 'Testwerkzeuge');
  await button(page, 'Testfälle und Abläufe').click();
  await button(page, tab).click();
}
async function fixturePack(fixture) {
  const pack = JSON.parse(
    await readFile(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
  );
  pack.name = 'CI Live 0.3 gespeichertes Testpaket';
  pack.cases = [pack.cases[0]];
  const item = pack.cases[0];
  item.name = 'Echter TEST-Versand mit fiktiven Daten';
  item.receipt = 'none';
  item.reply = null;
  item.request.data = JSON.stringify({
    antragstellendePerson: { vorname: 'Erika', nachname: 'Musterfrau' },
    anliegen: 'Fiktiver UI-Test ohne echte Personendaten',
    referenz: fixture.runName,
  });
  item.request.attachments = [
    {
      fileName: 'ui-test-attachment.txt',
      mimeType: 'text/plain',
      description: null,
      base64: Buffer.from('Fiktive TEST-Anlage aus der installierten Oberfläche.').toString('base64'),
    },
    {
      fileName: 'ui-fictional-attachment.pdf',
      mimeType: 'application/pdf',
      description: null,
      base64: (
        await readFile(
          new URL('../../frontend/test-fixtures/assets/fictional-attachment.pdf', import.meta.url),
        )
      ).toString('base64'),
    },
  ];
  return pack;
}
async function savePack(desktop, fixture, pack) {
  const page = desktop.page;
  await testTools(page, 'Testpakete');
  if (!(await page.locator('#test-package-file').isVisible()))
    await page.getByText('Anderes Paket öffnen oder Beispiel laden', { exact: true }).click();
  const path = join(fixture.directory, 'ui-fixture.fctest.json');
  await writeFile(path, JSON.stringify(pack));
  await page.locator('#test-package-file').setInputFiles(path);
  await page.getByRole('heading', { name: pack.name, exact: true }).waitFor();
  await button(page, 'In Testpaketsammlung speichern').click();
  await page.getByText('Testpaket dauerhaft und verschlüsselt', { exact: false }).waitFor();
  const exported = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Testpaket exportieren').click(),
    'testpaket-vor-neustart.json',
  );
  await until(
    async () =>
      readFile(exported)
        .then(() => true)
        .catch(() => false),
    'live_ui_package_export_missing',
  );
  check(
    isDeepStrictEqual(JSON.parse(await readFile(exported, 'utf8')), pack),
    'live_ui_package_export_changed',
  );
  return path;
}
async function checkStep(page) {
  await button(page, 'Lokale Ergebnisse laden').click();
  const choice = page.getByRole('combobox', { name: 'Nachricht für diesen Schritt', exact: true });
  await choice.waitFor();
  const options = choice.locator('option:not([value=""])');
  check((await options.count()) === 1, 'live_ui_flow_evidence_ambiguous');
  await choice.selectOption(await options.first().getAttribute('value'));
  await button(page, 'Schritt anhand der Inhalte prüfen').click();
}
async function flowReview(desktop, fixture, senders, path, pack) {
  const page = desktop.page;
  await testTools(page, 'Testabläufe');
  await page.locator('#test-flow-file').setInputFiles(path);
  await button(page, 'Ablauf lokal speichern').click();
  await page.getByText(/wurde dauerhaft für Ihr Windows-Benutzerkonto gespeichert/).waitFor();
  await button(page, 'Durchlauf starten').click();
  const message = await sendSubmission(page, fixture);
  await testTools(page, 'Testabläufe');
  await checkStep(page);
  await page.getByRole('heading', { name: `Eingang prüfen: ${pack.cases[0].name}`, exact: true }).waitFor();
  const progress = flowPanel(page).getByText('Schritt 2 von 3 · 1 erfolgreich geprüft', { exact: true });
  await progress.waitFor();
  await button(page, 'Neuen Durchlauf starten').click();
  const dialog = page.getByRole('dialog', { name: 'Durchlauf neu starten?', exact: true });
  await dialog.waitFor();
  const exported = await nativeFile(
    desktop,
    fixture,
    () => dialog.getByRole('button', { name: 'Durchlaufergebnis exportieren', exact: true }).click(),
    'ui-durchlaufergebnis.json',
  );
  await until(
    async () =>
      readFile(exported)
        .then(() => true)
        .catch(() => false),
    'live_ui_flow_export_missing',
  );
  const result = JSON.parse(await readFile(exported, 'utf8'));
  check(
    result.results.length === 1 &&
      result.results[0].submissionId === message.submissionId &&
      !('bindings' in result),
    'live_ui_flow_export_invalid',
  );
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await progress.waitFor();
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await openSubmission(page, fixture, message);
  await singleFiles(desktop, fixture, message);
  await testTools(page, 'Testabläufe');
  await checkStep(page);
  await checkStep(page);
  await page.getByText('Alle Schritte dieses Testablaufs sind geprüft.', { exact: true }).waitFor();
  await button(page, 'Neuen Durchlauf starten').click();
  await button(page, 'Ergebnisse zurücksetzen und neu starten').click();
  await flowPanel(page).getByText('Schritt 1 von 3 · 0 erfolgreich geprüft', { exact: true }).waitFor();
  await openSubmission(page, fixture, message);
  await replyAndAccept(desktop, fixture, message);
  await connectProfile(page, senders.v3);
  await receiveReply(desktop, fixture, message);
  console.log(
    'Real desktop UI: saved test flow advanced using exact real sent/received data and attachments, cancellation preserved progress, exported evidence matched, explicit restart reset it',
  );
  return message;
}
async function singleFiles(desktop, fixture, message) {
  const page = desktop.page;
  const row = page
    .getByRole('list', { name: 'Anlagenliste', exact: true })
    .locator('li')
    .filter({ hasText: 'ui-test-attachment.txt' });
  await row.waitFor();
  check((await row.innerText()).includes('Virenscan: kein Fund'), 'live_ui_attachment_scan_not_confirmed');
  const download = row.getByRole('button', { name: 'Original herunterladen', exact: true });
  await nativeFile(desktop, fixture, () => download.click(), 'ui-original-cancelled.txt', true);
  await page.locator('.save-feedback').getByText('Speichern abgebrochen.', { exact: true }).waitFor();
  const path = await nativeFile(desktop, fixture, () => download.click(), 'ui-original.txt');
  await until(
    async () =>
      readFile(path)
        .then(() => true)
        .catch(() => false),
    'live_ui_original_file_missing',
  );
  check(
    (await readFile(path, 'utf8')) === 'Fiktive TEST-Anlage aus der installierten Oberfläche.',
    'live_ui_original_file_changed',
  );
  const technical = page.locator('.application-technical');
  await technical.locator('summary').first().click();
  const dataRow = technical.locator('tbody tr').filter({ hasText: 'Fachdaten' }).first();
  const data = await nativeFile(
    desktop,
    fixture,
    () => dataRow.getByRole('button', { name: 'Herunterladen', exact: true }).click(),
    'ui-fachdaten.json',
  );
  await until(
    async () =>
      readFile(data)
        .then(() => true)
        .catch(() => false),
    'live_ui_technical_download_missing',
  );
  check((await readFile(data, 'utf8')) === message.text, 'live_ui_technical_download_changed');
  console.log(
    'Real desktop UI: original and technical file downloads preserved exact decrypted bytes, cancellation stayed visible and native save dialogs defaulted to Downloads',
  );
}
async function retention(page, expected) {
  await navigate(page, 'Vorgänge');
  const back = button(page, 'Zur Vorgangsübersicht');
  if (await back.isVisible()) await back.click();
  const section = page.locator('.case-storage');
  if (!(await section.evaluate((el) => el.open))) await section.locator('summary').click();
  const input = section.getByRole('checkbox');
  await until(async () => !(await input.isDisabled()), 'live_ui_retention_not_ready');
  check((await input.isChecked()) === expected, 'live_ui_retention_preference_wrong');
  return input;
}
async function durability(desktop, fixture, senders, pack, message) {
  let page = desktop.page;
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  const input = await retention(page, true);
  await input.uncheck();
  await until(async () => !(await input.isDisabled()), 'live_ui_retention_save_pending');
  await desktop.restart();
  page = desktop.page;
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  const restored = await retention(page, false);
  await page.getByRole('searchbox', { name: 'Vorgänge durchsuchen', exact: true }).fill(message.caseId);
  await until(
    async () => (await page.locator('.case-list .case-open').count()) === 1,
    'live_ui_durable_case_missing',
  );
  await restored.check();
  await until(async () => !(await restored.isDisabled()), 'live_ui_retention_restore_pending');
  await testTools(page, 'Testpakete');
  await button(page, 'Gespeicherte Testpakete laden').click();
  await page
    .getByRole('combobox', { name: 'Gespeichertes Testpaket auswählen', exact: true })
    .selectOption({ label: pack.name });
  await button(page, 'Gespeichertes Testpaket öffnen').click();
  const path = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Testpaket exportieren').click(),
    'testpaket-nach-neustart.json',
  );
  await until(
    async () =>
      readFile(path)
        .then(() => true)
        .catch(() => false),
    'live_ui_reopened_package_export_missing',
  );
  check(isDeepStrictEqual(JSON.parse(await readFile(path, 'utf8')), pack), 'live_ui_durable_package_changed');
  await button(page, 'Testabläufe').click();
  await button(page, 'Gespeicherte Abläufe laden').click();
  await page
    .getByRole('combobox', { name: 'Gespeicherten Ablauf auswählen', exact: true })
    .selectOption({ label: `${pack.name} · 3 Schritte` });
  await button(page, 'Gespeicherten Ablauf öffnen').click();
  await button(page, 'Durchlauf starten').waitFor();
  await button(page, 'Gespeicherten Ablauf löschen').click();
  await page
    .getByRole('dialog', { name: 'Gespeicherten Ablauf löschen?', exact: true })
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await button(page, 'Gespeicherten Ablauf löschen').click();
  await page
    .getByRole('dialog', { name: 'Gespeicherten Ablauf löschen?', exact: true })
    .getByRole('button', { name: 'Ablauf löschen', exact: true })
    .click();
  await page
    .getByText('Gespeicherter Ablauf gelöscht. Der geöffnete Ablauf bleibt erhalten.', { exact: true })
    .waitFor();
  await connectProfile(page, senders.v3);
  await navigate(page, 'Senden');
  await page.locator('#send-target').fill(fixture.destination);
  await button(page, 'Aus Favoriten entfernen').click();
  await button(page, 'Als Favorit merken').waitFor();
  const library = page.locator('.test-case-library');
  const choice = library.locator('#send-library-choice');
  await choice.waitFor();
  const saved = choice.locator('option').filter({ hasText: pack.name }).first();
  await choice.selectOption(await saved.getAttribute('value'));
  await library.getByText('Testpakete importieren, exportieren und löschen', { exact: true }).click();
  await library.getByRole('button', { name: 'Testpaket löschen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Testpaket aus der Sammlung löschen?', exact: true })
    .getByRole('button', { name: 'Endgültig löschen', exact: true })
    .click();
  await until(
    async () =>
      (await choice.count()) === 0 ||
      !(await choice.locator('option').filter({ hasText: pack.name }).count()),
    'live_ui_package_delete_failed',
  );
  console.log(
    'Real desktop UI: full application restart retained encrypted test packs, flow definitions, archived cases and profile-bound opt-out, then explicit collection deletion passed',
  );
}
export async function review030(desktop, fixture, senders) {
  await connectProfile(desktop.page, senders.v3);
  console.log('Live 0.3 acceptance: real profile maintenance started');
  await reviewProfile(desktop, fixture);
  console.log('Live 0.3 acceptance: schema authoring and custom reply started');
  await reviewAuthoring(desktop, fixture, senders);
  await connectProfile(desktop.page, senders.v3);
  console.log('Live 0.3 acceptance: protected collections and real flow started');
  await reviewShortcuts(desktop.page, fixture);
  await reviewProcessAndInbox(desktop, fixture, senders);
  await connectProfile(desktop.page, senders.v3);
  const pack = await fixturePack(fixture);
  const path = await savePack(desktop, fixture, pack);
  const message = await flowReview(desktop, fixture, senders, path, pack);
  console.log('Live 0.3 acceptance: actual process restart and durable readback started');
  await durability(desktop, fixture, senders, pack, message);
}
