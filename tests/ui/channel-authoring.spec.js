import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { channelTemplate, createChannelSchema } from '../../frontend/src/channel-schemas.js';
const schema = createChannelSchema(channelTemplate()).schema;
const upload = (locator, value) =>
  locator.setInputFiles({
    name: 'answer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
test('offline channel authoring exports usable schema/example/draft and round-trips editable fields', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  await page.getByText('Vorlage oder gespeicherten Entwurf öffnen', { exact: true }).click();
  await page.getByRole('button', { name: 'Vorlage Nachforderung', exact: true }).click();
  await page.locator('#channel-title').fill('Eigene Nachforderung');
  await page.locator('#channel-statuses').fill('nachforderung\nunterlagen_geprueft');
  await page.getByRole('button', { name: 'Angabe hinzufügen', exact: true }).click();
  await page.locator('#channel-name-3').fill('bestaetigt');
  await page.locator('#channel-type-3').selectOption('boolean');
  const files = {};
  for (const [kind, label] of [
    ['schema', 'JSON-Schema herunterladen'],
    ['example', 'Fiktives Beispiel herunterladen'],
    ['draft', 'Schemaentwurf speichern'],
  ]) {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    files[kind] = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  }
  expect(files.schema.$id).toBe('urn:fbforge:connect:reply:nachforderung:1');
  expect(files.schema.properties.bestaetigt.type).toBe('boolean');
  expect(files.schema.properties.status.enum).toEqual(['nachforderung', 'unterlagen_geprueft']);
  expect(files.example.bestaetigt).toBe(true);
  await page.getByRole('button', { name: 'Vorlage Statusmitteilung', exact: true }).click();
  await upload(page.locator('#channel-draft'), files.draft);
  await expect(page.locator('#channel-title')).toHaveValue('Eigene Nachforderung');
  await expect(page.locator('#channel-name-3')).toHaveValue('bestaetigt');
  expect(await page.evaluate(() => window.__channelFixture.calls)).toEqual([]);
});
test('ambiguous fields cannot export and malformed imports preserve the current authoring state', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  await page.locator('#channel-name-1').fill('nachricht');
  await expect(page.getByRole('alert')).toContainText('eindeutige Feldnamen');
  await expect(page.getByRole('button', { name: 'JSON-Schema herunterladen', exact: true })).toHaveCount(0);
  await page.locator('#channel-name-1').fill('referenz');
  await page.getByText('Vorlage oder gespeicherten Entwurf öffnen', { exact: true }).click();
  await upload(page.locator('#channel-draft'), schema);
  await expect(page.getByRole('alert')).toContainText('Entwurf ist ungültig');
  await expect(page.locator('#channel-uri')).toHaveValue(schema.$id);
});
test('destination offers take only the agreed schema ID and committed model mapping without a server write', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  await upload(page.locator('#authoring-0-reply-file'), schema);
  await expect(page.locator('#authoring-0-replies')).toHaveValue(schema.$id);
  await page.getByRole('button', { name: 'Prozessnachricht hinzufügen', exact: true }).click();
  await page.locator('#authoring-0-mapped-message').selectOption('0');
  await page
    .getByRole('button', { name: 'Modellzuordnung in diese Prozessnachricht übernehmen', exact: true })
    .click();
  const offers = await page.evaluate(() => window.__channelFixture.offers);
  expect(offers.publicServices[0].submissionSchemas[0].schemaUri).toBe('urn:test:request');
  expect(offers.publicServices[0].replyChannels.fitConnect.processStandards).toEqual([schema.$id]);
  expect(offers.processMessages[0]).toEqual({
    processModelId: 'urn:test:process:1',
    messageId: 'request-more',
    regions: ['DE'],
    schemas: [{ schemaUri: 'urn:test:reply', mimeType: 'application/json' }],
  });
  expect(await page.evaluate(() => window.__channelFixture.calls)).toEqual([]);
});
test('schema authoring supports dark mode, keyboard access and narrow windows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.locator('#channel-uri').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#channel-title')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('a delayed schema import cannot change a different destination service draft', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => (window.__releaseSchemaImport = () => read.call(this).then(resolve)));
    };
  });
  await upload(page.locator('#authoring-0-reply-file'), schema);
  await expect.poll(() => page.evaluate(() => typeof window.__releaseSchemaImport)).toBe('function');
  await page.locator('#authoring-publicServices-0-id').fill('urn:de:fim:leika:leistung:99000000000001');
  await page.evaluate(() => window.__releaseSchemaImport());
  await expect(page.locator('#authoring-0-reply-file')).toBeEnabled();
  await expect(page.locator('#authoring-0-replies')).toHaveValue('');
  const offers = await page.evaluate(() => window.__channelFixture.offers);
  expect(offers.publicServices[0].replyChannels).toBeUndefined();
});

async function offer(page, api = 'v3') {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  if (api === 'v2') await page.getByRole('button', { name: 'API wechseln', exact: true }).click();
  if (api === 'v3') await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Antworten über FIT-Connect anbieten', exact: true }).check();
}
for (const api of ['v2', 'v3'])
  test(`sender only adopts advertised custom JSON schema identifiers (${api})`, async ({ page }) => {
    await offer(page, api);
    await upload(page.locator('#send-reply-schema-file'), { ...schema, $id: 'urn:test:unregistered' });
    await expect(page.getByRole('alert')).toContainText('noch nicht als Antwortschema angeboten');
    await upload(page.locator('#send-reply-schema-file'), schema);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
    ).toBeVisible();
    const draft = await page.evaluate(() => window.__sendFixture.preparedDocument);
    expect(draft.replyOffer).toEqual({
      schemaUri: schema.$id,
      mimeType: 'application/json',
      processMessages: [],
    });
  });
test('v3 process replies combine mapped and explicit identities, enforce hints, and reach the prepared metadata', async ({
  page,
}) => {
  await offer(page);
  await page.locator('#offered-process-choice').selectOption('0');
  await page.getByRole('button', { name: 'Prozessantwort aus Modell hinzufügen', exact: true }).click();
  await page.getByRole('button', { name: 'Prozessantwort aus Modell hinzufügen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('bereits enthalten');
  await page.locator('#offered-process-choice').selectOption('1');
  await page.getByRole('button', { name: 'Prozessantwort aus Modell hinzufügen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Schemahinweis');
  await page.getByText('Vereinbarte Kennungen selbst eintragen', { exact: true }).click();
  await page.locator('#offered-model-id').fill('urn:test:process:1');
  await page.locator('#offered-message-id').fill('completed');
  await page.getByRole('button', { name: 'Eingetragene Prozessantwort hinzufügen', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.__sendFixture.preparedDocument)).replyOffer.processMessages,
  ).toEqual([
    { processModelId: 'urn:test:process:1', messageId: 'request-more' },
    { processModelId: 'urn:test:process:1', messageId: 'completed' },
  ]);
});
