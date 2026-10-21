import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('destination details open visibly, return focus and preserve a shared selection', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByLabel('Onlinedienst Nord auswählen', { exact: true }).check();
  await page.getByLabel('Fachverfahren Süd auswählen', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  const inspect = page.getByRole('button', { name: 'Ansehen', exact: true }).first();
  await inspect.click();
  await expect(page.getByRole('heading', { name: 'Onlinedienst Nord', exact: true })).toBeFocused();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zur Destination-Übersicht', exact: true }).click();
  await expect(inspect).toBeFocused();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await page.getByRole('button', { name: '2 Destinations gemeinsam bearbeiten', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '2 Destinations gemeinsam bearbeiten', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('list').first()).toContainText('Onlinedienst Nord');
  await expect(page.getByRole('list').first()).toContainText('Fachverfahren Süd');
  await page.getByLabel('Name ändern', { exact: true }).check();
  await page.getByLabel('Neuer Name / Vorlage', { exact: true }).fill('{name} Test');
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zur Bestätigung', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
  await page
    .getByRole('button', { name: 'Diese Änderungen verbindlich auf TEST speichern', exact: true })
    .click();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(1);
  expect(
    await page.evaluate(() => [...window.__destinationFixture.records.values()].map((row) => row.name)),
  ).toEqual(['Onlinedienst Nord Test', 'Fachverfahren Süd Test']);
});

for (const query of ['?readonly=1', '?api=v2']) {
  test(`read-only destinations offer details without useless selection or editing ${query}`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/destination-manager.html${query}`);
    await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Neue TEST-Destination anlegen', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Ansehen', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Onlinedienst Nord', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Destination bearbeiten', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  });
}
