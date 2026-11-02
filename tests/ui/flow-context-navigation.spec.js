import { test, expect } from './fixtures.js';
import pack from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
test('the real application routes a mapped profile while its automatic key read is pending', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html?flow-context');
  await button(page, 'Verbindung herstellen').click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Fiktives Profil eins');
  await button(page, 'Anmelden').click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  const target = '11111111-1111-4111-8111-222222222222';
  await page.evaluate((id) => {
    const f = window.__profilesFixture;
    f.profiles.push({
      ...f.profiles[0],
      profileId: id,
      name: 'Fiktives Profil zwei',
      clientId: 'synthetic-second',
    });
  }, target);
  await button(page, 'Testwerkzeuge').click();
  await button(page, 'Testfälle und Abläufe').click();
  await button(page, 'Testabläufe').click();
  await page.locator('#test-flow-file').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.locator('.flow-context summary').click();
  await button(page, 'Passende Profile laden').click();
  await page.getByRole('combobox', { name: 'Sender-Profil', exact: true }).selectOption(target);
  await button(page, 'Durchlauf starten').click();
  const shortcut = button(page, 'Zum Sender wechseln');
  await expect(shortcut).toBeEnabled();
  await page.evaluate((id) => {
    window.__profilesFixture.holdKeyProfileId = id;
  }, target);
  await shortcut.click();
  await page.waitForFunction(() => window.__profilesFixture.keyReadStarted === true);
  try {
    await expect(page.locator('.workspace-heading h1')).toHaveText('Senden', { timeout: 2500 });
    const writes = await page.evaluate(
      () =>
        window.__profilesFixture.calls.filter((c) =>
          ['prepare_send', 'execute_send', 'execute_receipt'].includes(c.command),
        ).length,
    );
    expect(writes).toBe(0);
  } finally {
    await page.evaluate(() => window.__profilesFixture.finishKeyRead?.());
  }
});
