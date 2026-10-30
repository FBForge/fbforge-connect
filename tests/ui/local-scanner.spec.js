import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page, api = 'v3') {
  await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
  await page.getByRole('button', { name: 'Malwarescanner', exact: true }).click();
  await page.getByRole('combobox', { name: 'Verfahren', exact: true }).selectOption('local');
  await expect(page.getByRole('heading', { name: 'Lokaler ClamAV', exact: true })).toBeVisible();
}
for (const api of ['v2', 'v3']) {
  test(`scanner offers four explicit modes and preserves local installation errors (${api})`, async ({
    page,
  }) => {
    await open(page, api);
    await expect(page.getByRole('combobox', { name: 'Verfahren' }).locator('option')).toHaveCount(4);
    await expect(page.getByRole('definition').filter({ hasText: 'Nicht installiert' })).toBeVisible();
    await page.evaluate(() => (window.__integration.localFailure = 'scanner_package_invalid'));
    await page.getByRole('button', { name: 'Lokales Scanner-Paket importieren', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Paket ist beschädigt');
    expect(await page.evaluate(() => window.__integration.local.installed)).toBe(false);
    expect(
      await page.evaluate(
        () =>
          window.__integration.calls.filter((call) => call.command === 'configure_malware_scanner').length,
      ),
    ).toBe(0);
  });
}
test('cancel reaches native control while a scanner installation remains pending', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__integration.holdLocalInstall = true));
  await page.getByRole('button', { name: 'Scanner online einrichten', exact: true }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Scanner-Downloadfortschritt', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Vorgang abbrechen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('abgebrochen');
  expect(
    await page.evaluate(() =>
      window.__integration.calls.some((call) => call.command === 'cancel_local_scanner_operation'),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__integration.local.installed)).toBe(false);
});
test('database age, readiness and automatic-update consent remain visible at narrow widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    Object.assign(window.__integration.local, {
      installed: true,
      enabled: true,
      ready: false,
      databaseAgeDays: 15,
      databaseVersion: 28100,
      databaseCreatedAt: 1792000000,
      updateFailed: true,
    });
  });
  await expect(page.getByText('Der Signaturbestand ist 15 Tage alt.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('definition').filter({ hasText: 'derzeit nicht betriebsbereit' }),
  ).toBeVisible();
  const updates = page.getByRole('checkbox', {
    name: 'Offizielle Signaturen beim App-Start höchstens einmal täglich online aktualisieren',
    exact: true,
  });
  await updates.check();
  expect(await page.evaluate(() => window.__integration.local.automaticUpdates)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('stopping a connected local scanner also disables its Java scanner endpoint', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    Object.assign(window.__integration.local, {
      installed: true,
      enabled: true,
      ready: true,
      databaseVersion: 28168,
      databaseCreatedAt: 1793255040,
      databaseAgeDays: 0,
    }),
  );
  await page.getByRole('button', { name: 'Scanner-Einstellung anwenden', exact: true }).click();
  await expect(page.getByText('Aktiv: Lokaler ClamAV', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lokalen Scanner beenden', exact: true }).click();
  await expect(page.getByText('Aktiv: Kein Scanner', { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__integration.calls);
  const configured = calls.filter((call) => call.command === 'configure_malware_scanner');
  expect(configured.map((call) => call.args.configuration.kind)).toEqual(['local', 'off']);
  expect(calls.some((call) => call.command === 'stop_local_scanner')).toBe(false);
});
