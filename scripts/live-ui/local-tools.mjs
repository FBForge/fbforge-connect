import { nativeScannerInstall, nativeScannerReview } from './downloads.mjs';
import { isDeepStrictEqual } from 'node:util';
import { navigate } from './exchange.mjs';
import { check, until } from './desktop.mjs';
import { writeFile, readFile, stat, statfs } from 'node:fs/promises';
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

export async function scannerDiagnostics(page) {
  // Read the actual native status, never replace the IPC boundary or expose paths.
  const state = await page
    .evaluate(async () => {
      try {
        const value = await window.__TAURI_INTERNALS__.invoke('local_scanner_status');
        return {
          installed: value.installed === true,
          enabled: value.enabled === true,
          ready: value.ready === true,
          busy: value.busy === true,
          operation: /^[a-z-]*$/.test(value.operation) ? value.operation : 'unknown',
          error:
            value.error === null
              ? null
              : /^(scanner_[a-z_]+|content_cancelled)$/.test(value.error)
                ? value.error
                : 'unknown',
        };
      } catch {
        return { statusUnavailable: true };
      }
    })
    .catch(() => ({ statusUnavailable: true }));
  const selected = await page
    .getByRole('combobox', { name: 'Verfahren', exact: true })
    .inputValue()
    .catch(() => 'unavailable');
  const root = join(process.env.LOCALAPPDATA, 'org.fitconnect.integration-client', 'scanner');
  const archive = await stat(join(root, 'engine-download.zip')).catch(() => null);
  const disk = await statfs(root).catch(() => null);
  console.error(
    `Actual native scanner diagnostics: ${JSON.stringify({
      ...state,
      interruptedArchiveBytes: archive?.isFile() ? archive.size : null,
      freeBytes: disk ? disk.bavail * disk.bsize : null,
      procedure: ['off', 'local', 'clamav', 'icap'].includes(selected) ? selected : 'unavailable',
      componentVisible: await page
        .getByRole('heading', { name: 'Lokaler ClamAV', exact: true })
        .isVisible()
        .catch(() => false),
    })}`,
  );
  return state;
}
export async function localScannerReady(page, connected = true) {
  if (process.env.FBFORGE_UI_SCANNER !== 'true') return;
  await navigate(page, 'Virenscan');
  try {
    await until(
      async () => {
        if (await page.locator('[aria-labelledby="local-scanner-title"] [role="alert"]').count())
          throw new Error('live_ui_local_scanner_startup_error');
        const ready = await page.getByText('Scanner läuft lokal', { exact: true }).count();
        const selected =
          !connected || (await page.getByText('Aktiv: Lokaler ClamAV', { exact: true }).count()) === 1;
        return ready === 1 && selected;
      },
      'live_ui_local_scanner_not_selected',
      240000,
    );
  } catch (error) {
    await scannerDiagnostics(page);
    throw error;
  }
  console.log(
    connected
      ? 'Real installed desktop: optional local ClamAV adopted offline, ready and active before TEST sends and receives'
      : 'Real installed desktop: optional local ClamAV adopted offline and ready without a FIT-Connect session',
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

export async function openTestPackage(page) {
  await page.getByRole('button', { name: 'Testfälle und Abläufe', exact: true }).click();
  await page.getByRole('button', { name: 'Testpakete', exact: true }).click();
  await page.getByRole('button', { name: 'Fiktives Testpaket öffnen', exact: true }).click();
  await page.locator('#test-case-choice').waitFor();
  check((await page.locator('#test-case-choice option').count()) > 0, 'live_ui_test_pack_empty');
}

export async function localTools(page) {
  await navigate(page, 'Testwerkzeuge');
  await openTestPackage(page);
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
  await navigate(page, 'Einstellungen');
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
  check(
    (await page.getByRole('checkbox', { name: 'Organisationseinheit ändern', exact: true }).count()) === 0,
    'live_ui_single_edit_still_bulk',
  );
  const before = await fixture.readOwnedDestination?.();
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
  if (before) {
    const after = await fixture.readOwnedDestination();
    const oldContact = JSON.parse(before.contactJson),
      newContact = JSON.parse(after.contactJson);
    check(newContact.unit === `${fixture.runName} UI verified`, 'live_ui_contact_update_not_persisted');
    delete oldContact.unit;
    delete newContact.unit;
    check(
      isDeepStrictEqual(oldContact, newContact) &&
        before.name === after.name &&
        before.status === after.status &&
        JSON.stringify(before.metadataVersions) === JSON.stringify(after.metadataVersions) &&
        isDeepStrictEqual(JSON.parse(before.offersJson), JSON.parse(after.offersJson)),
      'live_ui_single_edit_changed_other_fields',
    );
  }
  console.log(
    'Real desktop UI: owned destination detail, edit preview and explicit contact-field-only update passed',
  );
}

export async function selectLocalScanner(page) {
  await page.getByRole('combobox', { name: 'Verfahren', exact: true }).selectOption('local');
  await page.getByRole('heading', { name: 'Lokaler ClamAV', exact: true }).waitFor();
}

export async function onlineScannerSetup(desktop, fixture, connected = true) {
  if (process.env.FBFORGE_UI_SCANNER_ONLINE !== 'true') return;
  const { page } = desktop;
  await navigate(page, 'Virenscan');
  if (connected) await selectLocalScanner(page);
  const install = page.getByRole('button', { name: 'Scanner online einrichten', exact: true });
  await nativeScannerInstall(desktop, fixture, () => install.click());
  await until(
    async () => {
      const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('local_scanner_status'));
      if (!status.busy && status.error) {
        await scannerDiagnostics(page);
        throw new Error('live_ui_online_scanner_initial_setup_failed');
      }
      return status.busy;
    },
    'live_ui_online_scanner_initial_setup_not_started',
    30000,
  );
  await page.getByRole('button', { name: 'Vorgang abbrechen', exact: true }).click();
  await until(async () => !(await install.isDisabled()), 'live_ui_online_scanner_cancel_stuck', 30000);
  // Reproduce a cancelled download whose Windows cleanup was delayed by a file lock.
  // This runner owns the fresh scanner root. Never replace an existing archive.
  const interruptedArchive = join(
    process.env.LOCALAPPDATA,
    'org.fitconnect.integration-client',
    'scanner',
    'engine-download.zip',
  );
  await writeFile(interruptedArchive, 'Interrupted public component test download', { flag: 'wx' }).catch(
    (error) => {
      if (error.code !== 'EEXIST') throw error;
    },
  );
  await nativeScannerInstall(desktop, fixture, () => install.click());
  await until(
    async () => {
      const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('local_scanner_status'));
      if (!status.busy && status.error) {
        await scannerDiagnostics(page);
        throw new Error('live_ui_online_scanner_setup_failed');
      }
      return status.installed && !status.busy;
    },
    'live_ui_online_scanner_setup_timeout',
    360000,
  );
  if (!connected) {
    console.log(
      'Real desktop UI: clean online component setup, cancellation and retry passed without a FIT-Connect session',
    );
    return;
  }
  await page.getByRole('combobox', { name: 'Verfahren', exact: true }).selectOption('local');
  await nativeScannerReview(desktop, fixture, () =>
    page.getByRole('button', { name: 'Scanner-Einstellung anwenden', exact: true }).click(),
  );
  console.log(
    'Real desktop UI: clean online scanner setup, explicit cancellation and retry despite an interrupted archive passed',
  );
}
