import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { xmlPacket } from '../frontend/test-fixtures/xml-message-schema.js';

const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error('Aufruf: node scripts/capture-help.mjs <neues-Verzeichnis>');
const directory = resolve(output);
await mkdir(directory);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? ['--no-sandbox'] : [],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: 'de-DE',
  reducedMotion: 'reduce',
});
page.setDefaultTimeout(10000);
const button = (name) => page.getByRole('button', { name, exact: true });
const open = (file = '') => page.goto(`http://127.0.0.1:1420/${file}`);
const capture = async (name, anchor) => {
  if (anchor) await anchor.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/${name}.png` });
};
try {
  // Only the native boundary is synthetic. The application and components are unchanged.
  await open('test-fixtures/profiles.html?destinations=1');
  await expect(button('Verbindung herstellen')).toBeVisible();
  await capture('overview');
  await button('Verbindung herstellen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#client-id')).toHaveValue('');
  await expect(page.locator('#client-secret')).toHaveValue('');
  await capture('profiles');
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await button('Bei TEST anmelden').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await button('Senden').click();
  await expect(page.getByRole('combobox', { name: 'Absender-Destination', exact: true })).toHaveValue(
    '11111111-1111-4111-8111-000000000001',
  );
  await capture('send');
  await page.evaluate((packet) => {
    const original = window.__TAURI_INTERNALS__.invoke;
    const schemaUri = 'urn:test:building';
    const document = new TextEncoder().encode(
      JSON.stringify({
        ...packet,
        schemaUri,
        schemas: packet.schemas.map((item) => ({
          ...item,
          name: new URL(item.name, 'https://schemas.example.test/building/').href,
        })),
      }),
    );
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      const envelope = (data) => ({
        apiVersion: args.apiVersion,
        sessionId: args.sessionId,
        environment: 'TEST',
        data,
      });
      if (command === 'load_send_destination')
        return envelope({
          destinationId: args.destinationId,
          detailsJson: JSON.stringify({
            destinationId: args.destinationId,
            publicServices: [
              {
                identifier: 'urn:test:service',
                name: 'Fiktive Bauleistung',
                submissionSchemas: [{ schemaUri, mimeType: 'application/xml' }],
              },
            ],
          }),
        });
      if (command === 'load_send_schema' || command === 'read_send_schema')
        return envelope({
          schemaId: '55555555-5555-4555-8555-555555555555',
          schemaUri,
          byteOffset: args.byteOffset || 0,
          totalBytes: document.length,
          chunk: btoa(
            String.fromCharCode(...document.slice(args.byteOffset || 0, (args.byteOffset || 0) + 12 * 1024)),
          ),
        });
      return original(command, args);
    };
  }, xmlPacket);
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await button('Leistungen laden').click();
  await button('Weiter: Fachdaten').click();
  await page.locator('#send-schema-sources').check();
  await button('Fiktive Beispieldaten erzeugen').click();
  const messagePicker = page
    .getByRole('dialog', { name: 'Fiktive Beispieldaten', exact: true })
    .getByRole('combobox');
  await expect(messagePicker).toBeFocused();
  await messagePicker.selectOption({
    label: 'Anzeige des Bauvorhabens · genehmigungsfreistellung.anzeige.0600',
  });
  await capture('xml-message-choice');
  await button('Beispieldaten übernehmen').click();
  await expect(page.locator('#send-data')).toHaveValue(/>0600<\/nachrichtentyp>/);
  await button('Fachdaten visuell ansehen').click();
  await capture('send-data', page.locator('[data-send-step="1"] legend'));
  await button('Prozesse').click();
  await button('Fiktiven Demo-Prozess öffnen').click();
  await expect(page.locator('.bpmn-diagram .djs-container > svg')).toBeVisible();
  await page.locator('.workspace-scroll').evaluate((el) => (el.scrollTop = 0));
  await capture('processes');

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
  await button('Diagnose').click();
  await capture('diagnostics', page.getByRole('heading', { name: 'Technische Aufrufe', exact: true }));

  await open('test-fixtures/application-view.html?browser=1');
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await button('Einreichung öffnen und prüfen').click();
  const application = page.getByRole('heading', { name: 'Antrag lesen', exact: true });
  await expect(application).toBeVisible();
  await capture('receive', application);
  await button('Antwortmöglichkeiten laden').click();
  await page.locator('#reply-schema-sources').check();
  await button('Antwortschema laden').click();
  await button('Fiktiven Antwortentwurf erzeugen').click();
  await button('Beispieldaten übernehmen').click();
  await expect(page.locator('#reply-data')).toHaveValue(/erhalten/);
  await capture('replies', page.getByRole('heading', { name: 'Auf die Einreichung antworten', exact: true }));
  await button('Antwort prüfen und vorbereiten').click();
  await expect(page.getByRole('dialog', { name: 'Antwort an TEST senden?', exact: true })).toBeVisible();
  await button('Antwort jetzt senden').click();
  await button('Event Log der Antwort prüfen').click();
  await expect(page.getByText('Event Log verifiziert', { exact: true })).toBeVisible();
  await page.locator('.workspace-scroll').evaluate((el) => (el.scrollTop = 0));
  await capture('events');

  await open('test-fixtures/application-view.html?browser=1');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'verify_submission') return Promise.reject('key_missing');
      return invoke(command, args);
    };
  });
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await button('Einreichung öffnen und prüfen').click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await capture('problems', page.getByRole('alert').first());

  await open('test-fixtures/case-workspace.html');
  await capture('case-list');
  await button('Fiktiver Antrag auf Testleistung').click();
  await capture('cases', page.locator('.case-detail'));
  await page.locator('.case-detail').getByRole('button', { name: 'Ansehen', exact: true }).click();
  await expect(page.locator('.pdf-preview canvas')).toBeVisible();
  await expect(page.getByText('Seite 1 von 2', { exact: true })).toBeVisible();
  await expect(page.getByText('PDF wird lokal dargestellt …', { exact: true })).toBeHidden();
  await expect(page.getByText('Seitentext lesen', { exact: true })).toBeVisible();
  await capture('pdf');

  await open('test-fixtures/destination-setup.html');
  await expect(
    page.getByRole('heading', { name: 'Eigene TEST-Destination anlegen', exact: true }),
  ).toBeVisible();
  await capture('destinations');
  console.log(`15 Abbildungen mit fiktiven Testdaten: ${directory}`);
} finally {
  await browser.close();
}
