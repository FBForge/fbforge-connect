import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

test('the Event Log view displays the SDK reason without claiming successful verification', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?app=1');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'load_case_event_log')
        throw {
          code: 'verification_failed',
          diagnostics: [
            {
              stage: 'EVENT_LOG',
              type: 'FitConnectEventLogException',
              message: 'Inconsistent event log: submission event is missing.',
            },
          ],
        };
      return original(command, args);
    };
  });
  await page.getByRole('button', { name: 'Einreichungen abrufen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Event Log', exact: true }).click();
  await page.locator('#event-case').fill('00000004-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Event Log prüfen', exact: true }).click();
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('Event Log konnte nicht geprüft werden');
  await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
  await expect(notice).toContainText('Inconsistent event log: submission event is missing.');
  await expect(page.getByText('Event Log verifiziert', { exact: true })).toHaveCount(0);
});

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

for (const api of ['v2', 'v3']) {
  test(`${api} preserves SDK reasons in reception and the technical log without exporting message text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: api === 'v2' ? 1180 : 420, height: 900 });
    await page.emulateMedia({ colorScheme: api === 'v3' ? 'dark' : 'light' });
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?app=1&api=${api}`);
    await page.evaluate(() => {
      let attempt = 0;
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'verify_submission') {
          attempt++;
          throw {
            code: 'verification_failed',
            diagnostics: [
              {
                stage: attempt === 1 ? 'METADATA' : 'EVENT_LOG',
                type: attempt === 1 ? 'UnsupportedReplyChannel' : 'EventLogException',
                message:
                  attempt === 1
                    ? 'The reply channel is not supported by this destination.'
                    : 'Inconsistent event log. <img src=x onerror=alert(1)>',
              },
            ],
          };
        }
        return original(command, args);
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__copiedSdk = value;
          },
        },
      });
    });
    await page.locator('#session-api').selectOption(api);
    await page.getByRole('button', { name: 'Einreichungen abrufen', exact: true }).click();
    await page.locator('#client-id').fill('synthetic-client');
    await page.locator('#client-secret').fill('synthetic-secret');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.locator('#destination-id')).toBeEnabled();
    await page.locator('#destination-id').fill('00000002-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
    await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
    const notice = page.locator('.receive-workspace [role="alert"]');
    await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
    await expect(notice).toContainText('The reply channel is not supported by this destination.');
    await expect(notice).toContainText('Metadaten prüfen');
    await notice.getByRole('button', { name: 'SDK-Meldungen kopieren', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__copiedSdk)).toContain('UnsupportedReplyChannel');
    await expect(notice.getByRole('button', { name: 'Manuelle Ablehnung', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include('.receive-workspace').analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('sdk-receive-reason.png'), fullPage: true });
    await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
    await expect(notice).toContainText('Inconsistent event log.');
    await expect(notice).not.toContainText('UnsupportedReplyChannel');
    await expect(notice.locator('.sdk-diagnostics img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Diagnose', exact: true }).click();
    const rows = page.getByRole('row').filter({ hasText: 'Einreichung entschlüsseln und prüfen' });
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await row.getByText('Fehlercode anzeigen', { exact: true }).click();
    await expect(rows.first()).toContainText('Inconsistent event log.');
    await expect(rows.last()).toContainText('The reply channel is not supported by this destination.');
    await expect(page.locator('.report-preview')).not.toContainText('UnsupportedReplyChannel');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('sdk-technical-log.png'), fullPage: true });
  });
}
