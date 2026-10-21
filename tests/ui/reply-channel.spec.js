import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function open(page, api, failure = 'reply_channel_missing', schemaUri = null) {
  await page.goto(`http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1&api=${api}`);
  await page.evaluate(
    ({ failure, schemaUri }) => {
      const original = window.__TAURI_INTERNALS__.invoke;
      const state = (window.__replyChannelFixture = { failure, schemaUri, calls: [] });
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        state.calls.push(command);
        if (command === 'reply_target' && state.failure) throw state.failure;
        if (command === 'load_reply_schema' && state.schemaUri) {
          const selection = JSON.parse(args.schemaDocument);
          if (selection.schemaContentId) {
            const schema = JSON.parse(
              new TextDecoder().decode(
                window.__applicationFixture.uploaded.get(selection.schemaContentId).bytes,
              ),
            );
            if (schema.$id !== selection.schemaUri) throw 'schema_id_mismatch';
          }
        }
        if (command === 'loaded_keys')
          return {
            apiVersion: args.apiVersion,
            sessionId: args.sessionId,
            environment: 'TEST',
            data: {
              keys: [
                {
                  destinationId: '00000002-1111-4111-8111-111111111111',
                  kid: 'synthetic-sign',
                  purpose: 'sign',
                },
              ],
            },
          };
        const result = await original(command, args);
        if (command === 'reply_target' && state.schemaUri) result.data.schemas[0].schemaUri = state.schemaUri;
        return result;
      };
    },
    { failure, schemaUri },
  );
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Antrag lesen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
}

for (const api of ['v2', 'v3']) {
  test(`a mismatched local reply schema shows the expected ID and preserves the draft (${api})`, async ({
    page,
    context,
  }) => {
    const uri = 'urn:efast-digital:fjd:standard:process_1.0';
    await open(page, api, '', uri);
    const text = '{"status":"erhalten","nachricht":"Mein Antwortentwurf"}';
    await page.locator('#reply-data').fill(text);
    await page.getByText('Antwortschema und technische Optionen', { exact: true }).click();
    const schemaFile = ($id) => ({
      name: 'synthetisches-antwortschema.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          $id,
          type: 'object',
          properties: { status: { const: 'erhalten' } },
          required: ['status'],
        }),
      ),
    });
    await page
      .locator('#reply-schema-file')
      .setInputFiles(schemaFile('urn:efast:digital:fjd:standard:process_1.0'));
    await page.getByRole('button', { name: 'Antwortschema laden', exact: true }).click();
    const notice = page.getByRole('alert', { name: 'Antwortschema passt nicht zum Angebot', exact: true });
    await expect(notice.getByRole('heading')).toBeFocused();
    await expect(notice).toContainText('Kennung $id');
    await expect(notice).toContainText(uri);
    await expect(page.locator('#reply-data')).toHaveValue(text);
    await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
    await expect(notice.getByText('schema_id_mismatch', { exact: true })).toBeVisible();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await notice.getByRole('button', { name: 'Erwartete Schema-Kennung kopieren', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(uri);
    expect(await page.evaluate(() => window.__applicationFixture.uploaded.size)).toBe(0);
    await page.setViewportSize({ width: 640, height: 540 });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
    const chooserPromise = page.waitForEvent('filechooser');
    await notice.getByRole('button', { name: 'Passendes Schema auswählen', exact: true }).click();
    await (await chooserPromise).setFiles(schemaFile(uri));
    await expect(notice).toHaveCount(0);
    await page.getByRole('button', { name: 'Antwortschema laden', exact: true }).click();
    await expect(page.getByText('Schema geladen.', { exact: false })).toBeVisible();
    await expect(page.locator('#reply-data')).toHaveValue(text);
    await page.getByRole('button', { name: 'Antwort prüfen und vorbereiten', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Antwort an TEST senden?', exact: true })).toBeVisible();
    const calls = await page.evaluate(() => window.__replyChannelFixture.calls);
    expect(calls.filter((call) => call === 'load_reply_schema')).toHaveLength(2);
    expect(calls.filter((call) => call === 'prepare_reply')).toHaveLength(1);
    expect(calls.some((call) => ['execute_reply', 'execute_receipt'].includes(call))).toBe(false);
  });
}

for (const api of ['v2', 'v3']) {
  test(`missing reply channel explains the sender prerequisite and preserves verified reception (${api})`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, api);
    const notice = page.getByRole('alert', { name: 'Kein Antwortkanal angeboten', exact: true });
    await expect(notice.getByRole('heading')).toBeFocused();
    await expect(notice).toContainText('Antworten über FIT-Connect anbieten');
    await expect(notice).toContainText('neue Einreichung');
    await expect(notice).not.toContainText('Client-Secret prüfen');
    await expect(page.getByRole('button', { name: 'Antwortmöglichkeiten laden', exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('#reply-data')).toHaveCount(0);
    await expect(page.locator('.received-application').getByText('Erika', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annehmen', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Ablehnen', exact: true })).toBeEnabled();
    await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
    await expect(notice.locator('code')).toHaveText('reply_channel_missing');
    expect(
      await page.evaluate(async () => {
        const { diagnosticLog } = await import('/src/native.js');
        return diagnosticLog.snapshot().find((entry) => entry.command === 'reply_target')?.code;
      }),
    ).toBe('reply_channel_missing');
    await page.setViewportSize({ width: 640, height: 540 });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() =>
        window.__replyChannelFixture.calls.some((command) =>
          ['open_session', 'prepare_reply', 'execute_reply', 'execute_receipt'].includes(command),
        ),
      ),
    ).toBe(false);

    // A freshly verified submission with an offer must not inherit the previous missing-channel state.
    await page.evaluate(() => (window.__replyChannelFixture.failure = ''));
    await page.getByText('Entschlüsselung und Schemaeinstellungen', { exact: true }).click();
    await page.getByRole('button', { name: 'Erneut entschlüsseln und prüfen', exact: true }).click();
    await page.getByRole('button', { name: 'Antwort verfassen', exact: true }).click();
    await expect(page.locator('#reply-data')).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('a real authentication failure retains the credential error instead of reporting a missing offer', async ({
  page,
}) => {
  await open(page, 'v3', 'authentication_failed');
  const notice = page.getByRole('alert', { name: 'Antwortaktion fehlgeschlagen', exact: true });
  await expect(notice).toContainText('Client-ID und Client-Secret prüfen');
  await expect(page.getByRole('button', { name: 'Antwortmöglichkeiten laden', exact: true })).toBeEnabled();
  await notice.getByText('Technische Fehlerangaben', { exact: true }).click();
  await expect(notice.locator('code')).toHaveText('authentication_failed');
});

for (const api of ['v2', 'v3']) {
  test(`sender preserves the selected reply offer through step navigation and confirmation (${api})`, async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:1420/test-fixtures/sending.html');
    if (api === 'v2') await page.getByRole('button', { name: 'API wechseln', exact: true }).click();
    await page.evaluate(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__replyOfferCalls = [];
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        window.__replyOfferCalls.push({ command, args });
        const result = await invoke(command, args);
        if (command === 'load_send_destination') {
          const document = JSON.parse(result.data.detailsJson);
          document.publicServices[0].replyChannels = {
            fitConnect: { processStandards: ['urn:test:answer'] },
          };
          result.data.detailsJson = JSON.stringify(document);
        }
        return result;
      };
    });
    if (api === 'v3') await page.locator('#send-source').fill('11111111-1111-4111-8111-111111111111');
    await page.locator('#send-target').fill('22222222-2222-4222-8222-222222222222');
    await page.getByRole('button', { name: 'Leistungen laden', exact: true }).click();
    await page.getByRole('button', { name: 'Weiter: Fachdaten', exact: true }).click();
    await page.locator('#send-data').fill('{"vorname":"Erika"}');
    await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
    const offer = page.getByRole('checkbox', { name: 'Antworten über FIT-Connect anbieten', exact: true });
    await offer.check();
    await expect(page.locator('#send-reply-schema')).toHaveValue('urn:test:answer');
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await page.getByRole('button', { name: 'Weiter: Anlagen & Antwortkanal', exact: true }).click();
    await expect(offer).toBeChecked();
    await page.getByRole('button', { name: 'Versand vorbereiten', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Einreichung an TEST senden?', exact: true });
    await expect(confirmation).toContainText('Antwortkanal: urn:test:answer');
    const calls = await page.evaluate(() => window.__replyOfferCalls);
    const preparations = calls.filter((call) => call.command === 'prepare_send');
    expect(preparations).toHaveLength(1);
    expect(JSON.parse(preparations[0].args.sendDocument).replyOffer).toEqual({
      schemaUri: 'urn:test:answer',
      mimeType: 'application/json',
      processMessages: [],
    });
    expect(calls.some((call) => call.command === 'execute_send')).toBe(false);
  });
}
