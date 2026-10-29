import { navigate } from './exchange.mjs';
import { check, until } from './desktop.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

export async function auditScreen(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  if (result.violations.length)
    console.error(
      `Real desktop accessibility rule failures: ${result.violations.map((item) => item.id).join(', ')}`,
    );
  check(result.violations.length === 0, 'live_ui_accessibility_failed');
  console.log('Real desktop UI: automated WCAG 2.2 A/AA screen check passed');
}

export async function localScannerReady(page) {
  if (process.env.FBFORGE_UI_SCANNER !== 'true') return;
  await navigate(page, 'Testwerkzeuge');
  await page.getByRole('button', { name: 'Malwarescanner', exact: true }).click();
  await until(
    async () => (await page.getByText('Aktiv: Lokaler ClamAV', { exact: true }).count()) === 1,
    'live_ui_local_scanner_not_selected',
    90000,
  );
  await page.getByText('Scanner läuft lokal', { exact: true }).waitFor();
  console.log(
    'Real installed desktop: optional local ClamAV adopted offline, ready and active before TEST sends and receives',
  );
}

export async function keySetup(page, fixture, api) {
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Einreichungen', exact: true }).click();
  const change = page.getByRole('button', { name: 'Einrichtung ändern', exact: true });
  if (await change.isVisible()) await change.click();
  await page.locator('#destination-id').fill(fixture.destination);
  await page.getByRole('button', { name: 'Destination laden', exact: true }).click();
  const input = page.locator('#private-test-key');
  await until(async () => !(await input.isDisabled()), 'live_ui_registered_keys_missing');
  await page.getByText('Passender Entschlüsselungsschlüssel geladen', { exact: true }).waitFor();
  if (await change.isVisible()) await change.click();
  const discard = page.getByRole('button', {
    name: 'Importierte Destination-Schlüssel verwerfen',
    exact: true,
  });
  page.once('dialog', async (dialog) => {
    if (
      dialog.type() === 'confirm' &&
      dialog
        .message()
        .startsWith('Alle importierten privaten Destination-Schlüssel dieser Sitzung entfernen?')
    )
      await dialog.accept();
    else await dialog.dismiss();
  });
  await discard.click();
  await page.getByText('Noch kein privater Schlüssel geladen.', { exact: true }).waitFor();
  await until(async () => !(await input.isDisabled()), 'live_ui_key_discard_pending');
  const profile = fixture.receiverProfiles.find((profile) => profile.api === api);
  const keys = profile.document.keys.filter(
    (item) => item.destinationKey?.destinationId === fixture.destination,
  );
  check(keys.length >= 2 && keys.length <= 16, 'live_ui_private_fixture_invalid');
  const paths = [];
  for (const [index, item] of keys.entries()) {
    const path = join(fixture.directory, `ui-key-${api}-${index}.jwk.json`);
    await writeFile(path, item.privateJwk, { mode: 0o600 });
    paths.push(path);
  }
  await input.setInputFiles(paths);
  await page.getByText('Passender Entschlüsselungsschlüssel geladen', { exact: true }).waitFor();
  // Successful import collapses the setup, so role-based button lookup no longer finds it.
  await until(async () => !(await input.isDisabled()), 'live_ui_private_key_import_failed');
  check(
    (await page.locator('#receiver-setup [role="alert"]').count()) === 0,
    'live_ui_private_key_import_partial',
  );
  console.log(
    `Real desktop UI: ${api} actual registered key readback, explicit key discard and automatic private-JWK import passed`,
  );
}

export async function localTools(page) {
  await navigate(page, 'Testwerkzeuge');
  await page.getByRole('button', { name: 'Fiktives Testpaket öffnen', exact: true }).click();
  await page.locator('#test-case-choice').waitFor();
  check((await page.locator('#test-case-choice option').count()) > 0, 'live_ui_test_pack_empty');
  await page.getByRole('button', { name: 'Schema-Vergleich', exact: true }).click();
  await page.getByRole('button', { name: 'Fiktiven Beispielvergleich öffnen', exact: true }).click();
  await page.locator('.comparison-result-heading').waitFor();
  check((await page.locator('.schema-change-list > li').count()) > 0, 'live_ui_schema_comparison_empty');
  await page.locator('#comparison-search').fill('ui-driver-no-matching-field');
  await page.getByRole('button', { name: 'Suche zurücksetzen', exact: true }).click();
  await navigate(page, 'Prozesse');
  await page.getByRole('button', { name: 'Fiktiven Demo-Prozess öffnen', exact: true }).click();
  const messages = page.locator('.bpmn-message-list button');
  await until(async () => (await messages.count()) > 0, 'live_ui_bpmn_messages_missing');
  await messages.first().click();
  await page.locator('#process-selection-title').waitFor();
  await navigate(page, 'Diagnose');
  await page.getByRole('button', { name: 'Komponenten prüfen', exact: true }).click();
  await until(
    async () => (await page.getByText('Lokal bereit', { exact: true }).count()) === 2,
    'live_ui_sdk_probe_incomplete',
  );
  await navigate(page, 'Info');
  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  await page.getByText(`Version ${version}`, { exact: false }).first().waitFor();
  check((await page.getByText('Alpha 1', { exact: false }).count()) === 0, 'live_ui_stale_alpha_label');
  console.log(
    'Real installed desktop UI: local test packs, schema comparison, BPMN, both SDK probes and release information passed',
  );
}

export async function ownDestination(page, fixture) {
  check((await page.locator('#session-api').inputValue()) === 'v3', 'live_ui_management_requires_v3');
  await navigate(page, 'Destinations');
  await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).click();
  const own = page.locator(`[data-open-destination="${fixture.destination}"]`);
  await until(
    async () =>
      !(await page.getByRole('button', { name: 'Eigene Destinations laden', exact: true }).isDisabled()),
    'live_ui_destination_list_pending',
  );
  // Pagination is read-only; edits are strictly confined to the ID created by this run.
  for (let offset = 0; offset < 100 && !(await own.isVisible()); offset += 20) {
    const next = page.getByRole('button', { name: 'Nächste Seite', exact: true });
    if (await next.isDisabled()) break;
    await next.click();
    await until(
      async () => !(await next.isDisabled()) || (await own.isVisible()),
      'live_ui_destination_page_pending',
    );
  }
  await own.click();
  await page.locator('#manager-detail-title').waitFor();
  check(
    (await page.locator('[aria-labelledby="manager-detail-title"]').innerText()).includes(
      fixture.destination,
    ),
    'live_ui_wrong_destination',
  );
  const edit = page.getByRole('button', { name: 'Destination bearbeiten', exact: true });
  await until(
    async () =>
      (await edit.isVisible()) ||
      (await page.getByText(/Diese Verbindung erlaubt nur das Ansehen der Destinations/).isVisible()),
    'live_ui_management_action_missing',
  );
  check(await edit.isVisible(), 'live_ui_management_hint_denied');
  await edit.click();
  await page.getByRole('checkbox', { name: 'Organisationseinheit ändern', exact: true }).check();
  await page.locator('#manager-unit').fill(`${fixture.runName} UI verified`);
  await page.getByRole('button', { name: 'Änderungsvorschau erstellen', exact: true }).click();
  const preview = page.locator('[aria-labelledby="update-preview-title"]');
  await preview
    .getByRole('button', {
      name: 'Diese Änderungen verbindlich in der gewählten Umgebung speichern',
      exact: true,
    })
    .click();
  await preview.getByText('Abgeschlossen', { exact: true }).waitFor();
  console.log(
    'Real desktop UI: owned destination detail, edit preview and explicit contact-field-only update passed',
  );
}
