import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
for (const [width, theme] of [
  [1440, 'light'],
  [900, 'dark'],
  [420, 'light'],
]) {
  test(`destination backups stay in their workspace across all navigation ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const warnings = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
    });
    await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.getByRole('button', { name: 'Verbindung herstellen', exact: true }).click();
    await page.locator('#client-id').fill('synthetic-navigation-client');
    await page.locator('#client-secret').fill('synthetic-secret');
    await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
    await page.locator('#profile-name').fill('Testsender');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
    await page.evaluate(async () =>
      (await import('/test-fixtures/destination-backup-fixture.js')).installBackupBridge({ empty: true }),
    );
    await page.getByRole('button', { name: 'Destinations', exact: true }).click();
    await page.getByRole('button', { name: 'Zustellpunkt-Sicherungen', exact: true }).click();
    const backups = page.getByRole('heading', { name: 'Zustellpunkt-Sicherungen', exact: true });
    await expect(backups).toBeVisible();
    const heights = await page
      .locator('.topbar-actions')
      .evaluate((el) =>
        [...el.querySelectorAll('select, .connection-button, .icon-button')].map(
          (c) => c.getBoundingClientRect().height,
        ),
      );
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
    await page.screenshot({ path: info.outputPath('destinations.png') });
    for (const name of [
      'Hilfe',
      'Diagnose',
      'Einstellungen',
      'Senden',
      'Empfangen',
      'Vorgänge',
      'Prozesse',
      'Event Log',
      'Testwerkzeuge',
      'Virenscan',
      'Start',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('.workspace-heading h1')).toHaveText(name);
      if (name === 'Hilfe' || name === 'Diagnose')
        await page.screenshot({ path: info.outputPath(`${name}.png`) });
      await expect(backups).toBeHidden();
    }
    await page.getByRole('button', { name: 'Destinations', exact: true }).click();
    await expect(backups).toBeVisible();
    expect(warnings.filter((s) => s.includes('Runtime directive used on component'))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
  });
}
