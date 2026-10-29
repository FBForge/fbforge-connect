import { test, expect } from '@playwright/test';

test('cold start and local BPMN demo work without credentials', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command) {
        if (command === 'list_profiles') return [];
        throw 'session_missing';
      },
    };
  });
  await page.goto('http://127.0.0.1:1420/');
  await expect(page.getByRole('heading', { name: 'Start', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verbindung herstellen', exact: true })).toBeVisible();
  await expect(page.locator('.send-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Destinations', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Eigene Destinations verwalten', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Prozesse', exact: true }).click();
  await page.getByRole('button', { name: 'Fiktiven Demo-Prozess öffnen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fiktiver TEST-Antragsprozess', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.bpmn-message-list button')).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: 'Passende Prozess-Destinations suchen', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await page.getByRole('button', { name: 'Drittanbieter-Lizenzen anzeigen', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Drittanbieter-Komponenten und Lizenzen', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('guided start routes to the test task and help without performing an exchange', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.__startCommands = [];
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command) {
        window.__startCommands.push(command);
        if (command === 'list_profiles') return [];
        throw 'session_missing';
      },
    };
  });
  await page.goto('http://127.0.0.1:1420/');
  await page.getByRole('button', { name: 'Einreichung senden', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Senden', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Verbindung herstellen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Einreichungen abrufen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Empfangen', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const connect = page.getByRole('button', { name: 'Verbindung herstellen', exact: true });
  await connect.click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(connect).toBeFocused();
  expect(
    await page.evaluate(() =>
      window.__startCommands.every((command) =>
        ['list_profiles', 'application_update_status'].includes(command),
      ),
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('guided-start.png'), fullPage: true });
});
