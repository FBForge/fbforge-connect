import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
async function open(page, keys = 1) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await page.evaluate((keyCount) => {
    const original = window.__TAURI_INTERNALS__.invoke;
    const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const state = (window.__guidedFixture = {
      keys: keyCount,
      writes: 0,
      drafts: [],
      commands: [],
      uncertain: false,
      receipt: {
        attemptId: null,
        status: 'idle',
        action: null,
        destinationId: null,
        submissionId: null,
        caseId: null,
        signingKid: null,
        error: null,
      },
    });
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      state.commands.push(command);
      const envelope = (data) => ({
        apiVersion: args.apiVersion,
        sessionId: args.sessionId,
        environment: 'TEST',
        data,
      });
      if (command === 'receipt_state') return envelope({ ...state.receipt });
      if (command === 'loaded_keys')
        return envelope({
          keys: Array.from({ length: state.keys }, (_, i) => ({
            destinationId: uuid(2),
            kid: `test-sign-${i}`,
            purpose: 'sign',
          })),
        });
      if (command === 'prepare_receipt') {
        const draft = JSON.parse(args.receiptDocument);
        state.drafts.push(draft);
        if (state.delay) await new Promise((resolve) => (state.release = resolve));
        state.receipt = {
          attemptId: uuid(30 + state.drafts.length),
          status: 'prepared',
          action: draft.action,
          destinationId: draft.destinationId,
          submissionId: draft.submissionId,
          caseId: draft.caseId,
          signingKid: draft.signingKid,
          error: null,
        };
        return envelope({
          attempt: { ...state.receipt },
          reason: draft.reason,
          description: draft.description,
          attachmentId: draft.attachmentId,
          warnings: draft.action === 'accept' ? ['MALWARE_SCAN_NOT_CONFIGURED'] : [],
        });
      }
      if (command === 'cancel_receipt') {
        state.receipt.status = 'cancelled';
        return envelope({ ...state.receipt });
      }
      if (command === 'execute_receipt') {
        state.writes++;
        state.receipt.status = state.uncertain ? 'uncertain' : 'confirmed';
        state.receipt.error = state.uncertain ? 'resource_unavailable' : null;
        return envelope({ ...state.receipt });
      }
      return original(command, args);
    };
  }, keys);
  await page.locator('#pickup-submission').fill(id(3));
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
}
test('accept prepares the current verified message once, cancel sends nothing and confirm writes once', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Einreichungen suchen', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Einreichung in TEST annehmen?', exact: true });
  await expect(confirmation).toBeVisible();
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(0);
  expect(await page.evaluate(() => window.__guidedFixture.drafts[0].proofId)).toBe(id(9));
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(0);
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Jetzt annehmen', exact: true }).click();
  await expect(page.getByText('Annahme von TEST bestätigt', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(1);
  await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toHaveCount(0);
});
test('reject requires a reason and multiple keys require an explicit key selection', async ({ page }) => {
  await open(page, 2);
  await page.getByRole('button', { name: 'Ablehnen', exact: true }).click();
  await expect(page.locator('#receipt-reason')).toBeFocused();
  await expect(page.locator('#receipt-reason')).toHaveValue('');
  await page.getByRole('button', { name: 'Ablehnung prüfen', exact: true }).click();
  expect(await page.evaluate(() => window.__guidedFixture.drafts.length)).toBe(0);
  await page.locator('#receipt-reason').selectOption('technical-error');
  await page.getByRole('button', { name: 'Ablehnung prüfen', exact: true }).click();
  await expect(page.locator('#receipt-key')).toBeVisible();
  expect(await page.evaluate(() => window.__guidedFixture.drafts.length)).toBe(0);
  await page.locator('#receipt-key').selectOption('test-sign-1');
  await page.getByRole('button', { name: 'Ablehnung prüfen', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Einreichung in TEST ablehnen?', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__guidedFixture.drafts[0].proofId)).toBeNull();
  expect(await page.evaluate(() => window.__guidedFixture.drafts[0].signingKid)).toBe('test-sign-1');
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(0);
});
test('a lost receipt acknowledgement keeps the direct accept action locked', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__guidedFixture.uncertain = true));
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await page.getByRole('button', { name: 'Jetzt annehmen', exact: true }).click();
  await expect(page.getByText('Ausgang ungewiss – nicht erneut senden', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => window.__guidedFixture.drafts.length);
  await page.getByRole('button', { name: 'Inhalte entschlüsseln und prüfen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(1);
  expect(await page.evaluate(() => window.__guidedFixture.drafts.length)).toBe(before);
});
test('reply preparation loads the schema only with consent, snapshots the exact text and never sends automatically', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
  await expect(page.locator('#reply-data')).toBeFocused();
  const content = '{\n "status":"erhalten"\n}';
  await page.locator('#reply-data').fill(content);
  await page.getByRole('button', { name: 'Antwort prüfen und vorbereiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__applicationFixture.calls.includes('load_reply_schema'))).toBe(
    false,
  );
  await page.getByRole('button', { name: 'Für diese Verbindung erlauben', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Antwort an TEST senden?', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => window.__applicationFixture.calls.filter((c) => c === 'load_reply_schema').length,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#reply-data')).toHaveValue(content);
});
test('back and receipt actions protect unsent reply content, and returning restores the inbox focus', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
  await page.locator('#reply-data').fill('{"status":"noch zu prüfen"}');
  await page.getByRole('button', { name: 'Zurück zum Eingang', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Antwortentwurf verwerfen?', exact: true });
  await expect(discard).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reply-data')).toHaveValue('{"status":"noch zu prüfen"}');
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(discard).toBeVisible();
  expect(await page.evaluate(() => window.__guidedFixture.drafts.length)).toBe(0);
  await discard.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Eingang', exact: true }).click();
  await discard.getByRole('button', { name: 'Entwurf verwerfen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }),
  ).toBeFocused();
  await expect(page.locator('#pickup-submission')).toHaveValue(id(3));
  expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
});
test('guided reading and rejection remain accessible at narrow widths and in dark mode', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Ablehnen', exact: true }).click();
  await page.setViewportSize({ width: 640, height: 540 });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('a key change retires a late receipt preparation without exposing a stale confirmation', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => (window.__guidedFixture.delay = true));
  await page.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__guidedFixture.release))).toBe(true);
  await page.evaluate(() => {
    window.__applicationFixture.invalidate();
    window.__guidedFixture.release();
  });
  await expect
    .poll(() => page.evaluate(() => window.__guidedFixture.commands.includes('cancel_receipt')))
    .toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__guidedFixture.writes)).toBe(0);
});

test('a changed proof during combined schema loading cannot prepare or send the old reply', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
  await page.evaluate(() => (window.__applicationFixture.delaySchema = true));
  await page.getByRole('button', { name: 'Antwort prüfen und vorbereiten', exact: true }).click();
  await page.getByRole('button', { name: 'Für diese Verbindung erlauben', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__applicationFixture.releaseSchema))).toBe(true);
  await page.evaluate(() => {
    window.__applicationFixture.invalidate();
    window.__applicationFixture.releaseSchema();
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__applicationFixture.calls.includes('prepare_reply'))).toBe(false);
  expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
});

test('changing API or reconnecting preserves an unsent reply until explicit discard', async ({ page }) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?app=1');
  await page.getByRole('button', { name: 'Onlinedienst testen', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('button', { name: 'Bei TEST anmelden', exact: true }).click();
  await expect(page.locator('#destination-id')).toBeEnabled();
  await page.locator('#destination-id').fill(id(2));
  await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
  await page.locator('#pickup-submission').fill(id(3));
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
  const draft = '{"status":"erhalten","hinweis":"Entwurf beibehalten"}';
  await page.locator('#reply-data').fill(draft);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await page.locator('#session-api').selectOption('v2');
  const discard = page.getByRole('dialog', { name: 'Antwortentwurf verwerfen?', exact: true });
  await expect(discard).toBeVisible();
  await expect(page.locator('#session-api')).toHaveValue('v3');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Empfangen', exact: true }).click();
  await expect(page.locator('#reply-data')).toHaveValue(draft);
  await page.getByRole('button', { name: 'Verbunden', exact: true }).click();
  await page.locator('#client-id').fill('synthetic-replacement');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await page.getByRole('button', { name: 'Mit anderen Zugangsdaten anmelden', exact: true }).click();
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  expect(
    await page.evaluate(() => window.__applicationFixture.calls.filter((v) => v === 'open_session').length),
  ).toBe(1);
  await page.getByRole('button', { name: 'Verbindungsdialog schließen', exact: true }).click();
  await expect(page.locator('#reply-data')).toHaveValue(draft);
  await page.locator('#session-api').selectOption('v2');
  await discard.getByRole('button', { name: 'Entwurf verwerfen', exact: true }).click();
  await expect(page.locator('#session-api')).toHaveValue('v2');
  await expect(page.locator('#reply-data')).toHaveCount(0);
  expect(await page.evaluate(() => window.__applicationFixture.replyWrites)).toBe(0);
});
