// Failure-only observations of the real UI. No raw messages, values, bodies or identifiers.
import { explain, diagnosticLabels } from '../../frontend/src/send/messages.js';
import { diagnosticCode } from '../../frontend/src/diagnostics.js';
export async function sendDiagnostics(page) {
  const root = page.locator('[aria-labelledby="send-title"]');
  const messages = await root
    .locator('.action-notice p, dialog[open] [role="alert"], [role="status"] > p')
    .allTextContents();
  const known = [
    'engine_busy',
    'engine_timeout',
    'engine_disconnected',
    'engine_protocol_error',
    'authentication_failed',
    'auth_unavailable',
    'resource_unavailable',
    'resource_denied',
    'invalid_resource',
    'send_locked',
    'confirmation_expired',
    'reply_metadata_required',
    'vault_pending',
    'vault_unavailable',
    'case_limit',
    'case_storage_pending',
    'scanner_busy',
    'malware_detected',
    'malware_scan_failed',
    'content_cleanup_failed',
    'network_timeout',
    'network_connection_failed',
    'network_tls_error',
    'proxy_authentication_required',
  ];
  const rows = [];
  for (const row of await root.locator('.submission-result-table tbody tr').all()) {
    const cells = await row.locator('td').allTextContents();
    rows.push({
      step:
        Object.entries(diagnosticLabels).find(([, label]) => label === cells[0]?.trim())?.[0] || 'unknown',
      http: /^[1-5][0-9]{2}$/.test(cells[2]?.trim()) ? Number(cells[2].trim()) : null,
      code: diagnosticCode(cells[3]?.trim().split(/\s/)[0]),
    });
  }
  console.error(
    `Real desktop send failure: ${JSON.stringify({
      codes: known.filter((code) => messages.some((text) => text.trim() === explain(code))),
      uncertain: await root.getByText('Versandausgang ungewiss', { exact: true }).isVisible(),
      failed: await root.getByText('Versand fehlgeschlagen', { exact: true }).isVisible(),
      confirmationOpen: await root
        .getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true })
        .isVisible(),
      rows,
    })}`,
  );
}
