import { test, expect } from '@playwright/test';
async function draft(page) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
}
test('public schema approval resumes preparation and cancel preserves the complete draft', async ({
  page,
}) => {
  await draft(page);
  await page.locator('#send-data').fill('{"test":"unverändert"}');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const state = (window.__sourceAccess = { selections: [], prepared: 0, writes: 0 });
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'validate_send_data') {
        const selection = JSON.parse(args.schemaDocument);
        state.selections.push(selection);
        if (!selection.allowExternalSchemas) throw 'schema_consent_required';
      }
      if (command === 'prepare_send') state.prepared++;
      if (command === 'execute_send') state.writes++;
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  const prepare = page.getByRole('button', { name: 'Versand vorbereiten', exact: true });
  await prepare.click();
  const access = page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?', exact: true });
  await expect(access).toBeVisible();
  await access.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(prepare).toBeFocused();
  await expect(page.locator('#send-data')).toHaveValue('{"test":"unverändert"}');
  expect(await page.evaluate(() => window.__sourceAccess.prepared)).toBe(0);
  await prepare.click();
  await access.getByRole('button', { name: 'Für diese Verbindung erlauben', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true });
  await expect(confirmation).toBeVisible();
  expect(
    await page.evaluate(() => window.__sourceAccess.selections.map((s) => s.allowExternalSchemas)),
  ).toEqual([false, false, true]);
  expect(await page.evaluate(() => window.__sourceAccess.prepared)).toBe(1);
  expect(await page.evaluate(() => window.__sourceAccess.writes)).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'API wechseln', exact: true }).click();
  await page.getByRole('button', { name: 'Adressierung', exact: true }).click();
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await page.getByRole('button', { name: 'Fachdaten gegen Schema prüfen', exact: true }).click();
  await expect(access).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__sourceAccess.writes)).toBe(0);
});
test('schema validation is invalidated by editing and repeated automatically before preparation', async ({
  page,
}) => {
  await draft(page);
  await page.getByRole('button', { name: 'Fachdaten gegen Schema prüfen', exact: true }).click();
  await expect(page.getByText('Fachdaten entsprechen dem Schema.', { exact: true })).toBeVisible();
  await page.locator('#send-data').fill('{"geändert":true}');
  await expect(page.getByText('Fachdaten entsprechen dem Schema.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true });
  await expect(dialog.locator('dt:has-text("Fachdatenprüfung") + dd')).toHaveText('Schema erfüllt');
  expect(await page.evaluate(() => window.__sendFixture.validations)).toBe(2);
});
test('a failed schema check blocks preparation and negative tests need an explicit opt-out', async ({
  page,
}) => {
  await draft(page);
  await page.evaluate(() => (window.__sendFixture.validationError = 'data_schema_invalid'));
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('Pflichtfelder');
  await page.getByRole('button', { name: 'Fachdaten', exact: true }).click();
  await page.getByText('Lokale Schemata und technische Optionen', { exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Für einen bewussten Negativtest ohne Fachdaten-Schemaprüfung senden',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
  ).toContainText('Nicht durchgeführt – bewusster Negativtest');
  expect(await page.evaluate(() => window.__sendFixture.validations)).toBe(1);
});
