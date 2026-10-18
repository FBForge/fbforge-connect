import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('destination-cleanup with synthetic native fixtures', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(() => (window.__destinationFixture.records.values().next().value.status = 'created'));
  await page.getByRole('button', { name: 'Eigene Zustellpunkte laden', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Entfernung dieses TEST-Entwurfs vorbereiten', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(() => window.__destinationFixture.writes), 0);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__destinationFixture.writes), 0);
  await page
    .getByRole('button', { name: 'Entfernung dieses TEST-Entwurfs vorbereiten', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Diesen TEST-Entwurf endgültig entfernen', exact: true }).click();
  await page
    .getByText('Der TEST-Zustellpunkt wurde entfernt. Laden Sie die Liste neu.', { exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__destinationFixture.writes), 1);
  assert.deepEqual(errors, []);
  console.log(
    'Draft cleanup UI passed: explicit preview, Escape/cancel without writes, one confirmed delete.',
  );
});
