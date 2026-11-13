import { diagnosticCode } from '../../frontend/src/diagnostics.js';
import { sendDiagnostics } from './send-diagnostics.mjs';
export async function failureDiagnostics(desktop, stage, error) {
  const page = desktop.page;
  await sendDiagnostics(page).catch(() => {});
  const values = await page
    .locator(
      '[aria-labelledby="event-log-title"] .small-note code, .action-notice:visible code, [aria-labelledby="trace-title"] .trace-details code, .message-batch-dialog[open] .trace-details code',
    )
    .allTextContents()
    .catch(() => []);
  const codes = [
    ...new Set(values.map((v) => diagnosticCode(v.trim())).filter((v) => v !== 'unknown_error')),
  ];
  // Actual SDK text remains local. Log exception class names and numeric HTTP status only.
  const sdkTypes = (
    await page.locator('.action-notice:visible .sdk-diagnostics .small-note').allTextContents()
  )
    .map((text) => text.split(' · ').at(-1))
    .filter((type) => /^[A-Za-z][A-Za-z0-9_$]{0,127}$/.test(type));
  const sdkHttp = (await page.locator('.action-notice:visible .sdk-message').allTextContents()).flatMap(
    (text) =>
      [...text.matchAll(/\b(?:HTTP(?:\/[0-9.]+)?|status(?: code)?)\s*[:=]?\s*([1-5][0-9]{2})\b/gi)].map((m) =>
        Number(m[1]),
      ),
  );
  console.error(`Real desktop failure codes: ${JSON.stringify({ codes, sdkTypes, sdkHttp })}`);
  const batchLabels = {
    'Wird geprüft': 'checking',
    'Wird gespeichert': 'saving',
    'Annahme wird bestätigt': 'accepting',
    Gespeichert: 'saved',
    'Gespeichert und angenommen': 'accepted',
    'Gespeichert und mit Schemaabweichungen angenommen': 'accepted_with_schema_problem',
    'Manuell prüfen': 'manual',
    'Ausgang ungewiss': 'uncertain',
    Abgebrochen: 'cancelled',
  };
  const batch = (
    await page.locator('.message-batch-dialog[open] .batch-results > li > strong').allTextContents()
  ).map((label) => batchLabels[label.trim()] || 'unknown');
  console.error(`Real desktop batch states: ${JSON.stringify(batch)}`);
  console.error(
    `Real desktop UI failure state: ${JSON.stringify({
      submissionDetail: await page.locator('.submission-information').isVisible(),
      submissionLoadError: await page.locator('.submission-inbox [role="alert"]').isVisible(),
      schemaConsent: await page
        .getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?', exact: true })
        .isVisible(),
      receiveDocument: await page.getByRole('heading', { name: 'Antrag lesen', exact: true }).isVisible(),
    })}`,
  );
  const location = /live-ui[\\/][a-z0-9-]+\.mjs:\d+:\d+/.exec(error.stack || '')?.[0];
  const diagnostic = /^live_ui_[a-z_]+$/.test(error.message || '') ? error.message : 'ui_driver_error';
  console.error(`Real desktop UI failed at ${stage}; ${diagnostic}; ${location || 'no source location'}`);
}
