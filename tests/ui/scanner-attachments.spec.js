import { test, expect } from '@playwright/test';
import { openBatch, id } from '../../frontend/test-fixtures/message-batch.js';

async function blockedMessage(page, replies = false) {
  await openBatch(page, { replies, total: 1 });
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await original(command, args);
      if (['verify_submission', 'verify_reply'].includes(command)) {
        result.data.partCount = 2;
        result.data.warningCount = 1;
        result.data.warnings = ['MALWARE_ATTACHMENT_BLOCKED'];
        result.data.blockedAttachments = [{ attachmentId: uuid(8), fileName: 'Gesperrte Testanlage.txt' }];
      }
      if (['list_received_contents', 'list_received_reply_contents'].includes(command)) {
        result.data.total = 2;
        result.data.parts = args.offset === 0 ? result.data.parts : [];
        result.data.blockedAttachmentCount = 1;
      }
      if (command === 'prepare_receipt') result.data.warnings = ['MALWARE_ATTACHMENT_BLOCKED'];
      return result;
    };
  });
}

test('a blocked attachment remains named without bytes or full export; single acceptance explicitly reports problems', async ({
  page,
}) => {
  await blockedMessage(page);
  await page.getByRole('button', { name: 'Öffnen und prüfen', exact: true }).first().click();
  const blocked = page.getByRole('region', { name: 'Gesperrte Anlagen' });
  await expect(blocked).toContainText('Gesperrte Testanlage.txt');
  await expect(blocked).toContainText(id(8));
  await expect(blocked.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung annehmen?', exact: true });
  await expect(dialog).toContainText('Eine Annahme meldet diese Anlagen als Problem');
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Mit Anlagenproblemen annehmen', exact: true }).click();
  await expect(dialog).toBeHidden();
  const state = await page.evaluate(() => window.__batchFixture);
  expect(state.writes).toEqual([id(3)]);
  expect(state.saves).toEqual([]);
  expect(
    state.calls.filter((call) => call.command.startsWith('read_received') && call.contentId === id(7)),
  ).toEqual([]);
  const draft = JSON.parse(state.calls.find((call) => call.command === 'prepare_receipt').receiptDocument);
  expect(draft).not.toHaveProperty('blockedAttachments'); // The native proof supplies problem IDs.
});

test('cancelling an acceptance with attachment problems sends nothing', async ({ page }) => {
  await blockedMessage(page);
  await page.getByRole('button', { name: 'Öffnen und prüfen', exact: true }).first().click();
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung annehmen?', exact: true });
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});

test('batch review saves no incomplete archive and never automatically accepts a malware finding', async ({
  page,
}) => {
  await blockedMessage(page);
  await page.getByRole('checkbox', { name: /Alle.*auswählen/ }).check();
  await page.getByRole('button', { name: /Prüfen.*speichern.*annehmen/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await expect(dialog.getByText('Manuell prüfen', { exact: true })).toHaveCount(1);
  const state = await page.evaluate(() => window.__batchFixture);
  expect(state.writes).toEqual([]);
  expect(state.saves).toEqual([]);
});

test('stored cases retain the blocked-file report and clean form without offering an incomplete original archive', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await page.evaluate(() => {
    const state = window.__caseFixture;
    state.scopes.a[0].warnings = ['MALWARE_ATTACHMENT_BLOCKED'];
    state.parts.push({
      contentId: '00000014-1111-4111-8111-111111111111',
      kind: 'scan-report',
      fileName: 'Virenscan.json',
      mimeType: 'application/json',
      description: null,
      bytes: new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          blockedAttachments: [
            { attachmentId: '00000099-1111-4111-8111-111111111111', fileName: 'Gesperrte Testanlage.txt' },
          ],
        }),
      ),
    });
  });
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Gesperrte Anlagen' })).toContainText(
    'Gesperrte Testanlage.txt',
  );
  await expect(page.locator('.application-field-value').filter({ hasText: 'Erika' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true })).toBeDisabled();
  await expect(page.locator('.document-attachments li')).toHaveCount(2);
  await expect(page.getByText('MALWARE_ATTACHMENT_BLOCKED', { exact: true })).toHaveCount(0);
});
