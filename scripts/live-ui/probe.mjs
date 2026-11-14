import { testReuse } from '../scenario-navigation.mjs';
// Bootstrap diagnosis before any credentials are entered or TEST resources created.
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeFile } from './downloads.mjs';
import {
  openTestPreparation,
  localScannerReady,
  onlineScannerSetup,
  scannerDiagnostics,
} from './local-tools.mjs';
import { acceptanceProxy, configureAcceptanceProxy } from './proxy.mjs';
import { navigate } from './exchange.mjs';
import { reviewSignatureCancellation } from './review-runtime.mjs';
import { createDesktop, check, until } from './desktop.mjs';

const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'fbforge-ui-probe-'));
let desktop, proxy;
const online = process.env.FBFORGE_UI_SCANNER_ONLINE === 'true';
try {
  check(Boolean(process.env.FBFORGE_UI_INSTALLER), 'live_ui_validated_installer_required');
  desktop = await createDesktop(directory, []);
  console.log('Validated installed desktop UI bootstrap passed without credentials or TEST writes');
  await desktop.restartGracefully();
  console.log(
    'Actual native close request, confirmation, shutdown and restart passed without a FIT-Connect session',
  );
  if (online) {
    proxy = await acceptanceProxy();
    await configureAcceptanceProxy(desktop.page, proxy);
    await onlineScannerSetup(desktop, { directory }, false);
    check(proxy.counts.get('github.com') > 0, 'live_ui_scanner_download_bypassed_proxy');
    check(
      (proxy.counts.get('database.clamav.net') || 0) + (proxy.counts.get('cdn.clamav.net') || 0) > 0,
      'live_ui_freshclam_bypassed_proxy',
    );
    console.log('Actual online scanner downloads and FreshClam used the authenticated CONNECT proxy');
  } else {
    await localScannerReady(desktop.page, false);
    await navigate(desktop.page, 'Testwerkzeuge');
    await openTestPreparation(desktop.page);
    await testReuse(desktop.page);
    const exported = await nativeFile(
      desktop,
      { directory },
      () => desktop.page.getByRole('button', { name: 'Testdatei exportieren', exact: true }).click(),
      'native-save-probe.json',
    );
    await until(
      async () =>
        readFile(exported)
          .then(() => true)
          .catch(() => false),
      'live_ui_native_save_probe_missing',
    );
    check(
      JSON.parse(await readFile(exported, 'utf8')).format === 'fbforge-connect-scenario',
      'live_ui_native_save_probe_invalid',
    );
    await desktop.page.getByRole('tab', { name: 'Antwortschemas', exact: true }).click();
    for (const [label, name] of [
      ['JSON-Schema herunterladen', 'probe-schema.json'],
      ['Fiktives Beispiel herunterladen', 'probe-example.json'],
      ['Schemaentwurf speichern', 'probe-draft.json'],
    ]) {
      const path = await nativeFile(
        desktop,
        { directory },
        () => desktop.page.getByRole('button', { name: label, exact: true }).click(),
        name,
      );
      check(Boolean(JSON.parse(await readFile(path, 'utf8'))), 'live_ui_sequential_save_invalid');
    }
    console.log(
      'Real installed desktop native file-save preflight passed with four sequential exports, Downloads default and exact owned output files, without credentials or TEST writes',
    );
    if (process.env.FBFORGE_UI_SCANNER === 'true') await reviewSignatureCancellation(desktop, { directory });
  }
} catch (error) {
  if (online && desktop) {
    await scannerDiagnostics(desktop.page);
    if (proxy) console.error(`Scanner CONNECT hosts: ${JSON.stringify(Object.fromEntries(proxy.counts))}`);
  }
  // This probe never authenticates. Report fixed classifications, not UI text or paths.
  if (!online) {
    const feedback = await desktop?.page
      .locator('.save-feedback')
      .innerText()
      .catch(() => '');
    const outputs = await readdir(join(directory, 'desktop-ui', 'exports')).catch(() => []);
    console.error(
      `Native save preflight: ${JSON.stringify({
        outputFiles: outputs.length,
        expectedBasename: outputs.includes('native-save-probe.json'),
        originalBasename: outputs.includes('testpaket.fctest.json'),
        saveReported: feedback?.includes('Datei gespeichert:') || false,
        savedExpectedName: feedback?.includes('native-save-probe.json') || false,
        savedOriginalName: feedback?.includes('testpaket.fctest.json') || false,
        savedOwnedDirectory: feedback?.includes(join(directory, 'desktop-ui', 'exports')) || false,
        cancelled: feedback?.includes('Speichern abgebrochen.') || false,
        pending: feedback?.includes('Speicherort auswählen') || false,
        error: await desktop?.page
          .locator('.save-feedback.error')
          .count()
          .catch(() => 0),
      })}`,
    );
  }
  console.error(/^live_ui_[a-z_]+$/.test(error.message || '') ? error.message : 'live_ui_bootstrap_failed');
  process.exitCode = 1;
} finally {
  try {
    await desktop?.close();
  } finally {
    await proxy?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
