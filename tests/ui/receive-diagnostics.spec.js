import { test, expect } from '@playwright/test';

const cases = [
  ['malware_detected', 'Malwarescanner meldet einen Fund', /Scanner meldet einen Fund/],
  ['malware_scan_failed', 'Malwareprüfung nicht abgeschlossen', /nicht eindeutig freigeben/],
  ['receive_response_invalid', 'API-Antwort nicht lesbar', /API-Antwort.*erwarteten Format/],
  [
    'receive_message_mismatch',
    'Nachrichtenkennungen stimmen nicht überein',
    /Destination, Einreichung oder Vorgang/,
  ],
  ['receive_message_changed', 'Nachrichteninformationen haben sich geändert', /wiederholte Abrufe/],
  ['receive_attachments_invalid', 'Anlagenverzeichnis ist ungültig', /Anlagenkennungen mehrfach/],
  [
    'receive_key_mismatch',
    'Öffentlicher Prüfschlüssel passt nicht zur Abfrage',
    /gelieferte Schlüsselkennung/,
  ],
  ['receive_payload_invalid', 'Verschlüsseltes Nachrichtenformat ist ungültig', /JWE-Format/],
  ['receive_metadata_invalid', 'Metadaten sind nicht lesbar', /JSON-Objekt/],
  ['receive_metadata_schema_missing', 'Schema-Kennung der Metadaten fehlt', /\$schema-Kennung/],
  [
    'receive_metadata_schema_unsupported',
    'Metadatenversion wird nicht unterstützt',
    /lokales Fachdaten-Schema behebt diesen Fehler nicht/,
  ],
  ['receive_filename_invalid', 'Dateiname einer Anlage ist nicht verwendbar', /unzulässiger Anlagenname/],
  ['invalid_resource', 'Inhalte konnten nicht geprüft werden', /keinen genaueren Grund/],
];
for (const api of ['v2', 'v3']) {
  test(`${api} shows the failed step and reason and retains manual rejection`, async ({ page }) => {
    for (const [code, title, reason] of cases) {
      await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1&api=${api}`);
      await page.evaluate((failure) => {
        const original = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = async (command, args) => {
          if (command === 'verify_submission') throw failure;
          return original(command, args);
        };
      }, code);
      await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
      await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
      const error = page.locator('.receive-workspace [role="alert"]');
      await expect(error.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(error).toContainText(reason);
      await expect(error.getByRole('button', { name: 'Manuelle Ablehnung', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toHaveCount(0);
      await error.getByText('Technische Fehlerangaben', { exact: true }).click();
      await expect(error.locator('code')).toHaveText(code);
      await expect(page.getByRole('button', { name: 'Zurück zum Eingang', exact: true })).toBeInViewport({
        ratio: 1,
      });
      expect(
        await page.evaluate(() =>
          window.__applicationFixture.calls.some((command) => command.startsWith('execute_')),
        ),
      ).toBe(false);
    }
  });
}
