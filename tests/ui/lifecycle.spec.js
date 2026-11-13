import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
test('a failed initial network read allows explicit configuration after showing the error', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/lifecycle.html?holdNetwork&failNetwork');
  const mode = page.getByLabel('Verbindung', { exact: true });
  await expect(mode).toBeDisabled();
  await page.evaluate(() => window.__lifecycle.finishNetworkRead());
  await expect(page.getByRole('alert')).toContainText('konnten nicht gelesen werden');
  await expect(mode).toBeEnabled();
  await mode.selectOption('manual');
  await page.getByLabel('Proxy-Host', { exact: true }).fill('proxy.example.de');
  await page.getByRole('button', { name: 'Netzwerkeinstellungen übernehmen', exact: true }).click();
  await page.getByRole('button', { name: 'Übernehmen und trennen', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.__lifecycle.calls.find((call) => call.command === 'save_network_settings').args.settings.host,
    ),
  ).toBe('proxy.example.de');
});
test('network controls wait for saved settings before allowing edits or reconnect', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/lifecycle.html?holdNetwork');
  const mode = page.getByLabel('Verbindung', { exact: true });
  const save = page.getByRole('button', { name: 'Netzwerkeinstellungen übernehmen', exact: true });
  await expect(mode).toBeDisabled();
  await expect(save).toBeDisabled();
  await page.evaluate(() => window.__lifecycle.finishNetworkRead());
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveValue('manual');
  await expect(page.getByLabel('Proxy-Host', { exact: true })).toHaveValue('proxy.example.de');
  await mode.selectOption('direct');
  await save.click();
  await page.getByRole('button', { name: 'Übernehmen und trennen', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.__lifecycle.calls.find((call) => call.command === 'save_network_settings').args.settings.mode,
    ),
  ).toBe('direct');
});
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
test('native close event reaches the accessible confirmation and cancellation leaves the session open', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/lifecycle.html');
  await page.waitForFunction(() =>
    window.__lifecycle.calls.some((call) => call.command === 'plugin:event|listen'),
  );
  await page.evaluate(() => window.__lifecycle.nativeClose());
  const dialog = page.getByRole('dialog', { name: 'FBForge Connect beenden?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Anwendung beenden', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Zurück zur Anwendung', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() => window.__lifecycle.calls.some((call) => call.command === 'close_application')),
  ).toBe(false);
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
