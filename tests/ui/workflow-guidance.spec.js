import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('sending catches incomplete sections before advancing and preserves the draft on return', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__guidanceCalls = [];
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__guidanceCalls.push(command);
      return invoke(command, args);
    };
  });
  await page
    .getByRole('group', { name: 'Versandabschnitte' })
    .getByRole('button', { name: 'Anlagen & Antwortkanal', exact: true })
    .click();
  await expect(page.locator('#send-source')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText(
    'Bitte füllen Sie das Feld „Absender-Destination“ aus.',
  );
  await expect(page.locator('[data-send-step="0"]')).toBeVisible();
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.locator('#send-target')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText(
    'Bitte füllen Sie das Feld „Empfänger-Destination“ aus.',
  );
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Laden Sie zuerst die Leistungen');
  await expect(page.getByRole('button', { name: 'Leistungen laden', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.locator('[data-send-step="1"] legend')).toBeFocused();
  await page.locator('#send-data').fill('');
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await expect(page.locator('#send-data')).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.map((item) => item.id)).toEqual([]);
  const data = '{"vorname":"Erika","nachname":"Musterfrau"}';
  await page.locator('#send-data').fill(data);
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await expect(page.locator('[data-send-step="2"] legend').first()).toBeFocused();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.locator('[data-send-step="1"] legend')).toBeFocused();
  await expect(page.locator('#send-data')).toHaveValue(data);
  const calls = await page.evaluate(() => window.__guidanceCalls);
  expect(calls).not.toContain('prepare_send');
  expect(calls).not.toContain('execute_send');
});

test('enter opens a known submission directly instead of listing the inbox', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await expect(page.getByRole('button', { name: 'Einreichungen laden', exact: true })).toBeVisible();
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await expect(page.getByRole('button', { name: 'Einreichungen laden', exact: true })).toHaveCount(0);
  await page.locator('#pickup-submission').press('Enter');
  await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__applicationFixture.calls);
  expect(calls.filter((command) => command === 'load_submission')).toHaveLength(1);
  expect(calls).not.toContain('list_submissions');
  expect(calls.filter((command) => command === 'verify_submission')).toHaveLength(1);
});

test('case details keep the reading area clear and return to the same filtered result', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await page.getByLabel('Vorgänge durchsuchen').fill('00000005');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(1);
  const opener = page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true });
  await opener.click();
  await expect(page.getByRole('heading', { name: 'Meine Vorgänge', exact: true })).toBeHidden();
  await expect(page.locator('#case-detail-title')).toBeFocused();
  await expect(page.locator('.application-field-value').filter({ hasText: 'Erika' })).toBeVisible();
  expect(await page.locator('.application-group > summary > strong').allTextContents()).not.toContain(
    'Dokument',
  );
  await page.evaluate(() => (window.__caseFixture.failedRead = true));
  await page.locator('.document-attachments').getByRole('button', { name: 'Ansehen', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => (window.__caseFixture.failedRead = false));
  await page.setViewportSize({ width: 640, height: 540 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const back = page.getByRole('button', { name: 'Zur Vorgangsübersicht', exact: true });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(opener).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Vorgänge durchsuchen')).toHaveValue('00000005');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(1);
});
