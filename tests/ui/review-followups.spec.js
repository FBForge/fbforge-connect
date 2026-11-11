import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { openScenario, createScenario, button } from './scenario-helpers.js';
const root = 'http://127.0.0.1:1420';
const savedPreparation = (page) =>
  page.evaluate(
    () =>
      window.__integration.calls.findLast(
        (c) => c.command === 'test_library' && c.args.request.action === 'preparation_save',
      )?.args.request.document,
  );
test('integration preparation opens directly from Start without requiring a connection', async ({ page }) => {
  await page.goto(root + '/test-fixtures/profiles.html');
  await button(page, 'Integration testen').click();
  await expect(page.getByRole('heading', { name: 'Neuen Test vorbereiten', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Verbindung verwalten', exact: true })).toBeHidden();
  await createScenario(page);
  await expect(button(page, 'Test starten')).toBeDisabled();
  await expect(button(page, 'Test speichern')).toBeEnabled();
});
test('test editor can add a reply, edit its attachments and manage individual cases locally', async ({
  page,
}, testInfo) => {
  await openScenario(page);
  await createScenario(page);
  await page.getByRole('checkbox', { name: 'Fachliche Antwort erwarten', exact: true }).check();
  await page.getByRole('combobox', { name: 'Nachricht bearbeiten', exact: true }).selectOption('reply');
  await page.getByText('Anlagen bearbeiten (0)', { exact: true }).click();
  await page
    .locator('#scenario-add-files')
    .setInputFiles({ name: 'reply.txt', mimeType: 'text/plain', buffer: Buffer.from('expected response') });
  await expect(page.getByText('reply.txt', { exact: true })).toBeVisible();
  await button(page, 'Ersetzen: reply.txt').click();
  await page
    .locator('#scenario-replace-file')
    .setInputFiles({ name: 'changed.txt', mimeType: 'text/plain', buffer: Buffer.from('new response') });
  await expect(page.getByText('changed.txt', { exact: true })).toBeVisible();
  await button(page, 'Entfernen: changed.txt').click();
  await expect(page.getByText('changed.txt', { exact: true })).toHaveCount(0);
  await page.getByText('Testfall verwalten', { exact: true }).click();
  await button(page, 'Testfall duplizieren').click();
  await expect(
    page.getByRole('combobox', { name: 'Testfall bearbeiten', exact: true }).locator('option'),
  ).toHaveCount(2);
  await page.getByLabel('Testfallname', { exact: true }).fill('Zweiter Testfall');
  await button(page, 'Testfall entfernen').click();
  await expect(button(page, 'Testfall entfernen')).toBeDisabled();
  expect(
    await page.evaluate(() => window.__integration.calls.some((c) => c.command.startsWith('execute_'))),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
});
test('unfinished JSON is recovered after restart and still cannot start a test', async ({ page }) => {
  await openScenario(page);
  await createScenario(page);
  await page.getByLabel('Testname', { exact: true }).fill('Unfertiger Test');
  await page.getByLabel('Fachdaten', { exact: true }).fill('{"unfinished":');
  await expect
    .poll(async () => (await savedPreparation(page))?.definition.pack.cases[0].request.data)
    .toBe('{"unfinished":');
  await page.reload();
  await expect(button(page, 'Vorbereitung wiederherstellen')).toBeVisible();
  await button(page, 'Vorbereitung wiederherstellen').click();
  await expect(page.getByLabel('Testname', { exact: true })).toHaveValue('Unfertiger Test');
  await expect(page.getByLabel('Fachdaten', { exact: true })).toHaveValue('{"unfinished":');
  await button(page, 'Test starten').click();
  await expect(page.getByRole('alert').filter({ hasText: /JSON|ungültig|Fachdaten/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__integration.calls.some(
        (c) => c.command === 'test_library' && c.args.request.action === 'scenario_run_save',
      ),
    ),
  ).toBe(false);
});
test('session-only preparation removes its recovery snapshot and stays unpersisted', async ({ page }) => {
  await openScenario(page);
  await createScenario(page);
  await expect.poll(async () => Boolean(await savedPreparation(page))).toBe(true);
  await page
    .getByRole('checkbox', { name: 'Vorbereitung automatisch geschützt speichern', exact: true })
    .uncheck();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__integration.calls.some(
          (c) => c.command === 'test_library' && c.args.request.action === 'preparation_delete',
        ),
      ),
    )
    .toBe(true);
  await page.getByLabel('Testname', { exact: true }).fill('Nur Sitzung');
  await page.reload();
  await expect(button(page, 'Vorbereitung wiederherstellen')).toHaveCount(0);
});
for (const width of [1180, 420, 320])
  test(`field conditions and editing controls remain accessible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openScenario(page);
    await createScenario(page, 'reply');
    await page.addStyleTag({ content: 'body { font-family: "DejaVu Sans", sans-serif !important; }' });
    await page.getByText('Prüferwartungen anpassen', { exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Inhaltsvergleich', exact: true })
      .selectOption('field-exceptions');
    await expect(page.getByText(/Nur Werte mit erfüllten Feldbedingungen/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).include('.scenario-workspace').analyze();
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    if (width === 1180)
      await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
  });
test('additional CA preview requires explicit application and keeps private keys out of settings', async ({
  page,
}, testInfo) => {
  await page.goto(root + '/test-fixtures/lifecycle.html');
  await page.evaluate(() => {
    const base = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) =>
      command === 'inspect_network_certificate'
        ? {
            der: 'cHVibGljLWNh',
            subject: 'Fiktive Behörden-CA',
            fingerprint: 'A'.repeat(64),
            validFrom: 1577836800,
            validUntil: 2082758400,
            active: true,
          }
        : base(command, args);
  });
  await page.getByText('Zusätzliche CA-Zertifikate für Firmennetzwerke (0)', { exact: true }).click();
  await page.locator('#network-ca-file').setInputFiles({
    name: 'public-ca.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from('synthetic-public-ca'),
  });
  await expect(button(page, 'Zertifikat vormerken')).toBeVisible();
  await button(page, 'Zertifikat vormerken').click();
  expect(
    await page.evaluate(() => window.__lifecycle.calls.some((c) => c.command === 'save_network_settings')),
  ).toBe(false);
  await button(page, 'Netzwerkeinstellungen übernehmen').click();
  await button(page, 'Übernehmen und trennen').click();
  const saved = await page.evaluate(
    () => window.__lifecycle.calls.findLast((c) => c.command === 'save_network_settings').args.settings,
  );
  expect(saved.trustedCertificates).toEqual(['cHVibGljLWNh']);
  expect(saved.password).toBeNull();
  await expect(button(page, 'Entfernen vormerken: Fiktive Behörden-CA')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('network.png'), fullPage: true });
});

test('closing waits for an attachment import and then flushes the newest protected preparation', async ({
  page,
}) => {
  await page.goto(root + '/test-fixtures/lifecycle.html?preparation=1');
  await createScenario(page);
  await page.getByText('Anlagen bearbeiten (1)', { exact: true }).click();
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => {
        window.__finishFileRead = resolve;
      });
      return read.call(this);
    };
  });
  await page
    .locator('#scenario-add-files')
    .setInputFiles({ name: 'late.txt', mimeType: 'text/plain', buffer: Buffer.from('late content') });
  await button(page, 'Fenster schließen').click();
  await button(page, 'Anwendung beenden').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Anlagen werden noch eingelesen' })).toBeVisible();
  await expect(button(page, 'Ohne Vorbereitungssicherung beenden')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__lifecycle.calls.some((c) => c.command === 'close_application')),
  ).toBe(false);
  await button(page, 'Zurück zur Anwendung').click();
  await page.evaluate(() => window.__finishFileRead());
  await expect(page.getByText('late.txt', { exact: true })).toBeVisible();
  await button(page, 'Fenster schließen').click();
  await button(page, 'Anwendung beenden').click();
  const calls = await page.evaluate(() => window.__lifecycle.calls);
  const closing = calls.findIndex((c) => c.command === 'close_application');
  expect(closing).toBeGreaterThan(-1);
  const saved = calls
    .slice(0, closing)
    .findLast((c) => c.command === 'test_library' && c.args.request.action === 'preparation_save');
  expect(
    saved.args.request.document.definition.pack.cases[0].request.attachments.some(
      (a) => a.fileName === 'late.txt',
    ),
  ).toBe(true);
});

test('an unreadable previous recovery is preserved until explicit discard', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('fixture-protected-preparations', JSON.stringify([['TEST', { format: 'invalid' }]])),
  );
  await openScenario(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Sie wird nicht überschrieben' })).toBeVisible();
  await createScenario(page);
  await page.getByLabel('Testname', { exact: true }).fill('Neue Vorbereitung');
  await button(page, 'Test speichern').click();
  expect(
    await page.evaluate(() =>
      window.__integration.calls.some(
        (c) =>
          c.command === 'test_library' &&
          ['preparation_save', 'preparation_delete'].includes(c.args.request.action),
      ),
    ),
  ).toBe(false);
  await button(page, 'Gesicherte Vorbereitung verwerfen').click();
  const dialog = page.getByRole('dialog', { name: 'Gesicherte Vorbereitung verwerfen?', exact: true });
  await dialog.getByRole('button', { name: 'Vorbereitung verwerfen', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__integration.calls.some(
          (c) => c.command === 'test_library' && c.args.request.action === 'preparation_delete',
        ),
      ),
    )
    .toBe(true);
});

test('check and continue accepts one matching proof but asks explicitly when several match', async ({
  page,
}) => {
  await openScenario(page);
  await createScenario(page);
  await page.getByText('Anlagen bearbeiten (1)', { exact: true }).click();
  await page.getByRole('button', { name: /^Entfernen:/ }).click();
  await button(page, 'Test starten').click();
  await page.evaluate(() => {
    const id = crypto.randomUUID();
    window.__integration.records = [
      {
        recordId: id,
        revision: crypto.randomUUID(),
        kind: 'submission',
        direction: 'sent',
        status: 'sent',
        createdAt: new Date().toISOString(),
        title: 'Passender Nachweis',
        caseId: crypto.randomUUID(),
        submissionId: crypto.randomUUID(),
        replyId: null,
        destinationId: crypto.randomUUID(),
        totalBytes: 100,
        warnings: [],
        available: true,
      },
    ];
    window.__integration.records.push({ ...window.__integration.records[0], recordId: crypto.randomUUID() });
  });
  await button(page, 'Prüfen und weiter').click();
  await expect(page.getByRole('status').filter({ hasText: 'Mehrere passende Nachrichten' })).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Nachricht für diesen Testschritt', exact: true });
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(button(page, 'Ausgewählte Nachricht prüfen')).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        window.__integration.calls.findLast(
          (c) => c.command === 'test_library' && c.args.request.action === 'scenario_run_save',
        ).args.request.document.cursor,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    window.__integration.records = window.__integration.records.slice(0, 1);
    window.__integration.data = window.__integration.calls.findLast(
      (c) => c.command === 'test_library' && c.args.request.action === 'scenario_run_save',
    ).args.request.document.pack.cases[0].request.data;
  });
  await button(page, 'Prüfen und weiter').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__integration.calls.findLast(
            (c) => c.command === 'test_library' && c.args.request.action === 'scenario_run_save',
          ).args.request.document.cursor,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => window.__integration.calls.some((c) => c.command.startsWith('execute_'))),
  ).toBe(false);
});

test('Send uses the same protected test collection and keeps its first destination field near the top', async ({
  page,
}, testInfo) => {
  await page.goto(root + '/test-fixtures/profiles.html');
  await button(page, 'Testwerkzeuge').click();
  await createScenario(page);
  await page.getByLabel('Testname', { exact: true }).fill('Gemeinsamer Integrationstest');
  await button(page, 'Test speichern').click();
  await page.locator('.connection-button').click();
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await button(page, 'Anmelden').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await button(page, 'Senden').click();
  await expect(page.locator('#send-target')).toBeVisible();
  expect((await page.locator('#send-target').boundingBox()).y).toBeLessThan(650);
  await expect(page.locator('#send-library-choice')).not.toBeVisible();
  await page.getByText('Gespeicherten Test verwenden', { exact: true }).click();
  await expect(page.locator('#send-library-choice')).toContainText('Gemeinsamer Integrationstest');
  await page.screenshot({ path: testInfo.outputPath('sender.png') });
});
