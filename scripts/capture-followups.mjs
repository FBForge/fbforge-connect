// Additional screenshots: real UI, explicitly synthetic profile storage.
export async function captureFollowups({ page, open, button, capture }) {
  await open('test-fixtures/profiles.html');
  await button('Verbindung herstellen').click();
  await page.locator('#client-id').fill('synthetic-guide-client');
  await page.locator('#client-secret').fill('synthetic-guide-secret');
  await page.getByRole('checkbox', { name: /Zugangsdaten und Schlüssel/ }).check();
  await page.locator('#profile-name').fill('Testfachverfahren');
  await button('Anmelden').click();
  await page.evaluate(async () => {
    const { answerSchemaFixture } = await import('/test-fixtures/answer-schema-fixture.js');
    const previous = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) =>
      command === 'profile_answer_schemas' ? answerSchemaFixture(args.action) : previous(command, args);
  });
  await button('Testwerkzeuge').click();
  await page.getByRole('tab', { name: 'Antwortschemas', exact: true }).click();
  await button('Im Profil speichern').click();
  await page
    .getByText('Antwortschema im Profil gespeichert. Bei derselben URI wird es automatisch verwendet.', {
      exact: true,
    })
    .waitFor();
  await capture('channel-schema-profile', page.locator('#channel-designer-title'));
  await open('test-fixtures/destination-manager.html');
  await button('Eigene Destinations laden').click();
  await button('Alle auswählen (diese Seite)').click();
  await capture('destination-selection');
  await button('Auswahl aufheben').click();
  await button('Bearbeiten').first().click();
  await page.getByLabel('Leistungen, Schemata und Prozessnachrichten bearbeiten', { exact: true }).check();
  await button('Leistung hinzufügen').click();
  await page
    .getByLabel('Leistungskennung (LeiKa-URN)', { exact: true })
    .fill('urn:de:fim:leika:leistung:99008001014002');
  await page.locator('#manager-offer-publicServices-0-schema-0').fill('urn:beispiel:antrag:1');
  await page.getByRole('checkbox', { name: 'FIT-Connect', exact: true }).check();
  await page.locator('#manager-offer-0-replies').fill('urn:beispiel:antwort:1');
  await page.getByRole('checkbox', { name: 'E-Mail', exact: true }).check();
  await page.getByRole('checkbox', { name: 'BundID', exact: true }).check();
  for (const name of ['ELSTER', 'DE-Mail', 'FINK'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await capture(
    'destination-reply-channels',
    page.getByRole('group', { name: 'Antwortkanäle', exact: true }),
  );
}
