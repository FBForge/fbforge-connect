import { test, expect } from './fixtures.js';
import { ownDestination } from '../../scripts/live-ui/local-tools.mjs';
import { reviewBulkEdit } from '../../scripts/live-ui/review-destination-backups.mjs';
import { reviewDestinationExtras } from '../../scripts/live-ui/review-destination-extras.mjs';
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

test('the extras driver uses confirmed patches, redacted readback and removes its callback configuration', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  const id = '22222222-2222-4222-8222-222222222222';
  const readManagedFixture = (id) =>
    page.evaluate((id) => {
      const row = window.__destinationFixture.records.get(id);
      return {
        ...row,
        extrasJson: JSON.stringify({
          publicForRouting: row.publicForRouting ?? false,
          senderAccessRestricted: row.senderAccessRestricted,
          callback: row.callback ? { url: row.callback.url } : null,
        }),
        contactJson: JSON.stringify(row.contactInformation),
        offersJson: JSON.stringify({
          publicServices: row.publicServices,
          processMessages: row.processMessages,
        }),
      };
    }, id);
  const original = await readManagedFixture(id);
  await reviewDestinationExtras(
    page,
    { readManagedFixture },
    id,
    original.name,
    '11111111-1111-4111-8111-111111111111',
  );
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(2);
});
test('bulk acceptance keeps selection when its second owned destination is on the last page', async ({
  page,
}) => {
  test.setTimeout(30000);
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await page.evaluate(async () =>
    (await import('/test-fixtures/destination-backup-fixture.js')).installBackupBridge({ empty: true }),
  );
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  await page.evaluate((ids) => {
    const fixture = window.__destinationFixture;
    fixture.records.get(ids[0]).name = 'Fiktive Abnahme';
    fixture.records.get(ids[1]).name = 'Fiktive Kopie';
    const rows = [
      fixture.records.get(ids[0]),
      ...Array.from({ length: 19 }, (_, i) => ({
        destinationId: crypto.randomUUID(),
        name: `Weitere fiktive Destination ${i}`,
        status: 'active',
        type: 'A',
      })),
      fixture.records.get(ids[1]),
    ];
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) =>
      command === 'list_destinations'
        ? {
            apiVersion: 'v3',
            sessionId: args.sessionId,
            environment: 'TEST',
            data: {
              canManageDestinations: true,
              offset: args.offset,
              totalCount: rows.length,
              destinations: rows
                .slice(args.offset, args.offset + 20)
                .map(({ destinationId, name, status, type }) => ({
                  destinationId,
                  name,
                  status,
                  type: type || 'A',
                })),
            },
          }
        : original(command, args);
  }, ids);
  await reviewBulkEdit(
    page,
    {
      destination: ids[0],
      runName: 'Fiktive Abnahme',
      readManagedFixture: (id) =>
        page.evaluate(
          (id) => ({
            ...window.__destinationFixture.records.get(id),
            contactJson: JSON.stringify(window.__destinationFixture.records.get(id).contactInformation),
          }),
          id,
        ),
    },
    ids[1],
    'Fiktive Kopie',
  );
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(1);
  expect(
    await page.evaluate((ids) => ids.map((id) => window.__destinationFixture.records.get(id).name), ids),
  ).toEqual(['Fiktive Abnahme', 'Fiktive Kopie']);
  // The group selection deliberately remains after editing. A subsequent single edit must clear it.
  const nextFixture = {
    readManagedFixture: (id) =>
      page.evaluate((id) => {
        const row = window.__destinationFixture.records.get(id);
        return {
          ...row,
          contactJson: JSON.stringify(row.contactInformation),
          offersJson: JSON.stringify({
            publicServices: row.publicServices,
            processMessages: row.processMessages,
          }),
          extrasJson: JSON.stringify({
            publicForRouting: row.publicForRouting ?? false,
            senderAccessRestricted: row.senderAccessRestricted,
            callback: row.callback ? { url: row.callback.url } : null,
          }),
        };
      }, id),
  };
  await reviewDestinationExtras(page, nextFixture, ids[1], 'Fiktive Kopie', ids[0]);
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(3);
});
