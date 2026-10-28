import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:1420';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
test('ten profiles expose just the selected identity and keep secondary actions collapsed', async ({
  page,
}) => {
  await page.goto(`${base}/test-fixtures/profiles.html`);
  await page.evaluate(
    (profiles) => {
      window.__profilesFixture.profiles = profiles;
    },
    Array.from({ length: 10 }, (_, n) => ({
      profileId: id(n + 1),
      name: `Bauamt TEST ${n + 1}`,
      clientId: `synthetic-client-${n + 1}`,
      apiVersion: n % 2 ? 'v2' : 'v3',
      role: 'online-service',
      keyCount: n,
      available: true,
    })),
  );
  await button(page, 'Verbindung herstellen').click();
  const choices = page.locator('#saved-profile-choice');
  await expect(choices.locator('option')).toHaveCount(10);
  await expect(page.locator('.selected-profile')).toHaveCount(1);
  await expect(button(page, 'Mit Profil verbinden')).toHaveCount(1);
  await expect(button(page, 'Profilname oder Secret ändern')).toBeHidden();
  await choices.selectOption(id(10));
  await expect(page.locator('.selected-profile')).toContainText('synthetic-client-10');
  await page.getByText('Profil verwalten', { exact: true }).click();
  await expect(button(page, 'Profilname oder Secret ändern')).toBeVisible();
  await choices.selectOption(id(2));
  await expect(button(page, 'Profilname oder Secret ändern')).toBeHidden();
  for (const width of [1180, 420]) {
    await page.setViewportSize({ width, height: 900 });
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
test('schema selection is visible before example generation and FIM lookup only uses exact matches', async ({
  page,
}) => {
  const codes = ['99134061002000', '99000000000000'];
  let requests = 0;
  await page.route('https://fimportal.de/**', (route) => {
    requests++;
    return route.fulfill({ json: { items: [{ leistungsschluessel: codes[0], title: 'Fiktive Beihilfe' }] } });
  });
  await page.goto(`${base}/test-fixtures/sending.html`);
  await page.evaluate((codes) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'load_send_destination') {
        const details = JSON.parse(result.data.detailsJson);
        details.publicServices = codes.map((code) => ({
          identifier: `urn:de:fim:leika:leistung:${code}`,
          submissionSchemas: [
            { schemaUri: 'urn:test:first', mimeType: 'application/json' },
            { schemaUri: 'urn:test:second', mimeType: 'application/xml' },
          ],
        }));
        details.publicServices.push({ ...details.publicServices[0], identifier: '__proto__' });
        result.data.detailsJson = JSON.stringify(details);
      }
      return result;
    };
  }, codes);
  await page.locator('#send-source').fill(id(1));
  await page.locator('#send-target').fill(id(2));
  await button(page, 'Leistungen laden').click();
  expect(requests).toBe(0);
  const service = page.locator('#send-service');
  await service.selectOption('__proto__');
  const previous = await service.inputValue();
  await button(page, 'Leistungsnamen aus FIM laden').click();
  await expect(service.locator('option').nth(1)).toHaveText(`Fiktive Beihilfe · ${codes[0]}`);
  await expect(service.locator('option').nth(2)).toHaveText(`LeiKa ${codes[1]}`);
  await expect(service).toHaveValue(previous);
  await expect(page.locator('#send-service-name')).toHaveValue('__proto__');
  await button(page, 'Weiter: Fachdaten').click();
  const schema = page.locator('#send-schema');
  await expect(schema).toBeVisible();
  await schema.selectOption('1');
  await expect(schema).toHaveValue('1');
  const first = await schema.boundingBox(),
    second = await button(page, 'Fiktive Beispieldaten erzeugen').boundingBox();
  expect(first.y + first.height).toBeLessThan(second.y);
  await expect(page.locator('.data-schema-options')).not.toHaveAttribute('open');
});
test('named test cases can be saved, restored, exported and deleted without sending', async ({ page }) => {
  const calls = [];
  await page.goto(`${base}/test-fixtures/sending.html`);
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__libraryCalls = [];
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__libraryCalls.push(command);
      return invoke(command, args);
    };
  });
  await page.locator('#send-source').fill(id(1));
  await page.locator('#send-target').fill(id(2));
  await button(page, 'Leistungen laden').click();
  await button(page, 'Weiter: Fachdaten').click();
  const original = '{"vorname":"Erika","nachname":"Mustermann"}';
  await page.locator('#send-data').fill(original);
  await button(page, 'Weiter: Anlagen & Antwortkanal').click();
  await page.getByText('Entwurf als Testfall wiederverwenden', { exact: true }).click();
  await page.locator('#send-test-name').fill('Bauantrag mit Testdaten');
  await button(page, 'Testfall speichern').click();
  await expect(page.locator('#send-library-choice')).toContainText('Bauantrag mit Testdaten');
  await expect(page.locator('.save-test-case').getByRole('status')).toContainText('nach einem Neustart');
  await button(page, 'Fachdaten').click();
  await page.locator('#send-data').fill('{"ersetzt":true}');
  await button(page, 'Testfall laden').click();
  const dialog = page.getByRole('dialog', { name: 'Testfall als neuen Entwurf übernehmen?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#send-data')).toHaveValue('{"ersetzt":true}');
  await dialog.getByRole('button', { name: 'Entwurf ersetzen', exact: true }).click();
  await button(page, 'Weiter: Fachdaten').click();
  await expect(page.locator('#send-data')).toHaveValue(original);
  await page.getByText('Testpakete importieren, exportieren und löschen', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await button(page, 'Testpaket exportieren').click();
  const saved = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  expect(saved.name).toBe('Bauantrag mit Testdaten');
  expect(saved.cases[0].request.data).toBe(original);
  expect(JSON.stringify(saved)).not.toContain(id(2));
  await button(page, 'Testpaket löschen').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#send-library-choice')).toBeVisible();
  await button(page, 'Testpaket löschen').click();
  await button(page, 'Endgültig löschen').click();
  await expect(page.locator('#send-library-choice')).toHaveCount(0);
  await expect(page.locator('#send-data')).toHaveValue(original);
  calls.push(...(await page.evaluate(() => window.__libraryCalls)));
  expect(calls).not.toContain('prepare_send');
  expect(calls).not.toContain('execute_send');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
});
