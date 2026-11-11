// Continues capture-help's real application session. Only native replies are synthetic.
export async function captureScenarioHelp(page, capture) {
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('Vorbereiten').click();
  await page.getByText('Weitere Antworten im selben Vorgang', { exact: true }).click();
  await button('Weitere Antwort hinzufügen').click();
  await page
    .getByRole('textbox', { name: 'Bezeichnung der Antwort', exact: true })
    .fill('Unterlagen nachfordern');
  await page
    .getByRole('combobox', { name: 'Nachricht bearbeiten', exact: true })
    .selectOption({ label: 'Unterlagen nachfordern' });
  await page
    .getByRole('textbox', { name: 'Fachdaten', exact: true })
    .fill('{"status":"unterlagen_erforderlich","nachricht":"Bitte den fiktiven Nachweis nachreichen."}');
  await button('Weitere Antwort hinzufügen').click();
  await page
    .getByRole('textbox', { name: 'Bezeichnung der Antwort', exact: true })
    .nth(1)
    .fill('Vorgang abschließen');
  await capture(
    'integration-responses',
    page.getByText('Weitere Antworten im selben Vorgang', { exact: true }).locator('..'),
  );
  await button('Als Testserie planen').click();
  const series = page.locator('.scenario-series');
  for (const api of ['v2', 'v3'])
    await series.getByRole('checkbox', { name: `API ${api}`, exact: true }).check();
  await series
    .getByRole('textbox', { name: 'Name der Testserie', exact: true })
    .fill('Fiktiver Integrationstest · API-Vergleich');
  await series.getByRole('button', { name: 'Testserie anlegen', exact: true }).click();
  const row = series.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'v3', exact: true }) });
  await row.getByRole('button', { name: 'Durchlauf starten', exact: true }).click();
  await page.evaluate(() => {
    const base = window.__TAURI_INTERNALS__.invoke;
    const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const bytes = new TextEncoder().encode(
      '{"antragstellendePerson":{"vorname":"Erika","nachname":"Mustermann"},"anliegen":"Fiktiver Integrationstest"}',
    );
    const recordId = id(410);
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== 'case_workspace') return base(command, args);
      const data =
        args.operation === 'list'
          ? {
              persistent: true,
              canPersist: true,
              records: [
                {
                  recordId,
                  revision: id(411),
                  kind: 'submission',
                  direction: 'sent',
                  status: 'sent',
                  createdAt: new Date().toISOString(),
                  title: 'Fiktiver Antrag für den Vergleich',
                  caseId: id(412),
                  submissionId: id(413),
                  replyId: null,
                  destinationId: id(414),
                  totalBytes: bytes.length,
                  warnings: [],
                },
              ],
            }
          : args.operation === 'parts'
            ? {
                recordId,
                offset: 0,
                total: 1,
                parts: [
                  {
                    contentId: id(415),
                    kind: 'data',
                    fileName: 'fachdaten.json',
                    mimeType: 'application/json',
                    totalBytes: bytes.length,
                  },
                ],
              }
            : {
                recordId,
                contentId: id(415),
                byteOffset: 0,
                totalBytes: bytes.length,
                chunk: btoa(String.fromCharCode(...bytes)),
                complete: true,
              };
      return { apiVersion: args.apiVersion, sessionId: args.sessionId, environment: 'TEST', data };
    };
  });
  await page.getByText('Nachweis gezielt auswählen', { exact: true }).click();
  await button('Nachweise aktualisieren').click();
  await button('Ausgewählte Nachricht prüfen').click();
  await button('Ergebnisse').click();
  await capture(
    'integration-differences',
    page.getByRole('heading', { name: 'Ergebnisse dieses Durchlaufs', exact: true }),
  );
  await button('Zur Testserie').click();
  await capture('integration-series', series);
}
