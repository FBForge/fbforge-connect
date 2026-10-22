import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const api of ['v2', 'v3']) {
  test(`schema access asks on demand, cancels safely and resumes the original verification (${api})`, async ({
    page,
  }) => {
    const external = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:1420/') && !/^(data|blob):/.test(request.url()))
        external.push(request.url());
    });
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
    await page.evaluate(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const state = (window.__schemaRecovery = { requests: [] });
      window.__TAURI_INTERNALS__.invoke = (command, args) => {
        if (command === 'verify_submission') {
          const selection = JSON.parse(args.schemaDocument);
          state.requests.push(selection);
          if (!selection.allowExternalSchemas) throw 'schema_consent_required';
        }
        return invoke(command, args);
      };
    });
    const verify = page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true });
    await verify.click();
    const dialog = page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
    await expect(dialog).toContainText('keine Zugangsdaten oder Fachdaten');
    await expect(page.getByRole('checkbox', { name: /Schemaquellen/ })).toHaveCount(0);
    expect(await page.evaluate(() => window.__schemaRecovery.requests)).toEqual([{ schemas: [] }]);
    for (const [theme, forcedColors] of [
      ['light', 'none'],
      ['dark', 'none'],
      ['light', 'active'],
    ]) {
      await page.setViewportSize({ width: api === 'v3' ? 320 : 640, height: 700 });
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await page.emulateMedia({ forcedColors });
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
          .violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(verify).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => window.__schemaRecovery.requests.length)).toBe(1);
    await verify.click();
    await dialog.getByRole('button', { name: 'Für diese Verbindung erlauben', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => window.__schemaRecovery.requests.map((r) => r.allowExternalSchemas === true)),
    ).toEqual([false, false, true]);
    await page.getByText('Entschlüsselung und Schemaeinstellungen', { exact: true }).click();
    await page.getByRole('button', { name: 'Erneut entschlüsseln und prüfen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__schemaRecovery.requests.length)).toBe(4);
    await page.getByText('Entschlüsselung und Schemaeinstellungen', { exact: true }).click();
    await page.locator('#receive-schema-sources').click();
    await page.getByRole('button', { name: 'Erneut entschlüsseln und prüfen', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
    expect(external).toEqual([]);
  });
}

test('missing keys show a targeted action while unknown native text remains private', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__schemaRecovery = { code: 'key_missing' };
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'verify_submission') throw window.__schemaRecovery.code;
      return invoke(command, args);
    };
  });
  const verify = page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true });
  await verify.click();
  await expect(
    page
      .getByRole('alert', { name: 'Schlüssel fehlt', exact: true })
      .getByRole('button', { name: 'Schlüssel einrichten', exact: true }),
  ).toBeVisible();
  for (const code of ['__proto__', 'constructor', 'toString', 'private-server-text-secret-marker']) {
    await page.evaluate((value) => (window.__schemaRecovery.code = value), code);
    await verify.click();
    await expect(
      page.getByRole('alert', { name: 'Inhalte konnten nicht geprüft werden', exact: true }),
    ).toContainText('Die lokale Aktion ist fehlgeschlagen.');
    await expect(page.locator('body')).not.toContainText('private-server-text-secret-marker');
  }
});
