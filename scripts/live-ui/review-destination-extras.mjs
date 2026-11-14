import { check, until } from './desktop.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });

// Uses only the unused clone created by this run. No messages are sent to its callback.
export async function reviewDestinationExtras(page, fixture, id, expectedName, senderDestination) {
  const before = await fixture.readManagedFixture(id);
  check(before.name === expectedName, 'live_ui_extra_settings_owner_mismatch');
  const edit = async () => {
    await button(page, 'Bestehende Destinations').click();
    await button(page, 'Eigene Destinations laden').click();
    const clearSelection = button(page, 'Auswahl aufheben');
    if (await clearSelection.isVisible()) await clearSelection.click();
    const target = page.locator(`[data-edit-destination="${id}"]`);
    for (let offset = 0; offset <= 200; offset += 20) {
      await until(
        async () => !(await button(page, 'Eigene Destinations laden').isDisabled()),
        'live_ui_extra_settings_list_pending',
      );
      if (await target.isVisible()) break;
      const next = button(page, 'Nächste Seite');
      check(!(await next.isDisabled()), 'live_ui_extra_settings_clone_missing');
      await next.click();
    }
    await target.click();
    await page.getByRole('heading', { name: 'Destination bearbeiten', exact: true }).waitFor();
  };
  const commit = async () => {
    await button(page, 'Änderungsvorschau erstellen').click();
    const preview = page.locator('[aria-labelledby="update-preview-title"]');
    await button(preview, 'Diese Änderungen verbindlich in der gewählten Umgebung speichern').click();
    await preview.getByText('Abgeschlossen', { exact: true }).waitFor();
    return fixture.readManagedFixture(id);
  };
  await edit();
  await page.getByLabel('Im vereinfachten TEST-Routing sichtbar', { exact: true }).check();
  await page.getByText('Absender beschränken', { exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Absender beschränken', exact: true }).check();
  await page.getByLabel('Erlaubte Absender-Destination-IDs', { exact: true }).fill(senderDestination);
  await page
    .getByLabel('Kopie der Kontaktbenachrichtigung an (E-Mail)', { exact: true })
    .fill('integration@example.invalid');
  await page.getByText('Callback einrichten oder ändern', { exact: true }).click();
  // The Destination API requires resolvable callback hosts. This is our own domain;
  // this unused fixture receives no submissions and is removed after the check.
  const url = 'https://fbforge.de/fbforge-owned-ci-callback';
  await page.getByLabel('Callback-Adresse', { exact: true }).fill(url);
  await page
    .getByLabel('Neues Callback-Secret', { exact: true })
    .fill('Fiktives-Callback-Secret-nur-fuer-diesen-TEST');
  await button(page, 'Callback vormerken').click();
  const changed = await commit(),
    extras = JSON.parse(changed.extrasJson);
  check(
    extras.publicForRouting === true &&
      extras.senderAccessRestricted?.enabled === true &&
      extras.senderAccessRestricted.allowedSenderDestinations.includes(senderDestination) &&
      extras.callback?.url === url &&
      !('secret' in extras.callback) &&
      JSON.parse(changed.contactJson).cc.includes('integration@example.invalid'),
    'live_ui_extra_settings_readback_mismatch',
  );
  await edit();
  await page.getByLabel('Im vereinfachten TEST-Routing sichtbar', { exact: true }).uncheck();
  await page.getByText('Absender beschränken', { exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Absender beschränken', exact: true }).uncheck();
  await page.getByLabel('Erlaubte Absender-Destination-IDs', { exact: true }).fill('');
  await page.getByLabel('Kopie der Kontaktbenachrichtigung an (E-Mail)', { exact: true }).fill('');
  await page.getByText('Callback einrichten oder ändern', { exact: true }).click();
  check(
    (await page.getByLabel('Neues Callback-Secret', { exact: true }).inputValue()) === '',
    'live_ui_callback_secret_exposed',
  );
  await button(page, 'Callback entfernen').click();
  const cleared = await commit(),
    restored = JSON.parse(cleared.extrasJson);
  check(
    restored.publicForRouting === false &&
      !restored.senderAccessRestricted?.enabled &&
      !restored.senderAccessRestricted?.allowedSenderDestinations?.length &&
      !restored.callback &&
      !JSON.parse(cleared.contactJson).cc?.length &&
      cleared.name === before.name &&
      cleared.offersJson === before.offersJson,
    'live_ui_extra_settings_cleanup_mismatch',
  );
}
