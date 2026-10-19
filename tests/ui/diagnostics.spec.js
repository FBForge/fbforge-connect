import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('diagnostics show clear context and outcomes with technical codes on demand', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html');
  await page.evaluate(async () => {
    const { diagnosticLog } = await import('/src/native.js');
    diagnosticLog.clear();
    const base = {
      time: new Date().toISOString(),
      result: 'returned',
      state: null,
      code: null,
      durationMs: 7,
    };
    diagnosticLog.record({ ...base, command: 'profile_status', apiVersion: null });
    diagnosticLog.record({ ...base, command: 'reply_receipt_state', apiVersion: 'v3', state: 'idle' });
    diagnosticLog.record({ ...base, command: 'verify_reply', apiVersion: 'v3', code: 'schema_unavailable' });
  });
  await page.getByRole('button', { name: 'Diagnose', exact: true }).click();
  const trace = page.getByRole('region', { name: 'Technische Aufrufe', exact: true });
  const local = trace.getByRole('row').filter({ hasText: 'Speicherstatus prüfen' });
  await expect(local.locator('[data-label="Kontext"]')).toHaveText('Lokal');
  await expect(local.locator('[data-label="Ergebnis"]')).toHaveText('Erfolgreich');
  await expect(trace).toContainText('Keine Aktion offen');
  await expect(trace).not.toContainText('Antwort erhalten');
  await expect(trace).not.toContainText('· —');
  const failed = trace.getByRole('row').filter({ hasText: 'Antwort entschlüsseln und prüfen' });
  await expect(failed.locator('[data-label="Kontext"]')).toHaveText('API v3');
  await expect(failed).toContainText('Schema nicht verfügbar');
  await expect(failed.locator('code')).toBeHidden();
  await failed.getByText('Fehlercode anzeigen', { exact: true }).click();
  await expect(failed.locator('code')).toHaveText('schema_unavailable');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('diagnostics.png'), fullPage: true });
  await page.setViewportSize({ width: 420, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
