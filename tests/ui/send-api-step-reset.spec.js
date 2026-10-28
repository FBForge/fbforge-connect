import { test, expect } from '@playwright/test';

test('changing API returns a retained send draft to addressing and requires current offers', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'load_send_destination')
        return Promise.resolve({
          apiVersion: args.apiVersion,
          sessionId: args.sessionId,
          environment: 'TEST',
          data: {
            destinationId: args.destinationId,
            detailsJson: JSON.stringify({
              destinationId: args.destinationId,
              publicServices: [
                {
                  identifier: 'urn:test:api-draft',
                  submissionSchemas: [{ schemaUri: 'urn:test:draft', mimeType: 'application/json' }],
                },
              ],
            }),
          },
        });
      return original(command, args);
    };
  });
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-step-reset-client');
  await page.locator('#client-secret').fill('synthetic-only-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('API-Wechsel Test');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  const draft = '{"anliegen":"Fiktiver Entwurf bleibt erhalten"}';
  await page.locator('#send-data').fill(draft);
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.locator('#session-api').selectOption('v2');
  await expect(page.locator('#session-api')).toHaveValue('v2');
  await expect(page.locator('#send-target')).toBeVisible();
  await expect(page.locator('.send-sections button').filter({ hasText: 'Adressierung' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(page.locator('#send-service')).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.locator('#send-target')).toBeVisible();
  await expect(page.locator('.step-notice')).toContainText('Laden Sie zuerst die Leistungen');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.locator('#send-data')).toHaveValue(draft);
  const commands = await page.evaluate(() => window.__profilesFixture.calls.map((call) => call.command));
  expect(commands).not.toContain('prepare_send');
  expect(commands).not.toContain('execute_send');
});
