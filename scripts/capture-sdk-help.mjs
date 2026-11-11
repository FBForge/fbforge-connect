import { expect } from '@playwright/test';

// Real application views with an explicitly synthetic SDK failure, never customer data.
export async function captureSdkHelp({ page, open, button, capture }) {
  await open('test-fixtures/application-view.html?app=1&api=v2');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'verify_submission')
        throw {
          code: 'verification_failed',
          diagnostics: [
            {
              stage: 'METADATA',
              type: 'UnsupportedReplyChannel',
              message: 'The reply channel is not supported by this destination.',
            },
          ],
        };
      return original(command, args);
    };
  });
  await page.locator('#session-api').selectOption('v2');
  await button('Einreichungen abrufen').click();
  await page.locator('#client-id').fill('synthetic-guide-client');
  await page.locator('#client-secret').fill('synthetic-guide-secret');
  await button('Anmelden').click();
  await expect(page.locator('#destination-id')).toBeEnabled();
  await page.locator('#destination-id').fill('00000002-1111-4111-8111-111111111111');
  await button('Destination laden').click();
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await button('Einreichung öffnen und prüfen').click();
  const notice = page.locator('.receive-workspace [role="alert"]');
  await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
  await expect(notice).toContainText('The reply channel is not supported');
  await capture('receive-sdk-error', notice);
  await button('Diagnose').click();
  const row = page.getByRole('row').filter({ hasText: 'Einreichung entschlüsseln und prüfen' });
  await row.getByText('Fehlercode anzeigen', { exact: true }).click();
  await expect(row).toContainText('UnsupportedReplyChannel');
  await capture('sdk-error-log', page.getByRole('heading', { name: 'Technische Aufrufe', exact: true }));
}
