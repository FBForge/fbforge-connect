import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dropFiles } from './drop-files.js';

test('file drops support one/many files, cancellation, disabled controls and keyboard selection', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/file-drop.html');
  const one = page.getByRole('group', { name: 'Einzelne Datei', exact: true }),
    many = page.getByRole('group', { name: 'Mehrere Dateien', exact: true });
  const files = [
    { name: 'eins.json', content: '{}' },
    { name: 'zwei.xml', content: '<test/>' },
  ];
  await dropFiles(page, one, files);
  await expect(one.getByRole('alert')).toHaveText('Bitte hier genau eine Datei auswählen oder ablegen.');
  await expect(page.locator('#single-file')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status')).toHaveText('0');
  await dropFiles(page, one, []);
  await expect(one.getByRole('alert')).toContainText('lokale Datei');
  await dropFiles(page, one, [files[0]]);
  await expect(page.getByTestId('file-names')).toHaveText('eins.json');
  await expect(page.locator('#single-file')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status')).toHaveText('1');
  await page.getByRole('button', { name: 'Dateiablage sperren oder freigeben', exact: true }).click();
  await dropFiles(page, one, [files[1]]);
  await expect(page.getByRole('status')).toHaveText('1');
  await expect(one).not.toHaveClass(/is-dragging/);
  await dropFiles(page, many, files);
  await expect(page.getByTestId('file-names')).toHaveText('eins.json, zwei.xml');
  await expect(page.getByRole('status')).toHaveText('2');
  await page.getByRole('button', { name: 'Dateiablage sperren oder freigeben', exact: true }).click();
  await page.locator('#single-file').focus();
  await expect(page.locator('#single-file')).toBeFocused();
  for (let i = 0; i < 2; i++)
    await page
      .locator('#single-file')
      .setInputFiles({ name: 'gleich.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toHaveText('4');
  const input = page.locator('#single-file');
  await input.focus();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), input.press('Enter')]);
  await picker.setFiles({ name: 'tastatur.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByTestId('file-names')).toHaveText('tastatur.json');
  await expect(page.getByRole('status')).toHaveText('5');
  const [cancelled] = await Promise.all([page.waitForEvent('filechooser'), input.press('Enter')]);
  await cancelled.setFiles([]);
  await expect(page.getByRole('status')).toHaveText('5');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('protected profile files also support drop without exposing decrypted data or making network calls', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.getByText('Geschützte Profilsicherung importieren', { exact: true }).click();
  const zone = page.getByRole('group', { name: 'Geschützte Profildatei', exact: true });
  await dropFiles(page, zone, [{ name: 'ungültig.fctest-profile', content: 'kein verschlüsseltes Profil' }]);
  await expect(page.getByRole('alert').filter({ hasText: /Profil|Sicherung/ })).toBeVisible();
  await dropFiles(page, zone, [
    {
      name: 'test.fctest-profile',
      content: 'FIT-Connect Test-Client protected profile v1\nsynthetic-ciphertext',
    },
  ]);
  await expect(page.getByText('Wiederhergestellt TEST', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__profilesFixture.profiles.length)).toBe(1);
  expect(await page.evaluate(() => window.__profilesFixture.active)).toBeFalsy();
});
