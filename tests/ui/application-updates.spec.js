import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const [width, colorScheme] of [
  [1180, 'light'],
  [420, 'dark'],
]) {
  test(`updates are explicit, keyboard accessible and readable at ${width}px ${colorScheme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme });
    await page.goto('http://127.0.0.1:1420/test-fixtures/updates.html');
    await expect(page.getByRole('heading', { name: 'Aktualisierungen' })).toBeVisible();
    const check = page.getByRole('button', { name: 'Nach Updates suchen' });
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('0.4.0');
    await page.getByText('Änderungen in dieser Version').click();
    await expect(page.locator('.update-notes')).toContainText('<img');
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
    await expect(page.locator('.update-notes img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Update herunterladen' }).click();
    const install = page.getByRole('button', { name: 'Installieren und neu starten' });
    await page.evaluate(() => window.__updateFixture.setBusy(true));
    await expect(install).toBeDisabled();
    expect(
      await page.evaluate(() =>
        window.__updateFixture.calls.some((c) => c.command === 'install_application_update'),
      ),
    ).toBe(false);
    await page.evaluate(() => window.__updateFixture.setBusy(false));
    await install.click();
    await expect(install).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('failed checks remain recoverable and never install or claim current', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/updates.html');
  await page.evaluate(() => (window.__updateFixture.fail = 'update_network_failed'));
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByRole('alert')).toContainText('Internetverbindung');
  await expect(page.getByRole('status')).not.toContainText('aktuelle stabile Version');
  await expect(page.getByRole('button', { name: 'Installieren und neu starten' })).toHaveCount(0);
  await page.evaluate(() => (window.__updateFixture.fail = ''));
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update herunterladen' })).toBeEnabled();
});

test('download cancellation is available without installing', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/updates.html');
  await page.evaluate(() => window.__updateFixture.setPhase('downloading'));
  await page.getByRole('button', { name: 'Download abbrechen' }).click();
  expect(
    await page.evaluate(() =>
      window.__updateFixture.calls.some((c) => c.command === 'cancel_application_update'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      window.__updateFixture.calls.some((c) => c.command === 'install_application_update'),
    ),
  ).toBe(false);
});

test('the full application announces a release and prevents editing during native installation confirmation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__updateCalls = [];
    let phase = 'idle';
    const status = () => ({
      configured: true,
      supported: true,
      phase,
      version: phase === 'idle' ? null : '0.4.0',
      notes: 'Fiktive Versionshinweise',
      downloaded: 0,
      total: null,
    });
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command) {
        window.__updateCalls.push(command);
        if (command === 'list_profiles') return [];
        if (command === 'application_update_status') return status();
        if (command === 'check_application_update') {
          phase = 'available';
          return status();
        }
        if (command === 'download_application_update') {
          phase = 'downloaded';
          return status();
        }
        if (command === 'install_application_update')
          return new Promise((resolve, reject) => {
            window.__cancelInstall = () => reject('update_cancelled');
          });
        throw 'session_missing';
      },
    };
  });
  await page.goto('http://127.0.0.1:1420/');
  await expect(page.getByRole('status')).toContainText('0.4.0');
  expect(await page.evaluate(() => window.__updateCalls.includes('download_application_update'))).toBe(false);
  await page.getByRole('button', { name: 'Update ansehen' }).click();
  await expect(page.getByRole('heading', { name: 'Info', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Update herunterladen' }).click();
  await page.getByRole('button', { name: 'Installieren und neu starten' }).click();
  await expect(page.locator('.desktop-shell')).toHaveAttribute('inert', '');
  await page.evaluate(() => window.__cancelInstall());
  await expect(page.locator('.desktop-shell')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Installieren und neu starten' })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
