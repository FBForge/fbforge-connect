import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('normal close blocks active operations and leaves the app open when checkpointing fails', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/lifecycle.html');
  await page.evaluate(() => window.__lifecycle.setBusy(true));
  await page.getByRole('button', { name: 'Fenster schließen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'FBForge Connect beenden?', exact: true });
  await expect(dialog.getByRole('button', { name: 'Anwendung beenden', exact: true })).toBeDisabled();
  expect(
    await page.evaluate(() => window.__lifecycle.calls.some((c) => c.command === 'close_application')),
  ).toBe(false);
  await page.evaluate(() => {
    window.__lifecycle.setBusy(false);
    window.__lifecycle.fail = true;
  });
  await dialog.getByRole('button', { name: 'Anwendung beenden', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('bleibt geöffnet');
  await dialog.getByRole('button', { name: 'Zurück zur Anwendung', exact: true }).click();
  await expect(dialog).toBeHidden();
});
test('proxy settings preserve a saved password without exposing it and require deliberate reconnect', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 850 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('http://127.0.0.1:1420/test-fixtures/lifecycle.html');
  await expect(page.getByLabel('Passwort (optional)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Passwort (optional)', { exact: true })).toHaveAttribute(
    'placeholder',
    'Gespeichertes Passwort beibehalten',
  );
  await page.getByRole('button', { name: 'Netzwerkeinstellungen übernehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Verbindung neu einrichten?', exact: true });
  await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
  expect(
    await page.evaluate(() => window.__lifecycle.calls.some((c) => c.command === 'save_network_settings')),
  ).toBe(false);
  await dialog.getByRole('button', { name: 'Übernehmen und trennen', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.__lifecycle.calls.find((c) => c.command === 'save_network_settings').args.settings.password,
    ),
  ).toBeNull();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
