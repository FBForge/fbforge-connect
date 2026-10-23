import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openBatch, id } from '../../frontend/test-fixtures/message-batch.js';
async function select(page) {
  await page.getByRole('checkbox', { name: 'Alle auf dieser Seite auswählen', exact: true }).check();
}
test('a verified single submission downloads metadata, data and attachments with one action', async ({
  page,
}) => {
  await openBatch(page);
  await page.getByRole('button', { name: 'Öffnen und prüfen', exact: true }).first().click();
  const download = page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true });
  await expect(download).toBeVisible();
  await download.click();
  await expect(page.getByText('3 Dateien gespeichert.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__batchFixture.saves[0])).toEqual({
    proofId: id(9),
    recordId: null,
    messageId: id(3),
    reply: false,
  });
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
test('a verified reply also exports its original files with one action', async ({ page }) => {
  await openBatch(page, { replies: true });
  await page.getByRole('button', { name: 'Öffnen', exact: true }).first().click();
  await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
  const download = page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true });
  await expect(download).toBeVisible();
  await download.click();
  await expect(page.getByText('3 Dateien gespeichert.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__batchFixture.saves[0].reply)).toBe(true);
  expect(await page.evaluate(() => window.__batchFixture.saves[0].messageId)).toBe(id(3));
});
test('long batch results keep the close action in view', async ({ page }) => {
  await openBatch(page, { total: 25 });
  await page.getByRole('button', { name: 'Alle 25 auswählen', exact: true }).click();
  await page.getByRole('button', { name: 'Auswahl herunterladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nachrichten herunterladen', exact: true });
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect(dialog.getByText('Gespeichert', { exact: true })).toHaveCount(25);
  await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeInViewport({ ratio: 1 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('stopping while a file is being saved never accepts that message', async ({ page }) => {
  await openBatch(page);
  await page.evaluate(() => (window.__batchFixture.delaySave = true));
  await select(page);
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  await dialog.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__batchFixture.releaseSave))).toBe(true);
  await dialog.getByRole('button', { name: 'Durchlauf stoppen', exact: true }).click();
  await page.evaluate(() => window.__batchFixture.releaseSave());
  await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await expect(dialog.getByText('Abgebrochen', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
test('a historical case exports its available original files without restoring receipt permissions', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__caseExports = [];
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'begin_message_export')
        return { exportId: 'export-0000000000000001', directory: 'C:\\Fiktiver Export' };
      if (command === 'export_message') {
        window.__caseExports.push(args.source);
        return { directory: 'C:\\Fiktiver Export\\Kopie', fileCount: 3, totalBytes: 100 };
      }
      if (command === 'finish_message_export') return null;
      return original(command, args);
    };
  });
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true }).click();
  await expect(page.getByText('3 Dateien gespeichert.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__caseExports[0].recordId)).toBe(id(2));
  expect(await page.evaluate(() => window.__caseExports[0].proofId)).toBe(null);
  await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toHaveCount(0);
});
test('batch selection and confirmation remain readable in a narrow dark high-contrast window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 540 });
  await openBatch(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await select(page);
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  await page.addStyleTag({
    content:
      '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
  });
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }),
  ).toBeFocused();
});
test('selected messages are saved before acceptance and schema errors remain manually actionable', async ({
  page,
}) => {
  await openBatch(page);
  await page.evaluate((value) => (window.__batchFixture.schemaError = value), id(4));
  await select(page);
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  await dialog.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('list', { name: 'Ergebnisse des Durchlaufs' }).locator(':scope > li'),
  ).toHaveCount(3);
  await expect(dialog.getByText('Gespeichert und angenommen', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('Manuell prüfen', { exact: true })).toHaveCount(1);
  await expect(dialog).toContainText('Die Fachdaten passen nicht zum angegebenen Schema');
  const state = await page.evaluate(() => ({
    writes: window.__batchFixture.writes,
    saves: window.__batchFixture.saves,
    calls: window.__batchFixture.calls,
  }));
  expect(state.writes).toEqual([id(3), id(5)]);
  expect(state.saves.map((item) => item.messageId)).toEqual(state.writes);
  expect(state.calls.findIndex((item) => item.command === 'export_message')).toBeLessThan(
    state.calls.findIndex((item) => item.command === 'execute_receipt'),
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Einzeln öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen' })).toBeHidden();
  await expect(page.locator('#pickup-submission')).toHaveValue(id(4));
});
test('folder cancellation, failed saving and the missing malware-scan permission never accept messages', async ({
  page,
}) => {
  for (const failure of ['cancelFolder', 'failSave', 'noScanPermission']) {
    await openBatch(page);
    if (failure !== 'noScanPermission')
      await page.evaluate((key) => (window.__batchFixture[key] = true), failure);
    await select(page);
    await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
    if (failure !== 'noScanPermission')
      await dialog.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
    await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
  }
});
test('reply selections download in one folder operation without any receipt', async ({ page }) => {
  await openBatch(page, { replies: true });
  await select(page);
  await expect(page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Auswahl herunterladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nachrichten herunterladen', exact: true });
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect(dialog.getByText('Gespeichert', { exact: true })).toHaveCount(3);
  expect(
    await page.evaluate(
      () => window.__batchFixture.calls.filter((item) => item.command === 'begin_message_export').length,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => window.__batchFixture.saves.every((item) => item.reply))).toBe(true);
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
test('all pages can be selected and an uncertain receipt stops remaining work without retry', async ({
  page,
}) => {
  await openBatch(page, { total: 43 });
  await page.getByRole('button', { name: 'Alle 43 auswählen', exact: true }).click();
  await expect(page.getByText('43 ausgewählt', { exact: false })).toBeVisible();
  await page.evaluate(() => (window.__batchFixture.uncertain = true));
  await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  await dialog.getByRole('checkbox', { name: 'Annahmen ohne Malwarescan erlauben', exact: true }).check();
  await dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true }).click();
  await expect(dialog.getByText('Ausgang ungewiss', { exact: true })).toBeVisible();
  await expect(dialog.getByText('42 Nachrichten wurden nicht bearbeitet.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__batchFixture.writes.length)).toBe(1);
});
