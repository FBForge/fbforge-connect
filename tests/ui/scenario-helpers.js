import { expect } from './fixtures.js';
export const button = (page, name) => page.getByRole('button', { name, exact: true });
export async function openScenario(page, api = 'v3') {
  await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
  await button(page, 'Integration testen').click();
}
export async function importScenario(page, definition) {
  await page.locator('#scenario-import').setInputFiles({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(definition)),
  });
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue(definition.name);
}
export async function latestRun(page) {
  return page.evaluate(
    () =>
      window.__integration.calls.findLast(
        (c) => c.command === 'test_library' && c.args.request.action === 'scenario_run_save',
      ).args.request.document,
  );
}
export async function injectEvidence(page, step, data, replyId = null) {
  await page.evaluate(
    ({ step, data, replyId }) => {
      const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
      const reply = ['reply', 'check_reply'].includes(step.type),
        received = ['receive', 'compare', 'check_reply'].includes(step.type);
      Object.assign(window.__integration, {
        data,
        wrong: false,
        records: [
          {
            recordId: crypto.randomUUID(),
            revision: crypto.randomUUID(),
            kind: reply ? 'reply' : 'submission',
            direction: received ? 'received' : 'sent',
            status: received ? 'verified' : 'sent',
            createdAt: new Date().toISOString(),
            title: 'Fiktiver Testnachweis',
            caseId: id(23),
            submissionId: reply ? null : id(24),
            replyId: reply ? replyId : null,
            destinationId: id(25),
            totalBytes: 100,
            warnings: [],
            available: true,
          },
        ],
      });
    },
    { step, data, replyId },
  );
  await button(page, 'Nachweise aktualisieren').click();
}
export async function proveEvidence(page, step, data, replyId = null) {
  await injectEvidence(page, step, data, replyId);
  await expect(
    page.getByRole('combobox', { name: 'Nachricht für diesen Testschritt', exact: true }),
  ).not.toHaveValue('');
  await button(page, 'Ausgewählte Nachricht prüfen').click();
}
