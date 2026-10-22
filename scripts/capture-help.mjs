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
const captures = new Set();
const capture = async (name, anchor) => {
  if (anchor) await anchor.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/${name}.png` });
  captures.add(name);
};
try {
  await open('test-fixtures/environments.html');
  await page.getByRole('combobox', { name: 'Umgebung', exact: true }).selectOption('PROD');
  await expect(page.getByRole('dialog', { name: 'Zu PROD wechseln?', exact: true })).toBeVisible();
  await capture('environment-switch');
  await button('Zu PROD wechseln').click();
  await expect(page.locator('.environment-warning')).toContainText('PROD · Produktivbetrieb');
  await capture('environment-prod');
  await open('test-fixtures/environments.html?certificates=1');
  await page.getByText('V-PKI-Schlüsselpaar importieren', { exact: true }).click();
  await capture('vpki-import');
  // Only the native boundary is synthetic. The application and components are unchanged.
  await open('test-fixtures/profiles.html?destinations=1');
  await expect(button('Verbindung herstellen')).toBeVisible();
  await capture('overview');
  await button('Testwerkzeuge').click();
  await button('Fiktives Testpaket öffnen').click();
  await capture('test-packages');
  await button('Schema-Vergleich').click();
  await button('Fiktiven Beispielvergleich öffnen').click();
  await expect(page.locator('.schema-change-list')).toContainText('Jetzt ein Pflichtfeld');
  await capture('schema-comparison');
  await button('Start').click();
  await button('Verbindung herstellen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#client-id')).toHaveValue('');
  await expect(page.locator('#client-secret')).toHaveValue('');
  await capture('profiles');
  await page.evaluate(() => {
    window.__profilesFixture.profiles = Array.from({ length: 10 }, (_, n) => ({
      profileId: `11111111-1111-4111-8111-${String(100 + n).padStart(12, '0')}`,
      name: `Musterfachverfahren ${n + 1}`,
      clientId: `fiktiver-testzugang-${n + 1}`,
      apiVersion: n % 2 ? 'v2' : 'v3',
      role: 'administrative-system',
      keyCount: 2,
      available: true,
    }));
  });
  await page.keyboard.press('Escape');
  await button('Verbindung herstellen').click();
  await expect(page.locator('#saved-profile-choice option')).toHaveCount(10);
  await capture('saved-profiles');
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) =>
      command === 'loaded_keys'
        ? Promise.resolve({
            apiVersion: args.apiVersion,
            sessionId: args.sessionId,
            environment: 'TEST',
            data: { keys: [] },
          })
        : original(command, args);
  });
  await page.locator('#client-id').fill('synthetic-client');
  await page.locator('#client-secret').fill('synthetic-secret-marker');
  await button('Anmelden').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await button('Verbunden').click();
  await expect(page.locator('.connection-identity')).toContainText('synthetic-client');
  await capture('connection-identity');
  await page.keyboard.press('Escape');
  await button('Empfangen').click();
  await capture('receive-inbox');
  await button('Senden').click();
  await expect(page.getByRole('combobox', { name: 'Absender-Destination', exact: true })).toHaveValue(
    '11111111-1111-4111-8111-000000000001',
  );
  await capture('send');
  await page.evaluate((packet) => {
    const original = window.__TAURI_INTERNALS__.invoke;
    const schemaUri = 'urn:test:building';
    let content, attempt;
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
      if (command === 'begin_content') {
        content = {
          contentId: crypto.randomUUID(),
          totalBytes: args.totalBytes,
          receivedBytes: 0,
          complete: args.totalBytes === 0,
        };
        return envelope({ ...content });
      }
      if (command === 'append_content') {
        content.receivedBytes += atob(args.chunk).length;
        content.complete = content.receivedBytes === content.totalBytes;
        return envelope({ ...content });
      }
      if (command === 'discard_content') return envelope({ contentId: args.contentId });
      if (command === 'validate_send_data') {
        const request = JSON.parse(args.schemaDocument);
        return envelope({
          schemaUri: request.schemaUri,
          mimeType: request.mimeType,
          dataBytes: content.totalBytes,
          valid: true,
        });
      }
      if (command === 'prepare_send') {
        const { contentId: _contentId, attachments, ...draft } = JSON.parse(args.sendDocument);
        attempt = {
          attemptId: crypto.randomUUID(),
          status: 'prepared',
          submissionId: null,
          caseId: null,
          error: null,
        };
        return envelope({
          attempt,
          summary: { ...draft, dataBytes: content.totalBytes, attachments },
        });
      }
      if (command === 'cancel_send') return envelope({ ...attempt, status: 'cancelled' });
      if (command === 'load_send_destination')
        return envelope({
          destinationId: args.destinationId,
          detailsJson: JSON.stringify({
            destinationId: args.destinationId,
            publicServices: [
              {
                identifier: 'urn:de:fim:leika:leistung:99000000000001',
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
  await page.route('https://fimportal.de/**', (route) =>
    route.fulfill({
      json: { items: [{ leistungsschluessel: '99000000000001', title: 'Fiktive Bauleistung für den Test' }] },
    }),
  );
  await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
  await button('Leistungen laden').click();
  await button('Leistungsnamen aus FIM laden').click();
  await expect(page.locator('#send-service')).toContainText('Fiktive Bauleistung für den Test');
  await capture('leika-labels', page.locator('[data-send-step="0"] legend'));
  await button('Weiter: Fachdaten').click();
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
  await button('Formularansicht').click();
  await capture('send-data', page.locator('[data-send-step="1"] legend'));
  await button('Fachdaten gegen Schema prüfen').click();
  await expect(page.getByText('Fachdaten entsprechen dem Schema.', { exact: true })).toBeVisible();
  await capture('send-validation', page.locator('.send-schema-validation'));
  await button('Weiter: Anlagen & Antwortkanal').click();
  await page.getByText('Entwurf als Testfall wiederverwenden', { exact: true }).click();
  await page.locator('#send-test-name').fill('Fiktive XBau-Anzeige mit Beispieldaten');
  await button('Testfall speichern').click();
  await expect(page.locator('#send-library-choice')).toContainText('Fiktive XBau-Anzeige mit Beispieldaten');
  await capture('send-test-cases', page.locator('.save-test-case'));
  await capture('test-case-library', page.locator('.test-case-library'));
  await button('Versand vorbereiten').click();
  const confirmation = page.getByRole('dialog', { name: 'Einreichung an FIT-Connect senden?', exact: true });
  await expect(confirmation.locator('dt:has-text("Antwortangebot") + dd')).toHaveText('Nicht angeboten');
  await expect(confirmation.locator('dt:has-text("Anlagen") + dd')).toHaveText('0');
  await capture('send-confirmation');
  await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
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
  await capture('receive-review', page.locator('.submission-document-heading'));
  await capture('receive', page.locator('.document-layout'));
  await button('Antwort verfassen').click();
  await button('Fiktiven Antwortentwurf erzeugen').click();
  await button('Für diese Verbindung erlauben').click();
  await button('Beispieldaten übernehmen').click();
  await expect(page.locator('#reply-data')).toHaveValue(/erhalten/);
  await capture('replies', page.getByRole('heading', { name: 'Auf die Einreichung antworten', exact: true }));
  await button('Antwort prüfen und vorbereiten').click();
  await expect(
    page.getByRole('dialog', { name: 'Antwort an FIT-Connect senden?', exact: true }),
  ).toBeVisible();
  await capture('reply-confirmation');
  await button('Antwort jetzt senden').click();
  await button('Event Log der Antwort prüfen').click();
  await expect(page.getByText('Event Log verifiziert', { exact: true })).toBeVisible();
  await page.locator('.workspace-scroll').evaluate((el) => (el.scrollTop = 0));
  await capture('events');

  for (const failure of ['reply_channel_missing', 'schema_id_mismatch']) {
    await open('test-fixtures/application-view.html?browser=1');
    await page.evaluate((failure) => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'reply_target' && failure === 'reply_channel_missing') throw failure;
        if (command === 'load_reply_schema' && failure === 'schema_id_mismatch') throw failure;
        const result = await invoke(command, args);
        if (command === 'reply_target') result.data.schemas[0].schemaUri = 'urn:test:reply-schema';
        return result;
      };
    }, failure);
    await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
    await button('Einreichung öffnen und prüfen').click();
    await button('Antwort verfassen').click();
    const missing = failure === 'reply_channel_missing';
    if (!missing) {
      await page.getByText('Antwortschema und technische Optionen', { exact: true }).click();
      await page.locator('#reply-schema-file').setInputFiles({
        name: 'synthetisches-antwortschema.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ $id: 'urn:test:anderes-schema', type: 'object' })),
      });
      await button('Antwortschema laden').click();
    }
    const notice = page.getByRole('alert', {
      name: missing ? 'Kein Antwortkanal angeboten' : 'Antwortschema passt nicht zum Angebot',
      exact: true,
    });
    await expect(notice).toBeVisible();
    await capture(missing ? 'reply-missing-channel' : 'reply-schema-mismatch', notice);
  }

  await open('test-fixtures/application-view.html?browser=1');
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === 'verify_submission')
        return Promise.reject(
          JSON.parse(args.schemaDocument).allowExternalSchemas
            ? 'schema_unavailable'
            : 'schema_consent_required',
        );
      return invoke(command, args);
    };
  });
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await button('Einreichung öffnen und prüfen').click();
  await expect(
    page.getByRole('dialog', { name: 'Öffentliche Schemaquellen laden?', exact: true }),
  ).toBeVisible();
  await capture('schema-access');
  await button('Für diese Verbindung erlauben').click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await capture('problems', page.getByRole('alert').first());

  await open('test-fixtures/case-workspace.html');
  await capture('case-list');
  await page.getByLabel('Vorgänge durchsuchen').fill('Fiktive Rückfrage');
  await page.getByRole('combobox', { name: 'Nachrichten', exact: true }).selectOption('sent');
  await page.getByLabel('Nur Vorgänge mit Klärungsbedarf', { exact: true }).check();
  await expect(button('Suche und Filter zurücksetzen')).toBeVisible();
  await capture('case-filter-reset');
  await button('Suche und Filter zurücksetzen').click();
  await expect(page.getByRole('list', { name: 'Lokale Vorgänge' }).locator(':scope > li')).toHaveCount(2);
  await button('Fiktiver Antrag auf Testleistung').click();
  await capture('cases', page.locator('.case-detail'));
  await page.locator('.case-detail').getByRole('button', { name: 'Ansehen', exact: true }).click();
  await expect(page.locator('.pdf-preview canvas')).toBeVisible();
  await expect(page.getByText('Seite 1 von 2', { exact: true })).toBeVisible();
  await expect(page.getByText('PDF wird lokal dargestellt …', { exact: true })).toBeHidden();
  await expect(page.getByText('Seitentext lesen', { exact: true })).toBeVisible();
  await capture('pdf');

  await open('test-fixtures/destination-setup.html');
  await expect(page.getByRole('heading', { name: 'Eigene Destination anlegen', exact: true })).toBeVisible();
  await capture('destinations');
  console.log(`${captures.size} Abbildungen mit fiktiven Testdaten: ${directory}`);
} finally {
  await browser.close();
}
