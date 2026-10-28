import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readingText, readingPacket } from './reading-fixtures.js';

for (const viewport of [
  { width: 1180, height: 800 },
  { width: 420, height: 500 },
]) {
  test(`saved profile connection is immediately reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
    await page.evaluate(() => {
      window.__profilesFixture.profiles = Array.from({ length: 10 }, (_, i) => ({
        profileId: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
        name: `Musterprofil ${i + 1}`,
        clientId: `fiktiver-zugang-${i + 1}`,
        apiVersion: 'v3',
        role: 'administrative-system',
        keyCount: 2,
        available: true,
      }));
    });
    await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
    await expect(page.locator('#saved-profile-choice option')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Mit Profil verbinden', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.locator('#client-secret')).toBeHidden();
    await page.getByText('Anderen Zugang verwenden', { exact: true }).click();
    await expect(page.locator('#client-secret')).toBeVisible();
    await expect(page.locator('#client-secret')).toHaveValue('');
    await expect(page.locator('#client-secret')).toHaveAttribute('type', 'password');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('system appearance updates live, manual override persists and system mode can be restored', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  const picker = page.getByRole('button', { name: 'Darstellung wählen', exact: true });
  await picker.click();
  await page.getByRole('button', { name: 'Hell', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(picker).toBeFocused();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await picker.click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await picker.click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(picker).toBeFocused();
  await expect(page.getByRole('button', { name: 'System', exact: true })).toBeHidden();
});

test('SSP environment identities match in header and sidebar, remain readable and update the title', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/environments.html');
  for (const [environment, color] of [
    ['TEST', 'rgb(0, 146, 203)'],
    ['STAGE', 'rgb(252, 191, 73)'],
    ['PROD', 'rgb(144, 190, 109)'],
  ]) {
    if (environment !== 'TEST') {
      await page.getByRole('combobox', { name: 'Umgebung', exact: true }).selectOption(environment);
      await page.getByRole('button', { name: `Zu ${environment} wechseln`, exact: true }).click();
    }
    await expect(page).toHaveTitle(`FBForge Connect · FIT-Connect ${environment}`);
    const badges = page.locator(`.environment-tag[data-environment="${environment}"]`);
    await expect(badges).toHaveCount(2);
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const badge of await badges.all()) await expect(badge).toHaveCSS('background-color', color);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    if (environment === 'PROD') await expect(page.locator('.environment-warning')).toContainText('PROD');
  }
});

test('full application keeps receipt actions beside long data at default size and before long compact attachment lists', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?app=1');
  await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
  await page.locator('#client-id').fill('fiktiver-review-zugang');
  await page.locator('#client-secret').fill('synthetic-review-marker');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByRole('button', { name: 'Empfangen', exact: true }).click();
  await page.evaluate(
    ({ text, packet }) => {
      const fixture = window.__applicationFixture;
      fixture.customText = text;
      fixture.schemaPacket = packet;
      fixture.extraAttachments = Array.from({ length: 18 }, (_, i) => ({
        contentId: `${String(100 + i).padStart(8, '0')}-1111-4111-8111-111111111111`,
        kind: 'attachment',
        attachmentId: `${String(200 + i).padStart(8, '0')}-1111-4111-8111-111111111111`,
        fileName: `Fiktiver Nachweis ${i + 1}.txt`,
        mimeType: 'text/plain',
        description: 'Fiktive Anlage',
        bytes: new TextEncoder().encode('Fiktiver Nachweis.'),
      }));
    },
    { text: readingText, packet: readingPacket },
  );
  await page.locator('#pickup-destination').fill('00000002-1111-4111-8111-111111111111');
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
  const aside = page.getByRole('complementary', { name: 'Anlagen und Aktionen', exact: true });
  const main = await page.locator('.document-main').boundingBox();
  expect((await aside.boundingBox()).x).toBeGreaterThan(main.x + main.width);
  await page.locator('.workspace-scroll').evaluate((el) => (el.scrollTop += 850));
  for (const action of ['Annehmen', 'Ablehnen', 'Antwort verfassen'])
    await expect(aside.getByRole('button', { name: action, exact: true })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 640, height: 700 });
  await page.getByRole('link', { name: 'Zu Anlagen und Aktionen', exact: true }).click();
  await expect(aside.getByRole('button', { name: 'Annehmen', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(
    aside.getByRole('list', { name: 'Anlagenliste', exact: true }).locator(':scope > li'),
  ).toHaveCount(19);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => window.__applicationFixture.calls.some((name) => name.startsWith('execute_'))),
  ).toBe(false);
});
