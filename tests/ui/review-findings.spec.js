import { preparationPage, testReuse } from '../../scripts/scenario-navigation.mjs';
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import pack from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function tools(page, legacy = false) {
  await page.goto(
    'http://127.0.0.1:1420/test-fixtures/integration-tools.html' + (legacy ? '?legacy=flows' : ''),
  );
}
for (const api of ['v2', 'v3']) {
  test(`edited tests survive reopening through the common collection (${api})`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
    await page.getByText('Testdatei importieren', { exact: true }).click();
    await page.locator('#scenario-import').setInputFiles({
      name: 'test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pack)),
    });
    await page.getByLabel('Testname', { exact: true }).fill('Abnahmetest gespeichert');
    await testReuse(page);
    await button(page, 'Test speichern').click();
    await expect(page.getByRole('status').filter({ hasText: 'dauerhaft' })).toBeVisible();
    const download = page.waitForEvent('download');
    await testReuse(page);
    await button(page, 'Testdatei exportieren').click();
    expect((await download).suggestedFilename()).toBe('integrationstest.fcscenario.json');
    await page.reload();
    await page.getByRole('button', { name: 'Test öffnen: Abnahmetest gespeichert', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Abnahmetest gespeichert', exact: true })).toBeFocused();
    await preparationPage(page, 'Prüfen und starten');
    await button(page, 'Test starten').click();
    await button(page, 'Versandentwurf öffnen').click();
    const emitted = await page.evaluate(() => window.__integration.emitted);
    expect(emitted.request).toEqual(pack.cases[0].request);
    expect(emitted.id).toBe(pack.cases[0].id);
    const writes = await page.evaluate(() =>
      window.__integration.calls.filter((c) =>
        ['execute_send', 'execute_reply', 'execute_receipt'].includes(c.command),
      ),
    );
    expect(writes).toEqual([]);
  });
}
test('running steps precede management, use contextual guidance and keep actions and saved picker spaced', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await tools(page, true);
  const value = structuredClone(pack);
  value.cases = [value.cases[0]];
  await page.locator('#test-flow-file').setInputFiles({
    name: 'pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await button(page, 'Ablauf lokal speichern').click();
  await button(page, 'Durchlauf starten').click();
  await expect(page.getByText(/Öffnen Sie den Testfall als Versandentwurf/)).toBeVisible();
  await expect(page.getByText(/1 Testfall/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Einreichung senden: ${value.cases[0].name}`, exact: true }),
  ).toBeFocused();
  const load = await button(page, 'Lokale Ergebnisse laden').boundingBox();
  expect(load.y + load.height).toBeLessThan(800);
  const draft = await button(page, 'Testfall als Versandentwurf öffnen').boundingBox();
  expect(load.x - (draft.x + draft.width)).toBeGreaterThanOrEqual(8);
  await page.getByText('Ablauf verwalten oder anderen Ablauf öffnen', { exact: true }).click();
  const select = page.getByLabel('Gespeicherten Ablauf auswählen', { exact: true });
  const spacing = await select.evaluate((el) => ({
    gap: parseFloat(getComputedStyle(el.parentElement).rowGap),
    display: getComputedStyle(el.parentElement).display,
  }));
  expect(spacing).toEqual({ gap: 8, display: 'grid' });
});
test('single destination editing prepares a sparse patch without bulk toggles or unintended contact changes', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html');
  await button(page, 'Eigene Destinations laden').click();
  await button(page, 'Bearbeiten').first().click();
  await expect(page.getByRole('checkbox', { name: 'Name ändern', exact: true })).toHaveCount(0);
  await expect(button(page, 'Änderungsvorschau erstellen')).toBeDisabled();
  await page.getByLabel('Name', { exact: true }).fill('Nord geändert');
  await button(page, 'Änderungsvorschau erstellen').click();
  const preview = await page.evaluate(() => window.__destinationFixture.state.changes);
  expect(JSON.parse(preview[0].afterJson)).toEqual({ name: 'Nord geändert' });
  expect(await page.evaluate(() => window.__destinationFixture.writes)).toBe(0);
});
test('login action stays visible and usable in the minimum supported window', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 500 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await button(page, 'Verbindung herstellen').click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret');
  const login = button(page, 'Anmelden');
  const bounds = await login.boundingBox();
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(500);
  expect(
    await login.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  ).toBe(true);
  await login.click();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).not.toBeVisible();
});
test('schema exports precede deployment guidance and field groups remain compact', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto('http://127.0.0.1:1420/test-fixtures/channel-authoring.html');
  const exportAction = button(page, 'JSON-Schema herunterladen');
  const guidance = page.getByText('Antwortschema mit der Gegenstelle verwenden', { exact: true });
  expect((await exportAction.boundingBox()).y).toBeLessThan((await guidance.boundingBox()).y);
  expect((await page.locator('.schema-field').first().boundingBox()).height).toBeLessThan(260);
  await expect(page.locator('#channel-uri')).toBeVisible();
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('scanner daily action stays outside component management while offline operations remain reachable', async ({
  page,
}) => {
  await tools(page);
  await button(page, 'Virenscan').click();
  await page.evaluate(() =>
    Object.assign(window.__integration.local, {
      installed: true,
      ready: true,
      enabled: true,
      databaseVersion: 28100,
      databaseCreatedAt: 1793255040,
    }),
  );
  await page.getByLabel('Verfahren', { exact: true }).selectOption('local');
  await expect(page.getByText('Scanner bereit', { exact: true })).toBeVisible();
  await expect(button(page, 'Signaturen aktualisieren')).toBeVisible();
  await expect(button(page, 'Scanner online einrichten')).not.toBeVisible();
  await page.getByText('Komponente verwalten', { exact: true }).click();
  await expect(button(page, 'Lokales Scanner-Paket importieren')).toBeVisible();
  await expect(button(page, 'Signaturen aus Dateien importieren')).toBeVisible();
});
test('receive warnings do not repeat scanner guidance and file reply import stays contextual', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html');
  await button(page, 'Inhalte entschlüsseln und prüfen').click();
  await expect(page.getByText('Kein Malwarescanner eingerichtet.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.attachment-scan-result')).toContainText('Nicht auf Schadsoftware geprüft');
  await button(page, 'Antwort verfassen').click();
  await expect(page.locator('#reply-data-file')).not.toBeVisible();
  await page.getByText('Antwortinhalt aus Datei übernehmen', { exact: true }).click();
  await expect(page.locator('#reply-data-file')).toBeVisible();
});

test('editing a draft destination preserves its current lifecycle state until explicitly changed', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/destination-manager.html?draft=1');
  await button(page, 'Eigene Destinations laden').click();
  await button(page, 'Bearbeiten').first().click();
  await expect(page.locator('#manager-status')).toHaveValue('draft');
  await expect(button(page, 'Änderungsvorschau erstellen')).toBeDisabled();
  await page.getByLabel('Name', { exact: true }).fill('Entwurf neu');
  await button(page, 'Änderungsvorschau erstellen').click();
  const after = await page.evaluate(() => JSON.parse(window.__destinationFixture.state.changes[0].afterJson));
  expect(after).toEqual({ name: 'Entwurf neu' });
});
