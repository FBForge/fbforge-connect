import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { dropFiles } from './drop-files.js';
const base = 'http://127.0.0.1:1420';
const example = JSON.parse(
  await readFile(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function openTools(page) {
  await page.goto(`${base}/test-fixtures/profiles.html?destinations=1`);
  await button(page, 'Testwerkzeuge').click();
}
test('test packages and schema comparisons work offline and remain available across navigation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTools(page);
  await button(page, 'Fiktives Testpaket öffnen').click();
  await expect(
    page.getByRole('combobox', { name: 'Testfall auswählen', exact: true }).locator('option'),
  ).toHaveCount(2);
  await page.getByText('Erwartungen für den manuellen Test', { exact: true }).click();
  await page
    .locator('#test-expected-reply')
    .fill('{"status":"unterlagen_erforderlich","nachricht":"Fiktive Rückfrage"}');
  await page.getByRole('combobox', { name: 'Testfall auswählen', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: 'Testfall auswählen', exact: true }).selectOption('0');
  await expect(page.locator('#test-expected-reply')).toHaveValue(/Fiktive Rückfrage/);
  await button(page, 'Schema-Vergleich').click();
  await button(page, 'Fiktiven Beispielvergleich öffnen').click();
  await expect(page.locator('.schema-change-list')).toContainText('Jetzt ein Pflichtfeld');
  await expect(page.locator('.schema-change-list')).toContainText('Auswahlwerte entfernt');
  await button(page, 'Start').click();
  await button(page, 'Testwerkzeuge').click();
  await expect(page.locator('.schema-change-list')).toContainText('Jetzt ein Pflichtfeld');
  await button(page, 'Testfälle und Abläufe').click();
  await button(page, 'Testpakete').click();
  await expect(page.getByRole('combobox', { name: 'Testfall auswählen', exact: true })).toHaveValue('0');
  expect(
    (await page.evaluate(() => window.__profilesFixture.calls)).map((call) => call.command),
  ).not.toContain('open_session');
  expect(errors).toEqual([]);
});
test('bad package and schema API error files preserve the previous content', async ({ page }) => {
  await openTools(page);
  await button(page, 'Fiktives Testpaket öffnen').click();
  await page.getByText('Anderes Paket öffnen oder Beispiel laden', { exact: true }).click();
  await dropFiles(
    page,
    page.locator('#test-package-file').locator('xpath=ancestor::div[contains(@class,"file-drop-zone")]'),
    [{ name: 'kaputt.json', type: 'application/json', content: '{"clientSecret":"never-import"}' }],
  );
  await expect(page.getByRole('alert')).toContainText('kein gültiges');
  await expect(page.getByRole('heading', { name: 'Fiktiver Integrationstest', exact: true })).toBeVisible();
  await button(page, 'Schema-Vergleich').click();
  for (const [id, content] of [
    ['compare-before', '{"type":"object"}'],
    ['compare-after', '{"result":"error","error":{"code":404}}'],
  ])
    await page
      .locator(`#${id}`)
      .setInputFiles({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await button(page, 'Schemata vergleichen').click();
  await expect(page.getByRole('alert')).toContainText('Fehlerantworten');
  await expect(page.locator('.schema-comparison-result')).toHaveCount(0);
});
test('a test package is imported only after confirmation and a matching current destination offer', async ({
  page,
}) => {
  await openTools(page);
  await page.evaluate((pack) => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__toolsCalls = [];
    window.__offerMatches = true;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__toolsCalls.push(command);
      if (command === 'save_local_file') {
        window.__exportedTestPack = new TextDecoder().decode(args);
        return Promise.resolve('C:\\Users\\Test\\Downloads\\testfall.fctest.json');
      }
      if (command === 'load_send_destination')
        return Promise.resolve({
          apiVersion: args.apiVersion,
          sessionId: args.sessionId,
          environment: 'TEST',
          data: {
            destinationId: args.destinationId,
            detailsJson: JSON.stringify({
              destinationId: args.destinationId,
              publicServices: [
                {
                  identifier: pack.cases[0].request.serviceIdentifier,
                  name: 'Fiktive Testleistung',
                  submissionSchemas: [
                    {
                      schemaUri: window.__offerMatches ? pack.cases[0].request.schemaUri : 'urn:test:anders',
                      mimeType: 'application/json',
                    },
                  ],
                  replyChannels: {
                    fitConnect: {
                      supportedSchemas: [
                        { schemaUri: pack.cases[0].reply.schemaUri, mimeType: 'application/json' },
                      ],
                    },
                  },
                },
              ],
            }),
          },
        });
      return original(command, args);
    };
  }, example);
  await button(page, 'Fiktives Testpaket öffnen').click();
  await button(page, 'Als Versandentwurf öffnen').click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await button(page, 'Anmelden').click();
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.evaluate(() => (window.__offerMatches = false));
  await button(page, 'Testfall übernehmen').click();
  const confirm = page.getByRole('dialog', { name: 'Testfall als neuen Entwurf übernehmen?', exact: true });
  await confirm.getByRole('button', { name: 'Entwurf ersetzen', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Entwurf wurde nicht ersetzt');
  await page.evaluate(() => (window.__offerMatches = true));
  await confirm.getByRole('button', { name: 'Entwurf ersetzen', exact: true }).click();
  await expect(confirm).toBeHidden();
  await button(page, 'Weiter: Fachdaten').click();
  await expect(page.locator('#send-data')).toHaveValue(example.cases[0].request.data);
  await button(page, 'Weiter: Anlagen & Antwortkanal').click();
  await expect(
    page.getByRole('checkbox', { name: 'Antworten über FIT-Connect anbieten', exact: true }),
  ).toBeChecked();
  await page.getByText('Entwurf als Testfall wiederverwenden', { exact: true }).click();
  await page.locator('#send-test-name').fill('Fiktiver Integrationstest');
  await button(page, 'Entwurf als Testpaket exportieren').click();
  await expect(page.locator('.save-feedback')).toContainText('Datei gespeichert');
  const saved = JSON.parse(await page.evaluate(() => window.__exportedTestPack));
  expect(saved.cases[0].request.data).toEqual(example.cases[0].request.data);
  expect(saved.cases[0].request.attachments).toEqual(example.cases[0].request.attachments);
  expect(saved.cases[0].request.replyOffer).toEqual(example.cases[0].request.replyOffer);
  expect(JSON.stringify(saved)).not.toContain('synthetic-secret-marker');
  expect(JSON.stringify(saved)).not.toContain('22222222-2222-4222-8222-222222222222');
  const calls = await page.evaluate(() => window.__toolsCalls);
  expect(calls).not.toContain('prepare_send');
  expect(calls).not.toContain('execute_send');
});
for (const width of [1280, 640, 320])
  test(`test tools reflow and remain accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openTools(page);
    await button(page, 'Fiktives Testpaket öffnen').click();
    for (const mode of ['Testpakete', 'Schema-Vergleich']) {
      await button(page, mode).click();
      if (mode === 'Schema-Vergleich') await button(page, 'Fiktiven Beispielvergleich öffnen').click();
      for (const [theme, forcedColors] of [
        ['light', 'none'],
        ['dark', 'none'],
        ['dark', 'active'],
      ]) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
        ).toEqual([]);
      }
    }
  });
