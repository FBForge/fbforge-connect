import { test, expect } from '@playwright/test';

for (const api of ['v2', 'v3']) {
  test(`FIM lookup follows the service directly before sender addressing (${api})`, async ({ page }) => {
    let lookups = 0;
    await page.route('https://fimportal.de/**', (route) => {
      lookups++;
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
    await page.evaluate(() => {
      document.getElementById('app').classList.add('workspace-content');
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        const result = await invoke(command, args);
        if (command === 'load_send_destination') {
          const details = JSON.parse(result.data.detailsJson);
          details.publicServices[0].identifier = 'urn:de:fim:leika:leistung:99134061002000';
          delete details.publicServices[0].name;
          result.data.detailsJson = JSON.stringify(details);
        }
        return result;
      };
    });
    if (api === 'v2') await page.getByRole('button', { name: 'API wechseln', exact: true }).click();
    await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
    await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
    const service = page.locator('#send-service');
    const lookup = page.getByRole('button', { name: 'Leistungsnamen aus FIM laden', exact: true });
    await expect(service).toBeVisible();
    await expect(lookup).toBeVisible();
    expect(lookups).toBe(0);
    for (const width of [1180, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((dark) => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      }, width === 390);
      const field = await service.boundingBox(),
        action = await lookup.boundingBox();
      expect(action.y).toBeGreaterThanOrEqual(field.y + field.height);
      expect(action.x).toBeCloseTo(field.x, 0);
      if (api === 'v3') {
        const sender = await page.locator('.sender-destination').boundingBox();
        expect(action.y + action.height).toBeLessThan(sender.y);
      } else await expect(page.locator('.sender-destination')).toHaveCount(0);
      await service.focus();
      await page.keyboard.press('Tab');
      await expect(lookup).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const selected = await service.inputValue();
    await lookup.click();
    await expect(page.locator('.service-name-lookup [role="status"]')).toContainText(
      'Keine eindeutigen Leistungsbezeichnungen',
    );
    await expect(service).toHaveValue(selected);
    expect(lookups).toBeGreaterThan(0);
    if (api === 'v3') {
      const notice = await page.locator('.service-name-lookup').boundingBox();
      const sender = await page.locator('.sender-destination').boundingBox();
      expect(notice.y + notice.height).toBeLessThan(sender.y);
    }
  });
}
