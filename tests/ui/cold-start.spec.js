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
