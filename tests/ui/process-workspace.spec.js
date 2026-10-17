import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dropFiles } from './drop-files.js';

test('process-workspace with synthetic native fixtures', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420/test-fixtures/process-workspace.html');
  const source = await readFile(
    new URL('../../frontend/src/examples/test-process.bpmn', import.meta.url),
    'utf8',
  );
  await dropFiles(page, page.locator('#bpmn-file').locator('..'), [
    { name: 'test-process.bpmn', type: 'application/xml', content: source },
  ]);
  await page.getByRole('heading', { name: 'Fiktiver TEST-Antragsprozess', exact: true }).waitFor();
  await page.locator('.bpmn-diagram .djs-container > svg').waitFor();
  await page.locator('.bjs-powered-by').waitFor();
  assert.equal(await page.locator('.bpmn-message-list button').count(), 4);
  const request = page.locator('.bpmn-message-list button').filter({ hasText: 'Nachforderung' });
  await request.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('heading', { name: 'Ausgewählte Nachricht: 2 · Nachforderung', exact: true })
    .waitFor();
  assert.equal(await page.locator('#bpmn-message-id').inputValue(), 'request-more');
  await page.getByRole('button', { name: 'Passende Prozess-Zustellpunkte suchen', exact: true }).click();
  await page.getByRole('heading', { name: 'Passende TEST-Zustellpunkte (1)', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__processFixture.searches), 1);
  await page.getByRole('button', { name: 'Als Prozess-Einreichung vorbereiten', exact: true }).click();
  const draft = await page.evaluate(() => window.__processFixture.draft);
  assert.equal(draft.messageId, 'request-more');
  assert.equal(draft.schemaUri, 'urn:fit-connect:test-client:demo:reply:1');
  assert.ok(draft.sha256);
  assert.deepEqual(await page.evaluate(() => window.__processFixture.calls), ['search_process_destinations']);
  await page.locator('#bpmn-message-id').fill('changed');
  assert.ok(
    await page
      .getByRole('button', { name: 'Passende Prozess-Zustellpunkte suchen', exact: true })
      .isDisabled(),
  );
  await page.locator('#bpmn-message-id').fill('request-more');
  await page.evaluate(() =>
    window.__processFixture.showContext({
      processModelId: 'urn:fit-connect:test-client:demo:process:1',
      messageId: 'supplement',
    }),
  );
  await page.getByRole('heading', { name: 'Ausgewählte Nachricht: 3 · Nachreichung', exact: true }).waitFor();
  assert.ok(await page.locator('.bpmn-message-received').count());
  await page
    .locator('.djs-element[data-element-id="ApplicationFlow"] .djs-hit')
    .first()
    .click({ force: true });
  await page.getByRole('heading', { name: 'Ausgewählte Nachricht: 1 · Antrag', exact: true }).waitFor();
  await page.getByText('Modellidentität und Zuordnung', { exact: true }).click();
  await dropFiles(page, page.locator('#bpmn-mapping-file').locator('..'), [
    {
      name: 'wrong.json',
      type: 'application/json',
      content: JSON.stringify({
        format: 'fit-connect-bpmn-mapping',
        version: 1,
        sha256: '0'.repeat(64),
        entries: [],
      }),
    },
  ]);
  await page.getByRole('alert').filter({ hasText: 'SHA-256' }).waitFor();
  await page.setViewportSize({ width: 480, height: 800 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'narrow layout must not overflow',
  );
  await page.getByText('Anderes BPMN-Modell öffnen', { exact: true }).click();
  await dropFiles(page, page.locator('#bpmn-file').locator('..'), [
    {
      name: 'unsafe.bpmn',
      type: 'application/xml',
      content: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>',
    },
  ]);
  await page.getByRole('alert').filter({ hasText: 'DTD' }).waitFor();
  assert.equal(await page.locator('.bpmn-message-list button').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'BPMN UI passed: real diagram/watermark, keyboard message selection, exact lookup/no send, explicit draft, diagram click, received-message highlight, checksum mismatch and unsafe model rejection, narrow layout.',
  );
});
