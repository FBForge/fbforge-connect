import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { savedCaseValue } from '../../scripts/live-ui/review-030.mjs';
test('live collection acceptance selects the package group and verifies its actual deletion', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  const library = page.locator('.test-case-library');
  await library.getByText('Testpaket importieren', { exact: true }).first().click();
  const path = fileURLToPath(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url));
  const pack = JSON.parse(await readFile(path, 'utf8'));
  await library.locator('#send-library-import').setInputFiles(path);
  const choice = library.locator('#send-library-choice');
  await expect(choice).toBeVisible();
  const value = await savedCaseValue(choice, pack.name);
  expect(value).toMatch(/:antrag-mit-antwort$/);
  await choice.selectOption(value);
  await library.getByRole('button', { name: 'Testpaket löschen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Testpaket aus der Sammlung löschen?', exact: true })
    .getByRole('button', { name: 'Endgültig löschen', exact: true })
    .click();
  await expect.poll(() => savedCaseValue(choice, pack.name)).toBeNull();
});
