import { test, expect } from '@playwright/test';
import pack from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
for (const api of ['v2', 'v3']) {
  test(`test flows save, reopen and delete with explicit consent independently of a run (${api})`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
    await button(page, 'Testfälle und Abläufe').click();
    await button(page, 'Testabläufe').click();
    await expect(button(page, 'Ablauf lokal speichern')).toBeDisabled();
    await page.locator('#test-flow-file').setInputFiles({
      name: 'pack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pack)),
    });
    await button(page, 'Ablauf lokal speichern').click();
    await expect(page.getByText(/wurde dauerhaft für Ihr Windows-Benutzerkonto gespeichert/)).toBeVisible();
    expect(await page.evaluate(() => Object.keys(window.__integration.savedFlows).length)).toBe(1);
    await button(page, 'Durchlauf starten').click();
    await button(page, 'Gespeicherten Ablauf öffnen').click();
    await expect(button(page, 'Durchlauf starten')).toBeVisible();
    await button(page, 'Gespeicherten Ablauf löschen').click();
    const dialog = page.getByRole('dialog', { name: 'Gespeicherten Ablauf löschen?' });
    await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => Object.keys(window.__integration.savedFlows).length)).toBe(1);
    await button(page, 'Gespeicherten Ablauf löschen').click();
    await dialog.getByRole('button', { name: 'Ablauf löschen', exact: true }).click();
    await expect(page.getByText(/Gespeicherter Ablauf gelöscht/)).toBeVisible();
    expect(await page.evaluate(() => Object.keys(window.__integration.savedFlows).length)).toBe(0);
    await expect(button(page, 'Durchlauf starten')).toBeVisible();
    const actions = await page.evaluate(() =>
      window.__integration.calls.map(({ command, args }) =>
        command === 'test_library' ? args.request.action : command,
      ),
    );
    expect(actions).not.toContain('execute_send');
    expect(actions).not.toContain('execute_receipt');
  });
}
