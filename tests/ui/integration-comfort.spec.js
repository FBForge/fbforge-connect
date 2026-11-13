import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const example = JSON.parse(
  await readFile(new URL('../../frontend/src/examples/integration.fctest.json', import.meta.url), 'utf8'),
);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
for (const api of ['v2', 'v3']) {
  test(`age filters, server reconciliation, expiry and explicit scanner setup ${api}`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?api=${api}`);
    await button(page, 'Eingang').click();
    await expect(page.getByTestId('age-result')).toContainText('undefined');
    await button(page, 'Alter aus Event Logs laden').click();
    await expect(page.getByTestId('age-result')).toContainText(':10');
    await page.getByLabel('Alter auf dieser Seite', { exact: true }).selectOption('9');
    await expect(page.getByTestId('age-result')).not.toContainText(id(3));
    await button(page, 'Versand').click();
    await button(page, 'Versand mit Server abgleichen').click();
    await expect(page.getByRole('status')).toContainText(
      'Bereitstellung durch signiertes Serverereignis nachgewiesen',
    );
    await button(page, 'Zertifikate').click();
    await expect(page.getByRole('status')).toContainText('Zertifikate rechtzeitig erneuern');
    await button(page, 'Werkzeuge').click();
    await button(page, 'Virenscan').click();
    await page.getByLabel('Verfahren', { exact: true }).selectOption('clamav');
    await page.getByLabel('Host', { exact: true }).fill('localhost');
    await button(page, 'Scanner-Einstellung anwenden').click();
    await expect(page.getByRole('status').first()).toContainText('ClamAV');
    await page.evaluate(() => {
      window.__integration.failScanConfig = true;
    });
    await page.getByLabel('Verfahren', { exact: true }).selectOption('icap');
    await button(page, 'Scanner-Einstellung anwenden').click();
    await expect(page.getByRole('alert')).toContainText('abgebrochen');
    expect(
      await page.evaluate(() =>
        window.__integration.calls.some((c) =>
          ['execute_send', 'execute_receipt', 'execute_reply'].includes(c.command),
        ),
      ),
    ).toBe(false);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
    ).toEqual([]);
  });
  test(`flows preserve progress across tools/profiles and only advance matching decrypted evidence ${api}`, async ({
    page,
  }) => {
    const pack = structuredClone(example);
    pack.cases = [pack.cases[0]];
    pack.cases[0].reply = null;
    pack.cases[0].receipt = 'none';
    pack.cases[0].request.attachments = [];
    pack.cases[0].request.replyOffer = null;
    await page.goto(`http://127.0.0.1:1420/test-fixtures/integration-tools.html?legacy=flows&api=${api}`);
    await page.locator('#test-flow-file').setInputFiles({
      name: 'flow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pack)),
    });
    await button(page, 'Durchlauf starten').click();
    await button(page, 'Testfall als Versandentwurf öffnen').click();
    expect(await page.evaluate(() => window.__integration.emitted?.id)).toBe(pack.cases[0].id);
    const record = {
      recordId: id(20),
      revision: id(21),
      kind: 'submission',
      direction: 'sent',
      status: 'sent',
      caseId: id(5),
      submissionId: id(2),
      replyId: null,
      destinationId: id(4),
      title: 'Fiktiver Testlauf',
      warnings: [],
      totalBytes: 20,
    };
    await page.evaluate(
      ({ record, data }) => {
        window.__integration.records = [{ ...record, createdAt: new Date().toISOString() }];
        window.__integration.data = data;
        window.__integration.wrong = true;
      },
      { record, data: pack.cases[0].request.data },
    );
    await button(page, 'Lokale Ergebnisse laden').click();
    await page.getByLabel('Nachricht für diesen Schritt', { exact: true }).selectOption(record.recordId);
    await button(page, 'Schritt anhand der Inhalte prüfen').click();
    await expect(page.getByRole('alert')).toContainText('weichen vom Testfall ab');
    await page.evaluate(() => {
      window.__integration.wrong = false;
    });
    await button(page, 'Schritt anhand der Inhalte prüfen').click();
    await expect(
      page.getByRole('heading', { name: `Eingang prüfen: ${pack.cases[0].name}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Fortschritt für Ihr Windows-Benutzerkonto gespeichert', { exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(
      () => Object.values(JSON.parse(localStorage.getItem('fixture-test-runs')))[0],
    );
    expect(saved.run.results).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain('sessionId');
    await page.reload();
    await page.getByText('Gespeicherten Durchlauf fortsetzen', { exact: true }).click();
    await page.getByLabel('Durchlauf', { exact: true }).selectOption(saved.run.id);
    await button(page, 'Durchlauf fortsetzen').click();
    await expect(page.getByText(/Bisherige Ergebnisse sind historische Prüfungen/)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `Eingang prüfen: ${pack.cases[0].name}`, exact: true }),
    ).toBeVisible();
    await page.evaluate(
      ({ record, data }) => {
        window.__integration.records = [{ ...record, createdAt: new Date().toISOString() }];
        window.__integration.data = data;
      },
      { record, data: pack.cases[0].request.data },
    );
    await button(page, 'Vorlagen').click();
    await button(page, 'Werkzeuge').click();
    await button(page, 'Anderes Profil').click();
    await expect(
      page.getByRole('heading', { name: `Eingang prüfen: ${pack.cases[0].name}`, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.__integration.records[0].direction = 'received';
      window.__integration.records[0].status = 'verified';
    });
    for (let i = 0; i < 2; i++) {
      await button(page, 'Lokale Ergebnisse laden').click();
      await page.getByLabel('Nachricht für diesen Schritt', { exact: true }).selectOption(record.recordId);
      await button(page, 'Schritt anhand der Inhalte prüfen').click();
    }
    await expect(
      page.getByRole('status').filter({ hasText: 'Alle Schritte dieses Testablaufs sind geprüft.' }),
    ).toBeVisible();
    await button(page, 'Neuen Durchlauf starten').click();
    await expect(page.getByRole('dialog', { name: 'Durchlauf neu starten?' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(
      page.getByText('Alle Schritte dieses Testablaufs sind geprüft.', { exact: true }),
    ).toBeVisible();
    await button(page, 'Neuen Durchlauf starten').click();
    const restartDialog = page.getByRole('dialog', { name: 'Durchlauf neu starten?' });
    const downloaded = page.waitForEvent('download');
    await restartDialog.getByRole('button', { name: 'Durchlaufergebnis exportieren', exact: true }).click();
    const result = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
    expect(result.results).toHaveLength(3);
    expect(result.bindings).toBeUndefined();
    await restartDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await page.getByText('Ablauf verwalten oder anderen Ablauf öffnen', { exact: true }).click();
    await page.locator('#test-flow-file').setInputFiles({
      name: 'replacement.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...pack, name: 'Anderer Ablauf' })),
    });
    await expect(page.getByRole('dialog', { name: 'Anderen Ablauf öffnen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(
      page.getByText('Alle Schritte dieses Testablaufs sind geprüft.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anderer Ablauf', exact: true })).toHaveCount(0);
    await button(page, 'Neuen Durchlauf starten').click();
    await button(page, 'Ergebnisse zurücksetzen und neu starten').click();
    await expect(
      page.getByRole('heading', { name: `Einreichung senden: ${pack.cases[0].name}`, exact: true }),
    ).toBeVisible();
  });
}
test('configuration import requires explicit application and never writes to FIT-Connect', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html');
  await button(page, 'Vorlagen').click();
  await page.getByText('Konfigurationsvorlagen', { exact: true }).click();
  const template = {
    format: 'fbforge-connect-destination-template',
    version: 1,
    name: 'Beispiel',
    changes: { name: '{name} Beispiel', metadataVersions: ['3.0.0'] },
  };
  await page.locator('#destination-template-import').setInputFiles({
    name: 'template.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(template)),
  });
  expect(await page.evaluate(() => window.__integration.applied)).toBe(null);
  await button(page, 'Import in Bearbeitung übernehmen').click();
  expect(await page.evaluate(() => window.__integration.applied)).toEqual(template.changes);
  await page.getByLabel('Vorlagenname', { exact: true }).fill('Gespeichert');
  await button(page, 'Vorlage geschützt speichern').click();
  await expect(page.getByRole('status')).toContainText('geschützt gespeichert');
  const calls = await page.evaluate(() => window.__integration.calls.map((c) => c.command));
  expect(calls.every((c) => ['profile_workspace', 'test_library'].includes(c))).toBe(true);
});

test('assigned profiles and destinations persist with the run and context actions never send automatically', async ({
  page,
}) => {
  const pack = structuredClone(example);
  pack.cases = [pack.cases[0]];
  await page.goto('http://127.0.0.1:1420/test-fixtures/integration-tools.html?legacy=flows&api=v3');
  await page.locator('#test-flow-file').setInputFiles({
    name: 'flow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.getByText('Sender und Empfänger zuordnen', { exact: true }).click();
  await button(page, 'Profile aktualisieren').click();
  await page.getByLabel('Sender-Profil', { exact: true }).selectOption(id(71));
  await page.getByLabel('Empfänger-Profil', { exact: true }).selectOption(id(72));
  await page.getByLabel('Absender-Destination (API v3)', { exact: true }).fill(id(4));
  await page.getByLabel('Empfangs-Destination', { exact: true }).fill(id(5));
  await button(page, 'Durchlauf starten').click();
  await expect(
    page.getByText('Fortschritt für Ihr Windows-Benutzerkonto gespeichert', { exact: true }),
  ).toBeVisible();
  await button(page, 'Zum Sender wechseln').click();
  const context = await page.evaluate(() => window.__integration.context);
  expect(context).toMatchObject({
    senderProfileId: id(71),
    receiverProfileId: id(72),
    receiverDestination: id(5),
    sourceDestination: id(4),
    side: 'sender',
    apiVersion: 'v3',
  });
  const saved = await page.evaluate(
    () => Object.values(JSON.parse(localStorage.getItem('fixture-test-runs')))[0],
  );
  expect(saved.context.senderProfileId).toBe(id(71));
  expect(
    await page.evaluate(() =>
      window.__integration.calls.some((c) => c.command === 'execute_send' || c.command === 'execute_receipt'),
    ),
  ).toBe(false);
});
