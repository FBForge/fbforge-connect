import { expect } from '@playwright/test';
import { openBatch, id as batchId } from '../frontend/test-fixtures/message-batch.js';

export async function captureReceiptHelp({ page, button, capture }) {
  await openBatch(page);
  await page.evaluate((value) => (window.__batchFixture.schemaError = value), batchId(4));
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
  await button('Prüfen, speichern und annehmen').click();
  await page.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
  await button('Zielordner wählen und starten').click();
  await expect(page.getByText('Gespeichert und angenommen', { exact: true })).toHaveCount(2);
  await capture('receive-batch');
  await button('Schließen').click();
  await openBatch(page, { replies: true });
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
  await button('Auswahl herunterladen').click();
  await button('Zielordner wählen und starten').click();
  await expect(page.getByText('Gespeichert', { exact: true })).toHaveCount(3);
  await capture('reply-batch');
  await button('Schließen').click();
  await openBatch(page);
  await button('Öffnen und prüfen').first().click();
  await button('Alle Dateien herunterladen').click();
  await expect(page.getByText('3 Dateien gespeichert.', { exact: true })).toBeVisible();
  await capture('message-download', page.locator('.document-layout'));
  await button('Annehmen').click();
  await page.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true }).check();
  await capture('receipt-download');
  await button('Abbrechen').click();

  await openBatch(page);
  await page.evaluate(() => (window.__batchFixture.schemaMismatch = true));
  await button('Öffnen und prüfen').first().click();
  await button('Annehmen').click();
  await page.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true }).check();
  await capture('receipt-schema-review');
  await button('Abbrechen').click();
  await openBatch(page);
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
  await button('Prüfen, speichern und annehmen').click();
  await page
    .getByRole('checkbox', {
      name: 'Trotz Schemaabweichungen annehmen und diese als Problem melden',
      exact: true,
    })
    .check();
  await capture('receive-batch-review');
  await button('Abbrechen').click();
}
