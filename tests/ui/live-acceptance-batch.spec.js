import { test, expect } from './fixtures.js';
import { openBatch, id } from '../../frontend/test-fixtures/message-batch.js';
import { prepareBatchSigningKey } from '../../scripts/live-ui/batch-controls.mjs';

test('live batch driver waits for multiple signing keys again after reopening', async ({ page }) => {
  await openBatch(page);
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'loaded_keys') {
        await new Promise((resolve) => (window.__releaseBatchKeys = resolve));
        result.data.keys.push({ ...result.data.keys[0], kid: 'rotated-sign-key' });
      }
      return result;
    };
  });
  await page.getByRole('checkbox', { name: `Einreichung ${id(3)} auswählen`, exact: true }).check();
  const dialog = page.getByRole('dialog', { name: 'Einreichungen prüfen und annehmen', exact: true });
  for (let opening = 0; opening < 2; opening++) {
    await page.getByRole('button', { name: 'Prüfen, speichern und annehmen', exact: true }).click();
    const key = dialog.getByRole('combobox', { name: 'Signaturschlüssel', exact: true });
    const start = dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true });
    await expect(key).toBeHidden();
    await expect(start).toBeDisabled();
    const preparing = prepareBatchSigningKey(dialog, 'rotated-sign-key');
    await expect.poll(() => page.evaluate(() => typeof window.__releaseBatchKeys)).toBe('function');
    await page.evaluate(() => {
      window.__releaseBatchKeys();
      delete window.__releaseBatchKeys;
    });
    await preparing;
    await expect(key).toHaveValue('rotated-sign-key');
    await expect(start).toBeEnabled();
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  }
  expect(await page.evaluate(() => window.__batchFixture.saves)).toEqual([]);
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
