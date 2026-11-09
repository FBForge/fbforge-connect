import { test, expect } from './fixtures.js';
import pack from '../../frontend/src/examples/integration.fctest.json' with { type: 'json' };
import { openStoredTest, testOverview, checkTestStep } from '../../scripts/live-ui/test-workspace.mjs';
import { button, openScenario, importScenario, injectEvidence } from './scenario-helpers.js';
import { scenarioFrom, scenarioSteps } from '../../frontend/src/integration/scenarios/model.ts';

test('the native acceptance driver opens original and current tests through the real application overview', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/profiles.html?destinations=1');
  await page.evaluate(
    (pack) =>
      window.__TAURI_INTERNALS__.invoke('test_library', {
        request: {
          action: 'save',
          id: crypto.randomUUID(),
          pack,
        },
      }),
    pack,
  );
  await openStoredTest(page, 'pack', pack.name);
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue(pack.name);
  await button(page, 'Test speichern').click();
  await expect(
    page.getByText('Test dauerhaft für Ihr Windows-Benutzerkonto gespeichert.', { exact: true }),
  ).toBeVisible();
  await openStoredTest(page, 'test', pack.name);
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue(pack.name);
  await testOverview(page);
  await expect(page.locator('[data-test-entry-id]')).toHaveCount(2);
});

test('the native acceptance driver advances proven contents and refuses ambiguous evidence', async ({
  page,
}) => {
  const value = structuredClone(pack);
  value.cases = [value.cases[0]];
  value.cases[0].request.attachments = [];
  value.cases[0].request.replyOffer = null;
  value.cases[0].reply = null;
  value.cases[0].receipt = 'none';
  const definition = scenarioFrom(value);
  await openScenario(page);
  await importScenario(page, definition);
  await button(page, 'Test starten').click();
  await injectEvidence(page, scenarioSteps(definition)[0], value.cases[0].request.data);
  await checkTestStep(page);
  await expect(page.getByRole('heading', { name: 'Eingang öffnen', exact: true })).toBeVisible();
  await injectEvidence(page, scenarioSteps(definition)[1], value.cases[0].request.data);
  await page.evaluate(() => {
    const first = window.__integration.records[0];
    window.__integration.records = [first, { ...first, recordId: crypto.randomUUID() }];
  });
  await expect(checkTestStep(page)).rejects.toThrow('live_ui_flow_evidence_ambiguous');
  await expect(page.getByRole('heading', { name: 'Eingang öffnen', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__integration.calls.filter((call) =>
        ['execute_send', 'execute_receipt', 'execute_reply'].includes(call.command),
      ),
    ),
  ).toEqual([]);
});
