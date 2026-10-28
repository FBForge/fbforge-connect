// Drive the installed application's real controls. All IDs belong to the owned TEST fixture.
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, until } from './desktop.mjs';
import { nativeFolder, verifyDownload } from './downloads.mjs';
import { diagnosticCode } from '../../frontend/src/diagnostics.js';

export async function navigate(page, name) {
  await page
    .getByRole('navigation', { name: 'Hauptnavigation', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
}
export async function connectProfile(page, profileId) {
  await page.locator('.connection-button').click();
  await page.locator('#saved-profile-choice').selectOption(profileId);
  await page.getByRole('button', { name: 'Mit Profil verbinden', exact: true }).click();
  await page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).waitFor({ state: 'hidden' });
}
export async function copyValue(page, label) {
  const button = page.getByRole('button', { name: `${label} kopieren`, exact: true });
  const value = (await button.locator('..').locator('code').innerText()).trim();
  check(/^[a-f0-9-]{36}$/i.test(value), 'live_ui_message_identifier_missing');
  return value;
}
export async function loginSender(page) {
  await page.locator('.connection-button').click();
  await page.getByText('Anderen Zugang verwenden', { exact: true }).click();
  await page.locator('#client-id').fill(process.env.SENDERID);
  await page.locator('#client-secret').fill(process.env.SENDERSECRET);
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel.*geschützt speichern/ }).check();
  await page.locator('#profile-name').fill('CI UI sender');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true }).waitFor({ state: 'hidden' });
  await until(
    async () => (await page.locator('.connection-button').innerText()).includes('Verbunden'),
    'live_ui_login_failed',
  );
  console.log('Real desktop UI: credential login and protected profile saving passed');
}
export async function senderProfileId(page, api = 'v3') {
  await page.locator('.connection-button').click();
  const option = page
    .locator('#saved-profile-choice option')
    .filter({ hasText: new RegExp(`CI UI sender.*${api}`) });
  const id = await option.first().getAttribute('value');
  await page.getByRole('button', { name: 'Verbindungsdialog schließen', exact: true }).click();
  check(id, 'live_ui_sender_profile_missing');
  return id;
}
export async function switchApi(page, api) {
  await page.locator('#session-api').selectOption(api);
  await until(
    async () =>
      (await page.locator('#session-api').inputValue()) === api &&
      !(await page.locator('#session-api').isDisabled()),
    'live_ui_api_switch_incomplete',
  );
}
export async function sendSubmission(page, fixture, api = 'v3', xml = false, invalid = false) {
  await navigate(page, 'Senden');
  await switchApi(page, api);
  const next = page.getByRole('button', { name: 'Nächsten Test vorbereiten', exact: true });
  if (await next.isVisible()) {
    await next.click();
    const dialog = page.getByRole('dialog', { name: 'Nächsten Test vorbereiten?', exact: true });
    for (const input of await dialog.getByRole('checkbox').all()) await input.uncheck();
    await dialog.getByRole('button', { name: 'Neuen Entwurf beginnen', exact: true }).click();
  }
  await page
    .getByRole('group', { name: 'Versandabschnitte', exact: true })
    .getByRole('button', { name: 'Adressierung', exact: true })
    .click();
  await page.locator('#send-target').fill(fixture.destination);
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.locator('#send-service').selectOption(fixture.service);
  if (api === 'v3') {
    const source = page.locator('#send-source');
    if (await source.evaluate((element) => element.tagName === 'SELECT')) {
      const listed = await source
        .locator('option')
        .evaluateAll((options, id) => options.some((option) => option.value === id), process.env.SENDERDEST);
      if (listed) await source.selectOption(process.env.SENDERDEST);
      else {
        await page.getByRole('button', { name: 'ID eingeben', exact: true }).click();
        await page.locator('#send-source').fill(process.env.SENDERDEST);
      }
    } else await source.fill(process.env.SENDERDEST);
  }
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  const schema = page.locator('#send-schema');
  const option = schema
    .locator('option')
    .filter({ hasText: xml ? /XML/ : /JSON/ })
    .first();
  await schema.selectOption(await option.getAttribute('value'));
  if (xml) {
    const path = join(fixture.directory, 'ui-schema.xsd');
    await writeFile(path, fixture.xmlSchema);
    await page.getByText('Lokale Schemata und technische Optionen', { exact: true }).click();
    await page.locator('input#send-validation-schemas').setInputFiles(path);
    await page.locator('[id^="send-local-schema-"]').fill(fixture.xmlUri);
  }
  const text = invalid
    ? '{}'
    : xml
      ? '<antrag><vorname>Erika</vorname><anliegen>Fiktiver UI-Test</anliegen></antrag>'
      : JSON.stringify({
          antragstellendePerson: { vorname: 'Erika', nachname: 'Musterfrau' },
          anliegen: 'Fiktiver UI-Test ohne echte Personendaten',
          referenz: fixture.runName,
        });
  await page.locator('#send-data').fill(text);
  if (invalid) {
    await page.getByText('Lokale Schemata und technische Optionen', { exact: true }).click();
    await page
      .getByRole('checkbox', {
        name: 'Für einen bewussten Negativtest ohne Fachdaten-Schemaprüfung senden',
        exact: true,
      })
      .check();
  } else await page.getByRole('button', { name: 'Fachdaten gegen Schema prüfen', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  const removeAttachment = page.getByRole('button', { name: 'Anlage entfernen', exact: true });
  while (await removeAttachment.count()) await removeAttachment.first().click();
  await page.getByRole('checkbox', { name: 'Antworten über FIT-Connect anbieten', exact: true }).check();
  await page.locator('#send-reply-schema').selectOption(fixture.replyUri);
  const attachment = join(fixture.directory, 'ui-test-attachment.txt');
  await writeFile(attachment, 'Fiktive TEST-Anlage aus der installierten Oberfläche.');
  const pdf = join(fixture.directory, 'ui-fictional-attachment.pdf');
  await writeFile(
    pdf,
    await readFile(new URL('../../frontend/test-fixtures/assets/fictional-attachment.pdf', import.meta.url)),
  );
  await page.locator('input#send-attachments').setInputFiles([attachment, pdf]);
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true })
    .getByRole('button', { name: 'Jetzt an FIT-Connect senden', exact: true })
    .click();
  await page.getByText('An FIT-Connect übergeben', { exact: true }).filter({ visible: true }).waitFor();
  const submissionId = await copyValue(page, 'Submission ID');
  const caseId = await copyValue(page, 'Case ID');
  console.log(
    `Real desktop UI: ${api} ${xml ? 'XML' : 'JSON'} schema check, attachment and one confirmed send passed`,
  );
  return { submissionId, caseId, text, api, invalid };
}
export async function openSubmission(page, fixture, message) {
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Einreichungen', exact: true }).click();
  await page.locator('#pickup-destination').fill(fixture.destination);
  await page.locator('#pickup-submission').fill(message.submissionId);
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await page.getByRole('heading', { name: 'Antrag lesen', exact: true }).waitFor();
  console.log('Real desktop UI: actual submission fetch, decryption, schema and attachment view passed');
}
async function verifiedEventView(page) {
  const panel = page.locator('[aria-labelledby="event-log-title"]');
  await until(async () => {
    const codes = (await panel.locator('.small-note code').allTextContents())
      .map((text) => diagnosticCode(text.trim()))
      .filter((code) => code !== 'unknown_error');
    if (codes.length) throw new Error(`live_ui_event_${codes[0]}`);
    return panel.getByText('Event Log verifiziert', { exact: true }).isVisible();
  }, 'live_ui_event_log_not_verified');
}
export async function queryEventLog(page, fixture, message, reply = false) {
  await navigate(page, 'Event Log');
  await page.locator('#event-kind').selectOption(reply ? 'reply' : 'submission');
  if (!reply) await page.locator('#event-destination').fill(fixture.destination);
  await page.locator('#event-case').fill(message.caseId);
  await page
    .locator(reply ? '#event-reply' : '#event-submission')
    .fill(reply ? message.replyId : message.submissionId);
  await page.getByRole('button', { name: /^(Event Log prüfen|Erneut prüfen)$/ }).click();
  await verifiedEventView(page);
  await until(
    async () => (await page.locator('.event-log-entry:visible').count()) > 0,
    'live_ui_event_log_empty',
  );
  await page.locator('#event-kind').selectOption('case');
  await page.getByRole('button', { name: /^(Event Log prüfen|Erneut prüfen)$/ }).click();
  await verifiedEventView(page);
  console.log(
    `Real desktop UI: authenticated signed ${reply ? 'reply' : 'submission'} and case event-log queries passed`,
  );
}
export async function replyAndAccept(desktop, fixture, message, saveBeforeAccept = false) {
  const { page } = desktop;
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
  // Guided reply opening already loads the offered channel and then reveals this field.
  await page.locator('#reply-data').waitFor();
  await page.locator('#reply-data').fill(
    JSON.stringify({
      status: 'eingegangen',
      nachricht: 'Fiktive Antwort aus der installierten Oberfläche.',
      geschaeftszeichen: fixture.runName,
    }),
  );
  await page.locator('[aria-labelledby="reply-send-title"] button[type=submit]').click();
  await page.getByRole('button', { name: 'Antwort jetzt senden', exact: true }).click();
  await page.getByRole('button', { name: 'Reply ID kopieren', exact: true }).waitFor();
  message.replyId = await copyValue(page, 'Reply ID');
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const dialog = page.locator('dialog[aria-labelledby="receipt-confirm-title"]');
  const key = page.locator('#receipt-key');
  await until(
    async () => (await dialog.isVisible()) || (await key.isVisible()),
    'live_ui_receipt_not_prepared',
  );
  if (!(await dialog.isVisible())) {
    await key.selectOption(fixture.signingKid);
    await page.getByRole('button', { name: 'Annahme prüfen', exact: true }).click();
  }
  let folder;
  if (saveBeforeAccept) {
    await page.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true }).check();
    folder = await nativeFolder(desktop, fixture, () =>
      page.getByRole('button', { name: 'Speichern und annehmen', exact: true }).click(),
    );
  } else {
    await page.getByRole('radio', { name: 'Nein, ohne Download annehmen', exact: true }).check();
    await page.getByRole('button', { name: 'Jetzt annehmen', exact: true }).click();
  }
  await page.getByText('Annahme von FIT-Connect bestätigt', { exact: true }).waitFor();
  if (folder) await verifyDownload(folder, message);
  console.log('Real desktop UI: actual reply send and explicit submission acceptance passed');
  await queryEventLog(page, fixture, message);
}
export async function otherAreas(page) {
  for (const name of ['Start', 'Vorgänge', 'Destinations', 'Prozesse', 'Testwerkzeuge', 'Diagnose', 'Info'])
    await navigate(page, name);
  await page.getByText('Version 0.2.0', { exact: false }).first().waitFor();
  console.log('Real desktop UI: all workspace navigation and installed version view passed');
}
