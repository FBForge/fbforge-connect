import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('key inventory protects unresolved keys and confirms local removal with recoverable save errors', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/key-inventory.html');
  await page.getByText('Schlüsselbestand dieser Verbindung', { exact: true }).click();
  await page.getByRole('button', { name: 'Schlüsselbestand aktualisieren', exact: true }).click();
  await expect(page.getByText('Über geprüftes Reply wiederhergestellt')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Dieses Schlüsselpaar entfernen', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Wegen eines ungewissen Vorgangs aufbewahren/)).toBeVisible();
  await page.getByRole('button', { name: 'Diesen Schlüssel entfernen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Schlüssel wirklich entfernen?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
  const confirm = dialog.getByRole('button', { name: 'Aus diesem Schlüsselbestand entfernen', exact: true });
  await expect(confirm).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__inventory.removals.length)).toBe(0);
  await page.getByRole('button', { name: 'Diesen Schlüssel entfernen', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await page.evaluate(() => (window.__inventory.failSave = true));
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('nicht sicher im Profil gespeichert');
  expect(await page.evaluate(() => window.__inventory.removals.length)).toBe(0);
  await page.evaluate(() => (window.__inventory.failSave = false));
  await page.getByRole('button', { name: 'Diesen Schlüssel entfernen', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Der gewählte Eintrag wurde entfernt' }),
  ).toBeVisible();
  await expect(page.getByText('Zertifikate rechtzeitig erneuern', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__inventory.removals.length)).toBe(1);
  expect(await page.evaluate(() => window.__inventory.changed)).toBe(2);
  await expect(
    page.getByRole('button', { name: 'Schlüsselbestand aktualisieren', exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.__switchInventorySession());
  await expect(page.getByText('Ungewisser Ausgang')).toHaveCount(0);
  expect(errors).toEqual([]);
});
