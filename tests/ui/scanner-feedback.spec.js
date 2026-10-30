import { test, expect } from '@playwright/test';
const button = (page, name) => page.getByRole('button', { name, exact: true });
for (const api of ['v2', 'v3']) {
  for (const status of ['passed', 'not_configured', 'unknown']) {
    test(`attachment badges reflect proven scan results (${api}, ${status})`, async ({ page }) => {
      await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
      await page.evaluate((status) => {
        const original = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = async (command, args) => {
          const result = await original(command, args);
          if (command === 'verify_submission') {
            result.data.warnings =
              status === 'unknown'
                ? []
                : [status === 'passed' ? 'MALWARE_SCAN_PASSED' : 'MALWARE_SCAN_NOT_CONFIGURED'];
            result.data.warningCount = result.data.warnings.length;
          }
          return result;
        };
      }, status);
      await button(page, 'Inhalte entschlüsseln und prüfen').click();
      const rows = page.getByRole('list', { name: 'Anlagenliste', exact: true }).locator('li');
      await expect(rows).toHaveCount(1);
      const badge = rows.first().locator('.attachment-scan-result .status-badge');
      await expect(badge).toContainText(
        status === 'passed'
          ? 'Virenscan: kein Fund'
          : status === 'not_configured'
            ? 'Nicht auf Schadsoftware geprüft'
            : 'Kein bestätigter Virenscan',
      );
      if (status === 'passed') {
        await expect(badge).toHaveClass(/\bok\b/);
        await expect(badge.locator('[aria-hidden=true]')).toHaveText('✓');
      } else await expect(rows.locator('.attachment-scan-result .ok')).toHaveCount(0);
    });
  }
  test(`a scanner finding blocks preparation with visible send-specific guidance (${api})`, async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
    if (api === 'v2') await button(page, 'API wechseln').click();
    else await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
    await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
    await button(page, 'Leistungen laden').click();
    await button(page, 'Weiter: Fachdaten').click();
    await button(page, 'Weiter: Anlagen & Antwortkanal').click();
    await page.evaluate(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__scanSendWrites = 0;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'prepare_send') throw 'malware_detected';
        if (command === 'execute_send') window.__scanSendWrites++;
        return original(command, args);
      };
    });
    await button(page, 'Versand vorbereiten').click();
    const notice = page.locator('.action-notice[role=alert]');
    await expect(notice).toContainText('Versand wurde blockiert');
    await expect(notice).toContainText('Entfernen oder ersetzen');
    await expect(notice).not.toContainText('ablehnen');
    expect(await page.evaluate(() => window.__scanSendWrites)).toBe(0);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
}

test('form-label loading is grouped with the form view and preserves the draft without preparing a send', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await button(page, 'Leistungen laden').click();
  await button(page, 'Weiter: Fachdaten').click();
  const text = '{"vorname":"Erika","nachname":"Musterfrau"}';
  await page.locator('#send-data').fill(text);
  await page.evaluate(() => {
    window.__formCalls = [];
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__formCalls.push(command);
      return original(command, args);
    };
  });
  const preview = page.locator('.draft-data-preview');
  await preview.getByRole('button', { name: 'Formularbeschriftungen laden', exact: true }).click();
  await expect(preview).toContainText('Schema für die Formularansicht geladen');
  await expect(page.locator('#send-data')).toHaveValue(text);
  await button(page, 'Formularansicht').click();
  await expect(page.locator('.draft-inline-preview')).toContainText('Vorname');
  expect(
    await page.evaluate(() =>
      window.__formCalls.some((command) => ['prepare_send', 'execute_send'].includes(command)),
    ),
  ).toBe(false);
});
