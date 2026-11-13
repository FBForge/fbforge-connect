import { test, expect } from './fixtures.js';
import { button } from './scenario-helpers.js';
test('answer schemas survive restart, restore the editor and require consent before replacement and deletion', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=v3');
  await page.getByRole('tab', { name: 'Antwortschemas', exact: true }).click();
  await page.locator('#channel-title').fill('Status zum Integrationsvorgang');
  await page.locator('#channel-uri').fill('urn:test:persistent-reply:1');
  await button(page, 'Im Profil speichern').click();
  await expect(page.getByRole('status').filter({ hasText: 'automatisch verwendet' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Antwortschemas', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Gespeichertes Antwortschema', exact: true })
    .selectOption('urn:test:persistent-reply:1');
  await button(page, 'Entwurf öffnen').click();
  await expect(page.locator('#channel-title')).toHaveValue('Status zum Integrationsvorgang');
  await page.locator('#channel-title').fill('Überarbeiteter Status');
  await button(page, 'Im Profil speichern').click();
  const replace = page.getByRole('group', { name: 'Antwortschema ersetzen', exact: true });
  await expect(replace).toBeVisible();
  await replace.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-answer-schemas'))[0].title)).toBe(
    'Status zum Integrationsvorgang',
  );
  await button(page, 'Im Profil speichern').click();
  await button(page, 'Definition ersetzen').click();
  await expect(page.getByRole('status').filter({ hasText: 'automatisch verwendet' })).toBeVisible();
  await button(page, 'Aus Profil entfernen').click();
  await button(page, 'Jetzt entfernen').click();
  await expect(page.getByRole('combobox', { name: 'Gespeichertes Antwortschema', exact: true })).toHaveCount(
    0,
  );
  const calls = await page.evaluate(() => window.__integration.calls.map((c) => c.command));
  expect(calls).not.toContain('execute_send');
  expect(calls).not.toContain('execute_destination_update');
});
