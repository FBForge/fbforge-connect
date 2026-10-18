import { test, expect } from '@playwright/test';
import { helpTopics } from '../../frontend/src/help/topics.js';
test('bundled illustrated help covers every workflow without external documentation requests', async ({
  page,
}) => {
  const external = [],
    errors = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:1420/') && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
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
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click();
  await expect(page.locator('.connection-notice')).toHaveCount(0);
  const navigation = page.getByRole('navigation', { name: 'Hilfethemen' });
  await expect(navigation.getByRole('button')).toHaveCount(helpTopics.length);
  for (const topic of helpTopics) {
    const button = navigation.getByRole('button', { name: topic.title, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#help-topic-title')).toHaveText(topic.title);
    await expect(page.locator('#help-topic-title')).toBeFocused();
    await expect(page.locator('.help-article ol li')).toHaveCount(topic.steps.length);
    await expect(page.locator('.help-article figure img')).toHaveCount(1);
    await expect
      .poll(() => page.locator('.help-article img').evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  }
  await page.getByRole('button', { name: 'Abbildung vergrößern', exact: true }).click();
  const illustration = page.getByRole('dialog', { name: 'Lokale Vorschau', exact: true });
  await expect(illustration.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abbildung vergrößern', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Alle Hilfethemen', exact: true }).click();
  await expect(page.getByLabel('Anleitung durchsuchen')).toBeFocused();
  await page.getByLabel('Anleitung durchsuchen').fill('PDF');
  await expect(
    navigation.getByRole('button', { name: 'PDF, Bilder und Dateien', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Anleitung durchsuchen').fill('Keinpassenderhilfetext123');
  await expect(page.getByRole('status')).toContainText('Keine passenden Hilfethemen');
  await page.getByLabel('Anleitung durchsuchen').fill('');
  await navigation.getByRole('button', { name: 'Vorgänge und Aufbewahrung', exact: true }).click();
  await page.getByRole('button', { name: 'Zum Bereich Vorgänge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meine Vorgänge', exact: true })).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
