import { preparationPage, testReuse } from '../scenario-navigation.mjs';
// Real installed WebView2 acceptance of the original round trip in the current UI.
// No mocked IPC, traces or credential artifacts.
import { reviewProvenRun } from './review-integration-040.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check, until } from './desktop.mjs';
import {
  navigate,
  connectProfile,
  sendSubmission,
  openSubmission,
  acceptReceived,
  sendReplyAfterReceive,
} from './exchange.mjs';
import { receiveReply } from './readback.mjs';
import { nativeFile } from './downloads.mjs';
import { reviewShortcuts } from './review-runtime.mjs';
import { localScannerReady } from './local-tools.mjs';
import { testTools, testOverview, openStoredTest, checkTestStep } from './test-workspace.mjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
export async function fixturePack(fixture) {
  const pack = JSON.parse(
    await readFile(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
  );
  pack.name = 'CI Live gespeicherter Integrationstest';
  pack.cases = [pack.cases[0]];
  const item = pack.cases[0];
  item.name = 'Echter TEST-Versand mit fiktiven Daten';
  item.receipt = 'accept';
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
  const path = join(fixture.directory, 'ui-fixture.fctest.json');
  await writeFile(path, JSON.stringify(pack));
  await navigate(page, 'Senden');
  const library = page.locator('.test-case-library');
  if (!(await library.evaluate((element) => element.open))) await library.locator(':scope > summary').click();
  if (!(await library.locator('details').evaluate((element) => element.open)))
    await library.getByText('Tests importieren, exportieren und löschen', { exact: true }).click();
  await library.locator('#send-library-import').setInputFiles(path);
  const choice = library.locator('#send-library-choice');
  const value = await until(() => savedCaseValue(choice, pack.name), 'live_ui_saved_package_choice_missing');
  await choice.selectOption(value);
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
  await openStoredTest(page, 'pack', pack.name);
  await testReuse(page);
  await button(page, 'Test speichern').click();
  await page
    .getByText('Test dauerhaft für Ihr Windows-Benutzerkonto gespeichert.', { exact: true })
    .waitFor();
}
async function flowReview(desktop, fixture, senders, pack) {
  let page = desktop.page;
  await testTools(page);
  await preparationPage(page, 'Verbindung');
  await page.getByLabel('Empfangs-Destination', { exact: true }).fill(fixture.destination);
  await preparationPage(page, 'Verbindung');
  await button(page, 'Profile aktualisieren').click();
  await page.getByRole('combobox', { name: 'Sender-Profil', exact: true }).selectOption(senders.v3);
  await page
    .getByRole('combobox', { name: 'Empfänger-Profil', exact: true })
    .selectOption(fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await page.getByLabel('Absender-Destination (API v3)', { exact: true }).fill(process.env.SENDERDEST);
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  const message = await sendSubmission(page, fixture);
  await testTools(page);
  await checkTestStep(page);
  await page.getByRole('heading', { name: 'Eingang öffnen', exact: true }).waitFor();
  await page.getByText('Durchlauf für Ihr Windows-Benutzerkonto gespeichert.', { exact: true }).waitFor();
  await testOverview(page);
  const runRow = page.locator('[data-run-id]').filter({ hasText: pack.name });
  check((await runRow.count()) === 1, 'live_ui_flow_run_ambiguous');
  const runId = await runRow.getAttribute('data-run-id');
  await desktop.restartGracefully();
  page = desktop.page;
  await connectProfile(page, senders.v3);
  await localScannerReady(page);
  await testOverview(page);
  await page
    .locator(`[data-run-id="${runId}"]`)
    .getByRole('button', { name: /^Durchlauf öffnen:/ })
    .click();
  await page.getByText(/^Historischer Durchlauf geöffnet\./).waitFor();
  const progress = page.locator('.scenario-workspace').getByText(/Schritt 2 von 6/);
  await progress.waitFor();
  await button(page, 'Vorbereiten').click();
  await preparationPage(page, 'Verbindung');
  await until(
    async () =>
      (await page.getByRole('combobox', { name: 'Sender-Profil', exact: true }).inputValue()) ===
        senders.v3 &&
      (await page.getByLabel('Empfangs-Destination', { exact: true }).inputValue()) === fixture.destination,
    'live_ui_flow_context_not_restored',
  );
  await button(page, 'Ergebnisse').click();
  const exported = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Prüfergebnis exportieren').click(),
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
    result.attempts.length === 1 &&
      result.attempts[0].context.submissionId === message.submissionId &&
      !('bindings' in result),
    'live_ui_flow_export_invalid',
  );
  await button(page, 'Durchführen').click();
  await progress.waitFor();
  await button(page, 'Einreichung im Empfang öffnen').click();
  await page.getByRole('heading', { name: 'Empfangen', exact: true }).waitFor();
  check(
    (await page.locator('#destination-id').inputValue()) === fixture.destination,
    'live_ui_flow_receiver_not_prefilled',
  );
  check(
    (await page.getByRole('tab', { name: 'Einreichungen', exact: true }).getAttribute('aria-selected')) ===
      'true',
    'live_ui_flow_wrong_receive_tab',
  );
  await openSubmission(page, fixture, message);
  await singleFiles(desktop, fixture, message);
  await testTools(page);
  await checkTestStep(page);
  await checkTestStep(page);
  await openSubmission(page, fixture, message);
  await acceptReceived(desktop, fixture, message);
  await testTools(page);
  await checkTestStep(page);
  await navigate(page, 'Empfangen');
  await sendReplyAfterReceive(desktop, fixture, message);
  await testTools(page);
  await checkTestStep(page);
  await connectProfile(page, senders.v3);
  await receiveReply(desktop, fixture, message);
  await testTools(page);
  await checkTestStep(page);
  await page.getByText('6 von 6 Schritten automatisch nachgewiesen.', { exact: true }).waitFor();
  await reviewProvenRun(desktop, fixture, runId);
  await button(page, 'Vorbereiten').click();
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  await page
    .locator('.scenario-workspace')
    .getByText(/Schritt 1 von 6/)
    .waitFor();
  await testOverview(page);
  check(
    (await page.locator('[data-run-id]').filter({ hasText: pack.name }).count()) === 2,
    'live_ui_flow_history_lost',
  );
  await page.locator(`[data-run-id="${runId}"]`).getByText('6/6 Schritte', { exact: false }).waitFor();
  await page
    .locator(`[data-run-id="${runId}"]`)
    .getByRole('button', { name: 'Vergleichen', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Vergleich mit dem ausgewählten Durchlauf', exact: true })
    .waitFor();
  check(
    (await page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Prüfung', exact: true }) })
      .locator('tbody tr')
      .count()) === 6,
    'live_ui_run_comparison_incomplete',
  );
  await testOverview(page);
  console.log(
    'Real desktop UI: encrypted run and context survived restart, all round-trip steps passed, exported proof matched and a new run retained the earlier result',
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
export async function setRetention(input, enabled) {
  check((await input.isChecked()) !== enabled, 'live_ui_retention_already_selected');
  await input.click();
  await until(
    async () => !(await input.isDisabled()) && (await input.isChecked()) === enabled,
    'live_ui_retention_save_pending',
  );
}
export async function savedCaseValue(choice, packName) {
  return choice.evaluateAll(
    (selects, name) =>
      Array.from(selects[0]?.options || []).find(
        (option) =>
          option.parentElement?.getAttribute('label') === name || option.textContent.trim() === name,
      )?.value || null,
    packName,
  );
}
async function durability(desktop, fixture, senders, pack, message) {
  let page = desktop.page;
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  const input = await retention(page, true);
  await setRetention(input, false);
  await desktop.restartGracefully();
  page = desktop.page;
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  const restored = await retention(page, false);
  await page.getByRole('searchbox', { name: 'Vorgänge durchsuchen', exact: true }).fill(message.caseId);
  await until(
    async () => (await page.locator('.case-list .case-open').count()) === 1,
    'live_ui_durable_case_missing',
  );
  await setRetention(restored, true);
  await openStoredTest(page, 'test', pack.name);
  await testReuse(page);
  const path = await nativeFile(
    desktop,
    fixture,
    () => button(page, 'Testdatei exportieren').click(),
    'integrationstest-nach-neustart.json',
  );
  await until(
    async () =>
      readFile(path)
        .then(() => true)
        .catch(() => false),
    'live_ui_reopened_package_export_missing',
  );
  const restoredTest = JSON.parse(await readFile(path, 'utf8'));
  check(
    restoredTest.format === 'fbforge-connect-scenario' && isDeepStrictEqual(restoredTest.pack, pack),
    'live_ui_durable_package_changed',
  );
  await testOverview(page);
  const row = page.locator('[data-test-entry-id^="test:"]').filter({
    has: button(page, `Test löschen: ${pack.name}`),
  });
  await button(row, `Test löschen: ${pack.name}`).click();
  const dialog = page.getByRole('dialog', { name: 'Gespeicherten Test löschen?', exact: true });
  await button(dialog, 'Abbrechen').click();
  check((await row.count()) === 1, 'live_ui_test_delete_cancel_failed');
  await button(row, `Test löschen: ${pack.name}`).click();
  await button(dialog, 'Eintrag löschen').click();
  await until(async () => (await row.count()) === 0, 'live_ui_test_delete_failed');
  await connectProfile(page, senders.v3);
  await navigate(page, 'Senden');
  await page.locator('#send-target').fill(fixture.destination);
  await button(page, 'Aus Favoriten entfernen').click();
  await button(page, 'Als Favorit merken').waitFor();
  const library = page.locator('.test-case-library');
  if (!(await library.evaluate((element) => element.open))) await library.locator(':scope > summary').click();
  const choice = library.locator('#send-library-choice');
  check((await savedCaseValue(choice, pack.name)) === null, 'live_ui_deleted_test_source_reappeared');
  console.log(
    'Real desktop UI: application restart retained encrypted tests, original packages, archived cases and profile-bound opt-out, then explicit collection deletion passed',
  );
}
export async function review030(desktop, fixture, senders) {
  await connectProfile(desktop.page, senders.v3);
  console.log('Live acceptance: protected collections and real flow started');
  await reviewShortcuts(desktop.page, fixture);
  const pack = await fixturePack(fixture);
  await savePack(desktop, fixture, pack);
  const message = await flowReview(
    desktop,
    { ...fixture, replyData: pack.cases[0].reply.data },
    senders,
    pack,
  );
  console.log('Live acceptance: actual process restart and durable readback started');
  await durability(desktop, fixture, senders, pack, message);
}
