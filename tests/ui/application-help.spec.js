import { test, expect } from '@playwright/test';
import { documentationTopics } from '../../frontend/src/documentation.js';

test('help opens only the requested website chapter and keeps a copyable fallback', async ({ page }) => {
  await page.addInitScript(() => {
    window.__helpCalls = [];
    window.__helpFailure = false;
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === 'list_profiles') return [];
        if (command === 'open_documentation') {
          window.__helpCalls.push(args);
          if (window.__helpFailure) throw 'browser_unavailable';
          return null;
        }
        throw 'session_missing';
      },
    };
  });
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:1420/')) external.push(request.url());
  });
  await page.goto('http://127.0.0.1:1420/');
  await page.getByRole('link', { name: /Schritt-für-Schritt-Anleitung/ }).click();
  expect(await page.evaluate(() => window.__helpCalls)).toEqual([{ topic: 'start' }]);
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click();
  await expect(page.locator('.documentation-topics a')).toHaveCount(documentationTopics.length);
  await expect(page.locator('img[src*="screenshots"]')).toHaveCount(0);
  await page.getByRole('link', { name: /Antrag empfangen und prüfen/ }).click();
  expect(await page.evaluate(() => window.__helpCalls.at(-1))).toEqual({ topic: 'receive' });
  await page.evaluate(() => {
    window.__helpFailure = true;
  });
  await page.getByRole('link', { name: /Antworten testen/ }).click();
  await expect(page.getByRole('alert')).toContainText('https://fbforge.de/connect/hilfe/0.2/replies');
  await expect(page.getByRole('button', { name: 'Hilfeadresse kopieren', exact: true })).toBeVisible();
  expect(external).toEqual([]);
});
