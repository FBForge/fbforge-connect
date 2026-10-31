import { startIcapTestService } from '../scanner/icap-test-service.mjs';
import { SCANNER_PROBLEM_TEXT } from '../live-scanner-fixture.mjs';
import { navigate, connectProfile, openSubmission } from './exchange.mjs';
import { check, until } from './desktop.mjs';
import { nativeAttachmentReview, nativeScannerReview } from './downloads.mjs';

async function configure(desktop, fixture, kind, port) {
  const { page } = desktop;
  await navigate(page, 'Virenscan');
  await page.getByRole('combobox', { name: 'Verfahren', exact: true }).selectOption(kind);
  if (kind === 'icap') {
    await page.getByRole('textbox', { name: 'Host', exact: true }).fill('127.0.0.1');
    await page.getByRole('spinbutton', { name: 'Port', exact: true }).fill(String(port));
    await page.getByRole('textbox', { name: 'Dienstpfad', exact: true }).fill('/scan');
  }
  await nativeScannerReview(desktop, fixture, () =>
    page.getByRole('button', { name: 'Scanner-Einstellung anwenden', exact: true }).click(),
  );
  await page
    .getByText(`Aktiv: ${kind === 'local' ? 'Lokaler ClamAV' : 'Eigener ICAP-Dienst'}`, { exact: true })
    .waitFor();
  if (kind === 'local') await page.getByText('Scanner läuft lokal', { exact: true }).waitFor();
}

export async function scannerProblemAcceptance(desktop, fixture) {
  if (process.env.FBFORGE_UI_SCANNER !== 'true') return;
  let findings = 0;
  const peer = await startIcapTestService(async (bytes) => {
    if (bytes.equals(Buffer.from(SCANNER_PROBLEM_TEXT))) {
      findings++;
      return 'stream: Controlled-Benign-Fixture FOUND';
    }
    return 'stream: OK';
  });
  try {
    const { page } = desktop;
    for (const api of ['v2', 'v3']) {
      const message = await fixture.sendScannerFixture(api);
      await connectProfile(page, fixture.receiverProfiles.find((profile) => profile.api === api).id);
      await configure(desktop, fixture, 'icap', peer.port);
      try {
        await openSubmission(page, fixture, message);
        const blocked = page.getByRole('region', { name: 'Gesperrte Anlagen', exact: true });
        await blocked.getByText('controlled-finding.txt', { exact: true }).waitFor();
        const attachmentId = (await blocked.locator('code').innerText()).trim();
        check(/^[0-9a-f-]{36}$/.test(attachmentId), 'live_ui_scanner_attachment_id_missing');
        check((await blocked.getByRole('button').count()) === 0, 'live_ui_scanner_blocked_bytes_exposed');
        check(
          await page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true }).isDisabled(),
          'live_ui_scanner_export_not_blocked',
        );
        await page
          .locator('.document-attachments')
          .getByText('clean-scanner-fixture.txt', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
        const dialog = page.locator('dialog[aria-labelledby="receipt-confirm-title"]');
        const key = page.locator('#receipt-key');
        await until(
          async () => (await dialog.isVisible()) || (await key.isVisible()),
          'live_ui_scanner_receipt_not_prepared',
        );
        if (!(await dialog.isVisible())) {
          await key.selectOption(fixture.signingKid);
          await page.getByRole('button', { name: 'Annahme prüfen', exact: true }).click();
        }
        check((await dialog.getByRole('radio').count()) === 0, 'live_ui_scanner_incomplete_export_offered');
        await nativeAttachmentReview(desktop, fixture, () =>
          dialog.getByRole('button', { name: 'Mit Anlagenproblemen annehmen', exact: true }).click(),
        );
        await page.getByText('Annahme von FIT-Connect bestätigt', { exact: true }).waitFor();
        await fixture.verifyScannerReceipt(message, attachmentId);
      } finally {
        await configure(desktop, fixture, 'local');
      }
    }
    check(findings === 2, 'live_ui_scanner_controlled_finding_count_wrong');
    console.log(
      'Real desktop UI: v2/v3 controlled ICAP findings withheld only affected attachments; explicit native acceptance and signed problem receipts passed (no EICAR sent)',
    );
  } finally {
    await peer.close();
  }
}
