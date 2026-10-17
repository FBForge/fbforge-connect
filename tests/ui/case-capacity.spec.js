import { test, expect } from '@playwright/test';
test('full local history blocks before send, keeps the confirmation recoverable and shows the reason in the dialog', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__caseGuardCalls = 0;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'execute_send') {
        window.__caseGuardCalls++;
        throw 'case_limit';
      }
      return original(command, args);
    };
  });
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  const data = '{"vorname":"Erika","nachname":"Musterfrau"}';
  await page.locator('#send-data').fill(data);
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung an TEST senden?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Jetzt an TEST senden', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Vorgangsablage ist voll');
  expect(await page.evaluate(() => window.__caseGuardCalls)).toBe(1);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.locator('#send-data')).toHaveValue(data);
  await expect(page.getByText('Versandausgang ungewiss', { exact: true })).toHaveCount(0);
});
