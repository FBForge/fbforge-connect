import { test, expect } from '@playwright/test';
import { ownDestination } from '../../scripts/live-ui/local-tools.mjs';
test('the real acceptance driver uses direct single fields and verifies unchanged server fields', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  // Only the navigation shell is supplied here. The manager is the actual product component.
  await page.evaluate(() => {
    const root = document.createElement('nav');
    root.setAttribute('aria-label', 'Hauptnavigation');
    const button = document.createElement('button');
    button.textContent = 'Destinations';
    root.append(button);
    document.body.prepend(root);
    const heading = document.createElement('h1');
    heading.textContent = 'Destinations';
    document.body.prepend(heading);
    const api = document.createElement('input');
    api.id = 'session-api';
    api.value = 'v3';
    document.body.append(api);
  });
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  const fixture = {
    destination: '11111111-1111-4111-8111-111111111111',
    runName: 'Fiktive Live-Abnahme',
    readOwnedDestination: () =>
      page.evaluate(() => {
        const row = window.__destinationFixture.records.get('11111111-1111-4111-8111-111111111111');
        return {
          ...row,
          contactJson: JSON.stringify(row.contactInformation),
          offersJson: JSON.stringify({
            publicServices: row.publicServices,
            processMessages: row.processMessages,
          }),
        };
      }),
  };
  await ownDestination(page, fixture);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(1);
});
