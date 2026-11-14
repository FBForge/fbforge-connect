import { preparationPage, testOptions, testReuse } from '../../scripts/scenario-navigation.mjs';
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { withReplies } from '../helpers/scenarios.js';
import { scenarioSteps } from '../../frontend/src/integration/scenarios/model.ts';
import { expectedMessage, replyKey } from '../../frontend/src/integration/scenarios/messages.ts';
import {
  button,
  openScenario,
  importScenario,
  latestRun,
  reopenRun,
  createScenario,
  injectEvidence,
  proveEvidence,
} from './scenario-helpers.js';
import { readFile } from 'node:fs/promises';

test('response editing synchronizes process offers, reorders messages and removes dependent fields', async ({
  page,
}) => {
  await openScenario(page);
  await createScenario(page, 'reply');
  await testOptions(page, 'responses');
  await button(page, 'Weitere Antwort hinzufügen').click();
  await button(page, 'Weitere Antwort hinzufügen').click();
  const replies = page.locator('.scenario-response-list > li');
  await replies.nth(0).getByLabel('Bezeichnung der Antwort').fill('Unterlagen nachfordern');
  await replies.nth(1).getByLabel('Bezeichnung der Antwort').fill('Vorgang abschließen');
  await preparationPage(page, 'Testdaten');
  const select = page.getByRole('combobox', { name: 'Nachricht bearbeiten', exact: true });
  await select.selectOption({ label: 'Unterlagen nachfordern' });
  const selected = await select.inputValue();
  await expect(page.getByRole('combobox', { name: 'Nachrichtenformat', exact: true })).toBeDisabled();
  await page
    .getByLabel('Fachdaten', { exact: true })
    .fill('{"status":"unterlagen_erforderlich","nachricht":"Fiktive Nachforderung"}');
  await testOptions(page, 'addressing');
  await page.getByRole('checkbox', { name: 'Antwort als Prozessnachricht (API v3)', exact: true }).check();
  await page.getByLabel('Prozessmodell der Antwort', { exact: true }).fill('urn:test:process');
  await page.getByLabel('Nachrichtenkennung der Antwort', { exact: true }).fill('nachforderung');
  await testOptions(page, 'variables');
  await page
    .getByRole('combobox', { name: 'Nachricht für variable Angaben', exact: true })
    .selectOption(selected);
  await page
    .getByRole('combobox', { name: 'Feld für variable Angabe', exact: true })
    .selectOption('/nachricht');
  await button(page, 'Variable Angabe hinzufügen').click();
  await testOptions(page, 'expectations');
  await page.getByRole('combobox', { name: 'Nachricht für Erwartung', exact: true }).selectOption(selected);
  await page.getByRole('combobox', { name: 'Feld für Erwartung', exact: true }).selectOption('/status');
  await button(page, 'Erwartung hinzufügen').click();
  await testReuse(page);
  await button(page, 'Test speichern').click();
  let saved = await page.evaluate(
    () =>
      window.__integration.calls.findLast(
        (c) => c.command === 'test_library' && c.args.request.action === 'scenario_save',
      ).args.request.document,
  );
  expect(saved.followups).toHaveLength(2);
  expect(saved.pack.cases[0].request.replyOffer.processMessages).toEqual([
    { processModelId: 'urn:test:process', messageId: 'nachforderung' },
  ]);
  await testOptions(page, 'responses');
  await button(replies.nth(0), 'Nach unten').click();
  await expect(replies.nth(0).getByLabel('Bezeichnung der Antwort')).toHaveValue('Vorgang abschließen');
  await button(replies.nth(1), 'Antwort entfernen').click();
  await preparationPage(page, 'Testdaten');
  await expect(select).toHaveValue('request');
  await testReuse(page);
  await button(page, 'Test speichern').click();
  saved = await page.evaluate(
    () =>
      window.__integration.calls.findLast(
        (c) => c.command === 'test_library' && c.args.request.action === 'scenario_save',
      ).args.request.document,
  );
  expect(saved.followups).toHaveLength(1);
  expect(saved.variables).toEqual([]);
  expect(saved.rules).toEqual([]);
  expect(saved.pack.cases[0].request.replyOffer.processMessages).toEqual([]);
});
for (const api of ['v2', 'v3'])
  test(`distinct business replies remain in one case after acceptance (${api})`, async ({ page }) => {
    const s = withReplies();
    s.pack.cases[0].receipt = 'accept';
    s.pack.cases[0].request.attachments = [];
    await openScenario(page, api);
    await page.evaluate(() => {
      const base = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command !== 'list_case_event_log') return base(command, args);
        return {
          apiVersion: args.apiVersion,
          sessionId: args.sessionId,
          environment: 'TEST',
          data: {
            logId: args.logId,
            offset: 0,
            total: 1,
            events: [
              {
                eventId: crypto.randomUUID(),
                eventType: 'https://schema.fitko.de/fit-connect/events/accept-submission',
                issuer: 'urn:synthetic-recipient',
                issuedAt: new Date().toISOString(),
                headerBytes: 10,
                claimsBytes: 20,
                subjectType: 'submission',
                subjectId: window.__integration.records[0].submissionId,
              },
            ],
          },
        };
      };
    });
    await importScenario(page, s);
    await preparationPage(page, 'Prüfen und starten');
    await button(page, 'Test starten').click();
    const run = await latestRun(page),
      ids = new Map();
    for (const step of scenarioSteps(run.definition)) {
      if (step.type === 'receipt') {
        await button(page, 'Prüfen und weiter').click();
        continue;
      }
      const message = expectedMessage(run, step),
        isReply = ['reply', 'check_reply'].includes(step.type);
      if (isReply && !ids.has(replyKey(step))) ids.set(replyKey(step), crypto.randomUUID());
      if (step.type === 'check_reply' && step.followupId) {
        await injectEvidence(page, step, message.data, ids.values().next().value);
        await expect(button(page, 'Ausgewählte Nachricht prüfen')).toBeDisabled();
      }
      await proveEvidence(page, step, message.data, isReply ? ids.get(replyKey(step)) : null);
    }
    await expect(
      page.getByRole('heading', { name: 'Ergebnisse dieses Durchlaufs', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.scenario-check.passed')).toHaveCount(10);
    const saved = await latestRun(page);
    expect(saved.replyBindings).toHaveLength(3);
    expect(new Set(saved.replyBindings.map((b) => b.replyId)).size).toBe(3);
    expect(new Set(saved.bindings.map((b) => b.caseId)).size).toBe(1);
    await expect(button(page, 'Testergebnis fürs Ticket kopieren')).toBeVisible();
    expect(await page.locator('.scenario-section > .copy-value code').count()).toBe(0);
    await reopenRun(page, saved.id);
    await button(page, 'Ergebnisse').click();
    await expect(page.locator('.scenario-check.passed')).toHaveCount(10);
  });
test('failed content comparisons survive reopening and exports require opt-in for values', async ({
  page,
}) => {
  const s = withReplies(0);
  s.pack.cases[0].receipt = 'none';
  s.pack.cases[0].request.attachments = [];
  await openScenario(page);
  await importScenario(page, s);
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  const run = await latestRun(page),
    step = scenarioSteps(run.definition)[0];
  await proveEvidence(
    page,
    step,
    '{"antragstellendePerson":{"vorname":"PRIVATE_TEST_VALUE","nachname":"Musterfrau"},"anliegen":"Fiktiver Integrationstest"}',
  );
  await button(page, 'Ergebnisse').click();
  await expect(page.locator('.scenario-check.failed')).toContainText('/antragstellendePerson/vorname');
  await expect(page.locator('.scenario-check.failed')).toContainText('PRIVATE_TEST_VALUE');
  for (const values of [false, true]) {
    await page
      .getByRole('checkbox', { name: 'Feldwerte in den Ergebnisexport aufnehmen', exact: true })
      .setChecked(values);
    const download = page.waitForEvent('download');
    await button(page, 'Prüfergebnis exportieren').click();
    const file = await download,
      json = await readFile(await file.path(), 'utf8');
    expect(json.includes('PRIVATE_TEST_VALUE')).toBe(values);
  }
  await button(page, 'Vorbereiten').click();
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  await button(page, 'Ergebnisse').click();
  await expect(
    page.getByRole('checkbox', { name: 'Feldwerte in den Ergebnisexport aufnehmen', exact: true }),
  ).not.toBeChecked();
  await reopenRun(page, run.id);
  await button(page, 'Ergebnisse').click();
  await expect(page.locator('.scenario-check.failed')).toContainText('PRIVATE_TEST_VALUE');
  const audit = await new AxeBuilder({ page }).include('.scenario-workspace').analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
});
test('a successful retry keeps the earlier concrete mismatch accessible after reopening', async ({
  page,
}) => {
  const s = withReplies(0);
  s.pack.cases[0].receipt = 'none';
  s.pack.cases[0].request.attachments = [];
  await openScenario(page);
  await importScenario(page, s);
  await preparationPage(page, 'Prüfen und starten');
  await button(page, 'Test starten').click();
  const run = await latestRun(page),
    step = scenarioSteps(run.definition)[0];
  await proveEvidence(page, step, '{}');
  await proveEvidence(page, step, run.pack.cases[0].request.data);
  await button(page, 'Ergebnisse').click();
  await expect(page.locator('.scenario-check.passed')).toHaveCount(1);
  for (const reopen of [false, true]) {
    if (reopen) {
      await reopenRun(page, run.id);
      await button(page, 'Ergebnisse').click();
    }
    await page.getByText('Alle Prüfversuche (2)', { exact: true }).click();
    const attempt = page.locator('.scenario-attempt-history').first();
    await attempt.locator('summary').click();
    await expect(attempt).toContainText('/antragstellendePerson/vorname');
    await expect(attempt).toContainText('Fehlt');
  }
});
test('multiple reply editors reflow without clipped controls in both themes', async ({ page }) => {
  await openScenario(page);
  await createScenario(page, 'process');
  await preparationPage(page, 'Testdaten');
  await page
    .getByRole('combobox', { name: 'Nachricht bearbeiten', exact: true })
    .selectOption({ label: 'Unterlagen nachfordern' });
  for (const width of [1280, 640, 420]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page })
        .include('.scenario-preparation')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
    }
  }
});
