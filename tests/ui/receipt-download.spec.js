import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openBatch, id } from '../../frontend/test-fixtures/message-batch.js';

async function acceptDialog(page) {
  await openBatch(page);
  await page.getByRole('button', { name: 'Öffnen und prüfen', exact: true }).first().click();
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung annehmen?', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('single acceptance offers an optional download and saves all original files before receipt', async ({
  page,
}) => {
  const dialog = await acceptDialog(page);
  await expect(
    dialog.getByRole('radio', { name: 'Nein, ohne Download annehmen', exact: true }),
  ).toBeChecked();
  await dialog.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true }).check();
  await dialog.getByRole('button', { name: 'Speichern und annehmen', exact: true }).click();
  await expect(dialog).toBeHidden();
  const state = await page.evaluate(() => window.__batchFixture);
  expect(state.writes).toEqual([id(3)]);
  expect(state.saves).toHaveLength(1);
  expect(state.saves[0]).toEqual({ proofId: id(9), recordId: null, messageId: id(3), reply: false });
  const commands = state.calls.map((call) => call.command);
  expect(commands.indexOf('export_message')).toBeLessThan(commands.indexOf('execute_receipt'));
  expect(commands.filter((command) => command === 'execute_receipt')).toHaveLength(1);
});

test('no download explicitly keeps single acceptance independent of an export folder', async ({ page }) => {
  const dialog = await acceptDialog(page);
  await dialog.getByRole('radio', { name: 'Nein, ohne Download annehmen', exact: true }).check();
  await dialog.getByRole('button', { name: 'Jetzt annehmen', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([id(3)]);
  expect(
    await page.evaluate(() => window.__batchFixture.calls.some((c) => c.command === 'begin_message_export')),
  ).toBe(false);
});

test('cancelled folder selection and failed saving never send an acceptance and keep the choice available', async ({
  page,
}) => {
  for (const failure of ['cancelFolder', 'failSave']) {
    const dialog = await acceptDialog(page);
    await page.evaluate((key) => (window.__batchFixture[key] = true), failure);
    await dialog.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true }).check();
    await dialog.getByRole('button', { name: 'Speichern und annehmen', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Speichern und annehmen', exact: true })).toBeEnabled();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
  }
});

test('download choice remains keyboard operable and readable with narrow text spacing and high contrast', async ({
  page,
}) => {
  const dialog = await acceptDialog(page);
  await page.setViewportSize({ width: 640, height: 540 });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: '* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}',
  });
  const yes = dialog.getByRole('radio', { name: 'Ja, alle Dateien vorher speichern', exact: true });
  await yes.focus();
  await page.keyboard.press('Space');
  await expect(yes).toBeChecked();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__batchFixture.writes)).toEqual([]);
});
