import { test, expect } from './fixtures.js';
import { reviewSchemaLibraryChanges } from '../../scripts/live-ui/review-schema-library.mjs';

test('the full desktop shell keeps the schema library usable after case navigation', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.evaluate(async () => {
    const { answerSchemaFixture } = await import('/test-fixtures/answer-schema-fixture.js');
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) =>
      command === 'profile_answer_schemas' ? answerSchemaFixture(args.action) : original(command, args);
  });
  await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-library-client');
  await page.locator('#client-secret').fill('synthetic-library-secret');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation', exact: true });
  const openLibrary = async () => {
    await navigation.getByRole('button', { name: 'Testwerkzeuge', exact: true }).click();
    await page.getByRole('tab', { name: 'Antwortschemas', exact: true }).click();
  };
  await openLibrary();
  const uri = 'urn:fbforge:connect:ci:reply:status:1';
  await page.locator('#channel-uri').fill(uri);
  await page.locator('#channel-title').fill('Fiktive Live-Statusmitteilung');
  await page.getByRole('button', { name: 'Im Profil speichern', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'automatisch verwendet' })).toBeVisible();
  await navigation.getByRole('button', { name: 'Vorgänge', exact: true }).click();
  await openLibrary();
  await reviewSchemaLibraryChanges(page, uri, 'Fiktive Live-Statusmitteilung');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-answer-schemas')))).toEqual([]);
});
