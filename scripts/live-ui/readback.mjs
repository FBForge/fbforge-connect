import { navigate, queryEventLog } from './exchange.mjs';
import { check, until } from './desktop.mjs';
import { downloadMessage, nativeFolder, verifyDownload } from './downloads.mjs';

export async function previewPdf(page) {
  const row = page
    .locator('.document-attachments li:visible')
    .filter({ hasText: 'ui-fictional-attachment.pdf' });
  await row.getByRole('button', { name: 'Ansehen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lokale Vorschau', exact: true });
  await dialog.getByText('Seite 1 von 2', { exact: true }).waitFor();
  await dialog.getByText('Seitentext lesen', { exact: true }).click();
  await dialog
    .locator('.pdf-page-text')
    .getByText(/Fiktiver Nachweis/)
    .waitFor();
  const next = dialog.getByRole('button', { name: 'Nächste Seite', exact: true });
  const scroller = dialog.getByRole('region', { name: 'PDF-Seiteninhalt', exact: true });
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  check(
    await next.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    'live_ui_pdf_controls_offscreen',
  );
  await next.click();
  await dialog.getByText('Seite 2 von 2', { exact: true }).waitFor();
  await until(
    async () => await scroller.evaluate((element) => element.scrollTop === 0),
    'live_ui_pdf_page_scroll_not_reset',
  );
  check(
    (await dialog.locator('a,input,iframe,object,embed').count()) === 0,
    'live_ui_pdf_active_content_exposed',
  );
  await dialog.getByRole('button', { name: 'Vorschau schließen', exact: true }).click();
  console.log(
    'Real desktop UI: transferred PDF preview, accessible page text, fixed navigation and page-scroll reset passed',
  );
}

export async function receiveReply(desktop, fixture, message, download = false) {
  const { page } = desktop;
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Antworten', exact: true }).click();
  await page.locator('#reply-lookup-case').fill(message.caseId);
  await page.locator('#reply-lookup-id').fill(message.replyId);
  await page.getByRole('button', { name: 'Antwort direkt öffnen', exact: true }).click();
  await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
  await page.getByRole('heading', { name: 'Antwort lesen', exact: true }).waitFor();
  if (download) await downloadMessage(desktop, fixture, message, true);
  const receipt = page.locator('[aria-labelledby="reply-receipt-title"]');
  await receipt.getByRole('button', { name: 'Aktion vorbereiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Antwort annehmen?', exact: true });
  await dialog.getByRole('button', { name: 'Jetzt annehmen', exact: true }).click();
  await receipt.getByText('FIT-Connect hat die Annahme bestätigt.', { exact: true }).waitFor();
  await queryEventLog(page, fixture, message, true);
  console.log(
    'Real desktop UI: restored reply key, decryption, schema check and reply acknowledgement passed',
  );
}

export async function bulkReceive(desktop, fixture, valid, invalid) {
  const { page } = desktop;
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Einreichungen', exact: true }).click();
  const back = page.getByRole('button', { name: 'Zurück zum Eingang', exact: true });
  if (await back.isVisible()) await back.click();
  await page.locator('#pickup-destination').fill(fixture.destination);
  await page.locator('#pickup-submission').fill('');
  await page.getByRole('button', { name: 'Einreichungen laden', exact: true }).click();
  for (const message of [valid, invalid])
    await page
      .getByRole('checkbox', { name: `Einreichung ${message.submissionId} auswählen`, exact: true })
      .check();
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  const key = dialog.getByRole('combobox', { name: 'Signaturschlüssel', exact: true });
  const start = dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true });
  // A single usable key is selected automatically; the selector exists only for multiple keys.
  await until(
    async () => (await key.isVisible()) || !(await start.isDisabled()),
    'live_ui_bulk_signing_key_unavailable',
  );
  if (await key.isVisible()) await key.selectOption(fixture.signingKid);
  await dialog.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
  const folder = await nativeFolder(desktop, fixture, () => start.click());
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).waitFor();
  const rows = dialog.locator('.batch-results > li');
  check((await rows.count()) === 2, 'live_ui_bulk_result_incomplete');
  await rows
    .filter({ hasText: valid.submissionId })
    .getByText('Gespeichert und angenommen', { exact: true })
    .waitFor();
  await rows.filter({ hasText: invalid.submissionId }).getByText('Manuell prüfen', { exact: true }).waitFor();
  await verifyDownload(folder, valid);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  console.log(
    'Real desktop UI: multi-selection saved and accepted only valid data; schema-invalid data remained open for manual review',
  );
}

export async function rejectInvalid(page, fixture, message) {
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Einreichungen', exact: true }).click();
  await page.locator('#pickup-destination').fill(fixture.destination);
  await page.locator('#pickup-submission').fill(message.submissionId);
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  // An actual negative-test payload must fail schema validation and remain unaccepted.
  await page.getByText('Fachdaten passen nicht zum Schema', { exact: true }).first().waitFor();
  check(
    !(await page.getByRole('button', { name: 'Annehmen', exact: true }).isVisible()),
    'live_ui_invalid_data_accepted',
  );
  await page.getByRole('button', { name: 'Ohne Entschlüsselung ablehnen', exact: true }).click();
  await page.locator('#receipt-reason').selectOption('data-schema-violation');
  await page.locator('#receipt-description').fill('Fiktiver Negativtest: erforderliche JSON-Felder fehlen.');
  await page.getByRole('button', { name: 'Ablehnung prüfen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung ablehnen?', exact: true });
  const key = page.locator('#receipt-key');
  await until(
    async () => (await dialog.isVisible()) || (await key.isVisible()),
    'live_ui_rejection_keys_missing',
  );
  if (!(await dialog.isVisible())) {
    await key.selectOption(fixture.signingKid);
    await page.getByRole('button', { name: 'Ablehnung prüfen', exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Jetzt ablehnen', exact: true }).click();
  await page.getByText('Ablehnung von FIT-Connect bestätigt', { exact: true }).waitFor();
  await queryEventLog(page, fixture, message);
  console.log(
    'Real desktop UI: actual schema failure blocked acceptance; explicit reasoned rejection passed',
  );
}

export async function caseWorkspace(page, message) {
  await navigate(page, 'Vorgänge');
  await page.getByRole('button', { name: 'Übersicht aktualisieren', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Vorgänge durchsuchen', exact: true }).fill(message.caseId);
  const row = page.locator('.case-list .case-open');
  await until(async () => (await row.count()) === 1, 'live_ui_case_not_found');
  await row.click();
  await page.locator('#case-detail-title').waitFor();
  check((await page.locator('.case-timeline button').count()) >= 2, 'live_ui_case_timeline_incomplete');
  console.log('Real desktop UI: sent/received case grouping and local message reopening passed');
}
