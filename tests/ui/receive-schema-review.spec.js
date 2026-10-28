import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const api of ['v2', 'v3']) {
  test(`schema-invalid data stays readable with exact field diagnostics and schema (${api})`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
    await expect(
      page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.__applicationFixture.schemaPacket = {
        schemaPackage: 1,
        schemaUri: 'urn:test:person',
        documents: {
          'urn:test:person': {
            type: 'object',
            properties: {
              antragsteller: {
                type: 'object',
                properties: { vorname: { title: 'Vorname', type: 'integer' } },
              },
            },
          },
        },
        validation: {
          status: 'invalid',
          errors: [
            {
              path: '/antragsteller/vorname',
              keyword: 'type',
              message: 'Der Datentyp passt nicht zum Schema. Schema-Vorgabe: integer',
              line: 0,
              column: 0,
            },
          ],
        },
      };
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        const result = await invoke(command, args);
        if (command === 'verify_submission') {
          result.data.warnings.push('DATA_SCHEMA_INVALID');
          result.data.warningCount++;
        }
        return result;
      };
    });
    await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    await expect(page.locator('.verification-stages')).toContainText('Fachdaten weichen vom Schema ab');
    await expect(page.locator('.verification-stages')).not.toContainText('Fachdaten-Schema geprüft');
    const field = page.locator('.application-field[data-field-path="/antragsteller/vorname"]');
    await expect(field).toContainText('Erika');
    await expect(field).toHaveClass(/application-invalid/);
    await expect(field).toContainText('Schema-Vorgabe: integer');
    await page.getByRole('button', { name: 'Feld im Formular anzeigen', exact: true }).click();
    await expect(field).toBeFocused();
    await page.getByText('Verwendetes Schema anzeigen', { exact: true }).click();
    await expect(page.locator('.schema-review pre')).toContainText('integer');
    await expect(page.locator('.schema-review')).toContainText('urn:test:person');
    if (api === 'v2') {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
  });
}

test('a transport-only historical case cannot start a folder selection or download', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  await expect(page.getByRole('heading', { name: 'Meine Vorgänge', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__unavailableExports = 0;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'begin_message_export' || command === 'export_message') window.__unavailableExports++;
      const result = await invoke(command, args);
      if (command === 'case_workspace' && args.operation === 'parts') {
        result.data.total = 1;
        result.data.parts = [{ ...result.data.parts[0], kind: 'metadata', fileName: 'Transportdaten.json' }];
      }
      return result;
    };
  });
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Alle Dateien herunterladen', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Im Empfang entschlüsseln und prüfen', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Für diese lokale Kopie sind noch keine entschlüsselten Fachdaten verfügbar.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__unavailableExports)).toBe(0);
});
