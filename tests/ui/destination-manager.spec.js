import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

test('an API rejection keeps bounded technical details available without repeating the write', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(() => {
    window.__destinationFixture.updateFailure = {
      error: 'resource_unavailable',
      httpStatus: 400,
      problemType: 'invalid-request',
    };
  });
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Onlinedienst Nord Test');
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  const preview = page.locator('[aria-labelledby="update-preview-title"]');
  await preview
    .getByRole('button', {
      name: 'Diese Änderungen verbindlich in der gewählten Umgebung speichern',
      exact: true,
    })
    .click();
  await expect(preview.getByRole('heading', { name: 'Teilweise abgeschlossen', exact: true })).toBeVisible();
  await expect(preview).toContainText('Die Destination API hat die Änderung abgelehnt');
  const details = preview.locator('details.destination-failure');
  await expect(details).not.toHaveAttribute('open');
  await details.getByText('Technische Fehlerdetails', { exact: true }).click();
  await expect(details.getByText('resource_unavailable', { exact: true })).toBeVisible();
  await expect(details.getByText('400', { exact: true })).toBeVisible();
  await expect(details.getByText('invalid-request', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(1);
  expect(await page.evaluate(() => [...window.__destinationFixture.records.values()][0].name)).toBe(
    'Onlinedienst Nord',
  );
});

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
    .getByRole('button', {
      name: 'Diese Änderungen verbindlich in der gewählten Umgebung speichern',
      exact: true,
    })
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
    await expect(page.getByRole('checkbox')).toHaveCount(query.includes('readonly') ? 2 : 0);
    await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
    const create = page.getByRole('button', { name: 'Neue Destination anlegen', exact: true });
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(create).toHaveAttribute('title', /.+/);
    await create.focus();
    await expect(create).toBeFocused();
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

test('selection advances in bounded groups, then through every list page', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(() => {
    const records = window.__destinationFixture.records,
      template = [...records.values()][0];
    records.clear();
    for (let n = 1; n <= 25; n++) {
      const destinationId = `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
      records.set(destinationId, { ...template, destinationId, name: `Zustellpunkt ${n}` });
    }
  });
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByRole('button', { name: 'Erste 10 auswählen', exact: true }).click();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(10);
  await expect(page.getByLabel('Zustellpunkt 1 auswählen', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Nächste 10 auswählen', exact: true }).click();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(10);
  await expect(page.getByLabel('Zustellpunkt 1 auswählen', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Zustellpunkt 20 auswählen', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click();
  await page.getByRole('button', { name: 'Alle auswählen (diese Seite)', exact: true }).click();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(5);
  await expect(page.getByLabel('Zustellpunkt 25 auswählen', { exact: true })).toBeChecked();
});

test('editing exposes loaded routing, sender restrictions, CC and callback without leaking its secret', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(() => {
    const row = [...window.__destinationFixture.records.values()][0];
    Object.assign(row, {
      publicForRouting: true,
      senderAccessRestricted: {
        enabled: true,
        allowedSenderDestinations: ['22222222-2222-4222-8222-222222222222'],
      },
      callback: { url: 'https://example.invalid/hook', secret: 'never_return_this_secret' },
    });
    row.contactInformation.cc = ['old@example.invalid'];
  });
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click();
  await expect(page.getByLabel('Im vereinfachten TEST-Routing sichtbar', { exact: true })).toBeChecked();
  await page.getByText('Absender beschränken', { exact: true }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Absender beschränken', exact: true })).toBeChecked();
  await expect(
    page.getByRole('textbox', { name: 'Erlaubte Absender-Destination-IDs', exact: true }),
  ).toHaveValue('22222222-2222-4222-8222-222222222222');
  await page.getByText('Callback einrichten oder ändern', { exact: true }).click();
  await expect(page.getByLabel('Callback-Adresse', { exact: true })).toHaveValue(
    'https://example.invalid/hook',
  );
  await expect(page.getByLabel('Neues Callback-Secret', { exact: true })).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('never_return_this_secret');
  await page
    .getByLabel('Kopie der Kontaktbenachrichtigung an (E-Mail)', { exact: true })
    .fill('new@example.invalid');
  await page.getByLabel('Im vereinfachten TEST-Routing sichtbar', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  const patch = await page.evaluate(() => JSON.parse(window.__destinationFixture.state.changes[0].afterJson));
  expect(patch.publicForRouting).toBe(false);
  expect(patch.contactInformation.cc).toEqual(['new@example.invalid']);
  expect(patch).not.toHaveProperty('callback');
  expect(patch).not.toHaveProperty('senderAccessRestricted');
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
