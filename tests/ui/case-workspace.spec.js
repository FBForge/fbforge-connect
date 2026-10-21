import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('local cases reopen exact content after receipt, preview inert PDFs, isolate profiles and delete copies', async ({
  page,
}) => {
  const external = [],
    dialogs = [],
    errors = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:1420/') && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await expect(page.locator('.case-detail').getByText('Erika', { exact: true })).toBeVisible();
  await expect(page.locator('.case-detail').getByText('Vorname', { exact: true })).toBeVisible();
  const rows = page.locator('.document-attachments li');
  await expect(rows.nth(1).getByRole('button', { name: 'Ansehen' })).toHaveCount(0);
  await rows.first().getByRole('button', { name: 'Ansehen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lokale Vorschau' });
  await expect(dialog.getByText('Seite 1 von 2', { exact: true })).toBeVisible();
  await dialog.getByText('Seitentext lesen', { exact: true }).click();
  await expect(dialog.locator('.pdf-page-text')).toContainText('Fiktiver Nachweis');
  await expect(dialog.locator('a,input,iframe,object,embed')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Nächste Seite' }).click();
  await expect(dialog.locator('.pdf-page-text')).toContainText('Zweite Seite');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(rows.first().getByRole('button', { name: 'Ansehen', exact: true })).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await rows.first().getByRole('button', { name: 'Original herunterladen' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Fiktiver Nachweis.pdf');
  const fs = await import('node:fs/promises');
  const actual = await fs.readFile(await download.path());
  const original = await fs.readFile('frontend/test-fixtures/assets/fictional-attachment.pdf');
  expect(actual.equals(original)).toBe(true);
  await page.getByRole('button', { name: 'Zur Vorgangsübersicht', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Vorgänge durchsuchen').fill('00000005');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(1);
  await page.getByLabel('Vorgänge durchsuchen').fill('');
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Testprofil wechseln', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.getByText('Einzelne lokale Kopien verwalten', { exact: true }).last().click();
  await page
    .getByRole('button', { name: 'Lokale Kopie löschen: Antwort zum Testantrag', exact: true })
    .click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Verlauf leeren', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Verlauf leeren', exact: true }).click();
  await page.getByRole('button', { name: 'Lokalen Verlauf löschen', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' })).toHaveCount(0);
  expect(external).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});
test('case workspace is keyboard reachable, accessible and reflows at 200 percent', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Fiktiver Antrag auf Testleistung', exact: true, level: 2 }),
  ).toBeFocused();
  // Content must remain readable from the first frame, including during its entry animation.
  await page.locator('.case-detail').evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  await page.setViewportSize({ width: 640, height: 540 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
});

test('failed durable opt-in keeps session copies and reflects the native preference before retry', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.evaluate(() => (window.__caseFixture.failStorage = true));
  await page.getByText('Aufbewahrung: aktuelle Sitzung', { exact: true }).click();
  const choice = page.getByRole('checkbox', {
    name: 'Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren',
    exact: true,
  });
  await choice.click();
  await expect(page.getByRole('alert')).toContainText(
    'Vorgangsablage hat ihre Größen- oder Datensatzgrenze erreicht',
  );
  await expect(choice).not.toBeChecked();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await page.evaluate(() => (window.__caseFixture.failStorage = false));
  await choice.click();
  await expect(choice).toBeChecked();
  await expect(
    page.getByText(
      'Vorhandene Vorgänge sind geschützt gespeichert. Neue Vorgänge werden ebenfalls gesichert.',
      { exact: true },
    ),
  ).toBeVisible();
});
