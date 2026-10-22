import { test, expect } from '@playwright/test';

async function prepare(page, { uncertain = false } = {}) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.evaluate(() => {
    window.__cycle = [];
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      window.__cycle.push({ command, args });
      return invoke(command, args);
    };
  });
  if (uncertain) await page.getByLabel('Ungewissen Ausgang simulieren').check();
  await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByText('Weitere Adressierungsoptionen', { exact: true }).click();
  await page.locator('#send-case').fill('33333333-3333-4333-8333-333333333333');
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await page.locator('#send-data').fill('{"test":"neuer Entwurf"}');
  await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
  await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true }),
  ).toBeVisible();
}

test('next test copies only explicitly selected draft content and requires a fresh preparation', async ({
  page,
  context,
}) => {
  await prepare(page);
  const confirmation = page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true });
  await expect(confirmation.locator('dt:has-text("Antwortangebot") + dd')).toHaveText('Nicht angeboten');
  await expect(confirmation.locator('dt:has-text("Anlagen") + dd')).toHaveText('0');
  await page.getByRole('button', { name: 'Jetzt an FIT-Connect senden', exact: true }).click();
  const start = page.getByRole('button', { name: 'Nächsten Test vorbereiten', exact: true });
  await expect(start).toBeEnabled();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Submission ID kopieren', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '22222222-2222-4222-8222-222222222222',
  );
  await start.click();
  await page
    .getByRole('dialog', { name: 'Nächsten Test vorbereiten?', exact: true })
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await expect(start).toBeFocused();
  await start.click();
  await page.getByRole('button', { name: 'Neuen Entwurf beginnen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leistungen laden', exact: true })).toBeFocused();
  await page.getByText('Weitere Adressierungsoptionen', { exact: true }).click();
  await expect(page.locator('#send-case')).toHaveValue('');
  await expect(page.locator('#send-service')).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Laden Sie zuerst');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
  await expect(page.locator('#send-data')).toHaveValue('{"test":"neuer Entwurf"}');
  const calls = await page.evaluate(() => window.__cycle);
  expect(calls.filter((call) => call.command === 'execute_send')).toHaveLength(1);
  expect(calls.filter((call) => call.command === 'prepare_send')).toHaveLength(1);
});

test('canceling a prepared send restores keyboard focus without transmitting', async ({ page }) => {
  await prepare(page);
  const confirmation = page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true });
  const prepareButton = page.getByRole('button', { name: 'Versand vorbereiten', exact: true });
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(prepareButton).toBeFocused();
  await prepareButton.click();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(prepareButton).toBeFocused();
  const calls = await page.evaluate(() => window.__cycle);
  expect(calls.filter((call) => call.command === 'cancel_send')).toHaveLength(2);
  expect(calls.some((call) => call.command === 'execute_send')).toBe(false);
});

test('uncertain sends remain locked and offer no new-test reset', async ({ page }) => {
  await prepare(page, { uncertain: true });
  await page.getByRole('button', { name: 'Jetzt an FIT-Connect senden', exact: true }).click();
  await expect(page.getByText('Versandausgang ungewiss', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nächsten Test vorbereiten', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Versand vorbereiten', exact: true })).toBeDisabled();
});

test('receiver setup collapses only for a matching loaded decryption key', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-keys.html');
  await page.locator('#destination-id').fill('00000000-0000-4000-8000-000000000002');
  await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
  await expect(page.locator('#receiver-setup')).toBeHidden();
  await expect(page.getByText('Passender Entschlüsselungsschlüssel geladen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Einrichtung ändern', exact: true }).click();
  await expect(page.locator('#receiver-setup')).toBeVisible();
  await page.locator('#destination-id').fill('00000000-0000-4000-8000-000000000099');
  await expect(page.locator('.receiver-summary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Destination laden', exact: true })).toBeVisible();
});

test('LeiKa choices show the supplied service name next to the code', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'load_send_destination') {
        const document = JSON.parse(result.data.detailsJson);
        document.publicServices[0].identifier = 'urn:de:fim:leika:leistung:99003002022000';
        result.data.detailsJson = JSON.stringify(document);
      }
      return result;
    };
  });
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
  await expect(page.locator('#send-service option:checked')).toHaveText(
    'Fiktive Testleistung · 99003002022000',
  );
});

test('a chosen task resumes after login without preparing or sending a message', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.getByRole('button', { name: 'Fachverfahren testen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Senden', exact: true })).toBeFocused();
  await expect(page.locator('.send-form')).toBeVisible();
  const calls = await page.evaluate(() => window.__profilesFixture.calls.map((item) => item.command));
  expect(calls).not.toContain('prepare_send');
  expect(calls).not.toContain('execute_send');
});

test('the reading view keeps technical provenance optional without changing the content', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
  const values = await page.locator('.application-field-value').allTextContents();
  await expect(page.locator('.application-origin')).toHaveCount(0);
  await page.getByText('Struktur, Quelltext und Feldangaben', { exact: true }).click();
  await page.getByLabel('Technische Feldangaben anzeigen', { exact: true }).check();
  expect(await page.locator('.application-origin').count()).toBeGreaterThan(0);
  expect(await page.locator('.application-field-value').allTextContents()).toEqual(values);
  await page.getByLabel('Technische Feldangaben anzeigen', { exact: true }).uncheck();
  await expect(page.locator('.application-origin')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quelltext', exact: true }).click();
  await expect(page.locator('.application-source')).toContainText('Musterfrau');
});
