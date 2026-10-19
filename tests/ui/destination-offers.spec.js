import { test } from '@playwright/test';
import assert from 'node:assert/strict';

test('destination-offers with synthetic native fixtures', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click();
  await page.getByLabel('Leistungen, Schemata und Prozessnachrichten bearbeiten', { exact: true }).check();
  await page.getByRole('button', { name: 'Leistung hinzufügen', exact: true }).click();
  await page
    .getByLabel('Leistungskennung (LeiKa-URN)', { exact: true })
    .fill('urn:de:fim:leika:leistung:99008001014002');
  await page.locator('#manager-offer-publicServices-0-schema-0').fill('urn:test:application');
  await page.locator('#manager-offer-0-replies').fill('urn:test:reply');
  await page.getByRole('button', { name: 'Prozessnachricht hinzufügen', exact: true }).click();
  await page.getByLabel('FIT-Connect-Modellkennung', { exact: true }).fill('model-1');
  await page.getByLabel('FIT-Connect-Nachrichtenkennung', { exact: true }).fill('message-1');
  await page.locator('#manager-offer-processMessages-0-schema-0').fill('urn:test:process');
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  await page.getByRole('heading', { name: 'Angebote nach der Änderung', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__destinationFixture.writes), 0);
  await page
    .getByRole('button', { name: 'Diese Änderungen verbindlich auf TEST speichern', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Abgeschlossen', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__destinationFixture.writes), 1);
  assert.deepEqual(errors, []);
  console.log(
    'Offer editing UI passed: service/reply schemas, independent process offer, read-only detailed preview and one confirmed PATCH.',
  );
});
