// Long, fully synthetic form shared by receive and local-case reading checks.
export const readingUri = 'urn:test:reading';
const properties = {
  antragsteller: {
    title: 'Antragsteller',
    type: 'object',
    properties: {
      name: { title: 'Name', type: 'string' },
      geburt: { title: 'Geburtsdatum', type: 'string', format: 'date' },
      zustimmung: { title: 'Einwilligung', type: 'string', oneOf: [{ const: 'false', title: 'Nein' }] },
      gruppe: {
        title: 'Gruppe für die Kostenbefreiung',
        type: 'string',
        oneOf: [{ const: 'eh', title: 'Ehrenamtliche Tätigkeit' }],
      },
    },
  },
};
const data = {
  antragsteller: { name: 'Erika Musterfrau', geburt: '1985-04-12', zustimmung: 'false', gruppe: 'eh' },
};
for (let index = 1; index <= 12; index++) {
  const key = `abschnitt${index}`;
  properties[key] = {
    title: `Angaben zum Testvorhaben ${index}`,
    type: 'object',
    properties: {
      ort: { title: 'Ort des Vorhabens', type: 'string' },
      beschreibung: { title: 'Beschreibung', type: 'string' },
      bestaetigung: { title: 'Angaben bestätigt', type: 'boolean' },
    },
  };
  data[key] = {
    ort: `Teststadt ${index}`,
    beschreibung: 'Fiktive Angaben für die Prüfung der Formularansicht. Keine echten Antragsdaten.',
    bestaetigung: true,
  };
}
export const readingText = JSON.stringify(data);
export const readingPacket = {
  schemaPackage: 1,
  schemaUri: readingUri,
  documents: { [readingUri]: { type: 'object', properties } },
};

export async function receiveReadingExample(page, attachmentCount = 0) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1');
  await page.evaluate(
    ({ text, packet, attachmentCount }) => {
      window.__applicationFixture.customText = text;
      window.__applicationFixture.schemaPacket = packet;
      window.__applicationFixture.extraAttachments = Array.from({ length: attachmentCount }, (_, i) => ({
        contentId: `${String(100 + i).padStart(8, '0')}-1111-4111-8111-111111111111`,
        kind: 'attachment',
        attachmentId: `${String(200 + i).padStart(8, '0')}-1111-4111-8111-111111111111`,
        fileName: `Fiktiver Nachweis ${i + 1}.txt`,
        mimeType: 'text/plain',
        description: 'Fiktive Anlage zur Prüfung langer Listen',
        bytes: new TextEncoder().encode('Synthetischer Nachweis.'),
      }));
    },
    { text: readingText, packet: readingPacket, attachmentCount },
  );
  await page.locator('#pickup-submission').fill('00000003-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Einreichung öffnen und prüfen', exact: true }).click();
  await page.getByRole('heading', { name: 'Antrag lesen', exact: true }).waitFor();
}

export async function caseReadingExample(page) {
  await page.goto('http://127.0.0.1:1420/test-fixtures/case-workspace.html');
  // The fixture loads its PDF asynchronously before exposing its native boundary.
  await page.getByRole('heading', { name: 'Meine Vorgänge', exact: true }).waitFor();
  await page.evaluate(
    ({ text, packet }) => {
      const parts = window.__caseFixture.parts;
      parts.find((part) => part.kind === 'data').bytes = new TextEncoder().encode(text);
      const schema = parts.find((part) => part.kind === 'schema');
      schema.fileName = packet.schemaUri;
      schema.bytes = new TextEncoder().encode(JSON.stringify(packet));
      // Match the real application's scroll container rather than the short standalone fixture.
      const viewport = document.querySelector('.case-fixture');
      viewport.classList.add('workspace-scroll');
      Object.assign(viewport.style, { maxWidth: 'none', height: '100dvh', margin: '0', padding: '0 24px' });
    },
    { text: readingText, packet: readingPacket },
  );
  await page.getByRole('button', { name: 'Fiktiver Antrag auf Testleistung', exact: true }).click();
  await page.getByRole('heading', { name: 'Fachdaten', exact: true }).waitFor();
}
