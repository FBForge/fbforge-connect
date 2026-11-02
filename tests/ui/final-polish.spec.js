import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

for (const api of ['v2', 'v3']) {
  test(`missing reply channel is explained before offering an action ${api}`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1&api=${api}`);
    await page.evaluate(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (command, args) => {
        if (command === 'reply_target') return Promise.reject('reply_channel_missing');
        return original(command, args);
      };
    });
    await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Für diesen Vorgang wurde kein Antwortkanal angeboten.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Ablehnen', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
  });
}

test('inbox filter controls align at regular width and stack without overflow at compact width', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html');
  await page.getByRole('button', { name: 'Eingang', exact: true }).click();
  const filter = page.getByLabel('Alter auf dieser Seite', { exact: true });
  const load = page.getByRole('button', { name: 'Alter aus Event Logs laden', exact: true });
  const order = page.getByLabel('Älteste zuerst (diese Seite)', { exact: true });
  const bottom = async (locator) => {
    const box = await locator.boundingBox();
    return box.y + box.height;
  };
  expect(Math.abs((await bottom(load)) - (await bottom(filter)))).toBeLessThanOrEqual(2);
  expect(Math.abs((await bottom(order.locator('..'))) - (await bottom(filter)))).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 420, height: 850 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(load).toBeVisible();
  expect((await filter.boundingBox()).y).toBeGreaterThanOrEqual(await bottom(load));
  expect((await order.boundingBox()).y).toBeGreaterThan(await bottom(filter));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('settings navigation exposes network and updates before application information', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?app=1');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeFocused();
  const network = page.getByRole('heading', { name: 'Netzwerk und Proxy', exact: true });
  const updates = page.getByRole('heading', { name: 'Aktualisierungen', exact: true });
  const about = page.locator('#about-title');
  await expect(network).toBeVisible();
  expect((await network.boundingBox()).y).toBeLessThan((await about.boundingBox()).y);
  expect((await updates.boundingBox()).y).toBeLessThan((await about.boundingBox()).y);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([]);
});

test('desktop context menu is suppressed while keyboard editing remains available', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?app=1');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByLabel('Verbindung', { exact: true }).selectOption('manual');
  const host = page.getByLabel('Proxy-Host', { exact: true });
  await host.fill('proxy.example.de');
  await host.press('ControlOrMeta+A');
  await host.press('ArrowRight');
  await host.press('Backspace');
  await expect(host).toHaveValue('proxy.example.d');
  for (const target of [host, page.locator('.workspace-heading')]) {
    expect(
      await target.evaluate((element) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
  }
});

test('an unavailable reply check can retry without losing the verified application', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__failReplyCheck = true;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'reply_target' && window.__failReplyCheck)
        return Promise.reject('resource_unavailable');
      return original(command, args);
    };
  });
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Antwortkanal erneut prüfen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toHaveCount(0);
  await expect(page.locator('.received-application')).toContainText('Erika');
  await expect(page.getByRole('button', { name: 'Ablehnen', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    window.__failReplyCheck = false;
  });
  await page.getByRole('button', { name: 'Antwortkanal erneut prüfen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('alert', { name: 'Antwortkanal konnte nicht geprüft werden', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
});

test('a pending reply check is invalidated when the verification is discarded', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    let first = true;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'reply_target' && first) {
        first = false;
        return new Promise((resolve, reject) => {
          window.__releaseReplyCheck = () => reject('reply_channel_missing');
        });
      }
      return original(command, args);
    };
  });
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByText('Antwortkanal wird geprüft …', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toBeEnabled();
  await page.getByText('Entschlüsselung und Schemaeinstellungen', { exact: true }).click();
  await page.getByRole('button', { name: 'Prüfergebnis verwerfen', exact: true }).click();
  await page.evaluate(async () => {
    window.__releaseReplyCheck();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Antwort verfassen', exact: true })).toBeEnabled();
  await expect(
    page.getByText('Für diesen Vorgang wurde kein Antwortkanal angeboten.', { exact: true }),
  ).toHaveCount(0);
});
