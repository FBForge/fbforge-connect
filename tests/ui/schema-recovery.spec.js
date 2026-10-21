import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const api of ['v2', 'v3']) {
  test(`schema consent offers clear recovery without granting access automatically (${api})`, async ({
    page,
  }) => {
    const external = [];
    page.on('request', (request) => {
      if (
        !request.url().startsWith('http://127.0.0.1:1420/') &&
        !request.url().startsWith('data:') &&
        !request.url().startsWith('blob:')
      )
        external.push(request.url());
    });
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?api=${api}`);
    await page.evaluate(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const state = (window.__schemaRecovery = { code: 'schema_consent_required', requests: [] });
      window.__TAURI_INTERNALS__.invoke = (command, args) => {
        if (command === 'verify_submission') {
          state.requests.push(JSON.parse(args.schemaDocument));
          if (state.code) throw state.code;
        }
        return invoke(command, args);
      };
    });
    await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
    const notice = page.getByRole('alert', { name: 'Freigabe für Schemaquellen erforderlich', exact: true });
    await expect(notice.getByRole('heading')).toBeFocused();
    await expect(notice.getByText('schema_consent_required', { exact: true })).not.toBeVisible();
    await notice.getByRole('button', { name: 'Zur Freigabe', exact: true }).click();
    const consent = page.getByRole('checkbox', {
      name: 'Öffentliche Schemaquellen für diese Sitzung erlauben',
      exact: true,
    });
    await expect(consent).toBeFocused();
    await expect(consent).not.toBeChecked();
    await notice.getByRole('button', { name: 'Lokales Schema hinzufügen', exact: true }).click();
    await expect(page.locator('#receive-schema-file')).toBeFocused();
    await expect(consent).not.toBeChecked();
    expect(await page.evaluate(() => window.__schemaRecovery.requests)).toEqual([{ schemas: [] }]);
    await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
    await expect(notice.getByText(`API ${api}`, { exact: true })).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Fehlercode kopieren', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 640, height: 540 });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await consent.check();
    await page.evaluate(() => (window.__schemaRecovery.code = ''));
    await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__schemaRecovery.requests[1].allowExternalSchemas)).toBe(true);
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
      .getByRole('alert', { name: 'Testschlüssel fehlt', exact: true })
      .getByRole('button', { name: 'Schlüssel einrichten', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window.__schemaRecovery.code = 'private-server-text-secret-marker'));
  await verify.click();
  await expect(
    page.getByRole('alert', { name: 'Inhalte konnten nicht geprüft werden', exact: true }),
  ).toContainText('Die lokale Aktion ist fehlgeschlagen.');
  await expect(page.locator('body')).not.toContainText('private-server-text-secret-marker');
});
