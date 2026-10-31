// Bootstrap diagnosis before any credentials are entered or TEST resources created.
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeFile } from './downloads.mjs';
import { openTestPackage } from './local-tools.mjs';
import { navigate } from './exchange.mjs';
import { createDesktop, check, until } from './desktop.mjs';
const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'fbforge-ui-probe-'));
let desktop;
try {
  check(Boolean(process.env.FBFORGE_UI_INSTALLER), 'live_ui_validated_installer_required');
  desktop = await createDesktop(directory, []);
  console.log('Validated installed desktop UI bootstrap passed without credentials or TEST writes');
  await navigate(desktop.page, 'Testwerkzeuge');
  await openTestPackage(desktop.page);
  const exported = await nativeFile(
    desktop,
    { directory },
    () => desktop.page.getByRole('button', { name: 'Testpaket exportieren', exact: true }).click(),
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
    JSON.parse(await readFile(exported, 'utf8')).format === 'fbforge-connect-testpack',
    'live_ui_native_save_probe_invalid',
  );
  await desktop.page.getByRole('button', { name: 'Antwortschemas', exact: true }).click();
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
} catch (error) {
  // This probe never authenticates. Report fixed classifications, not UI text or paths.
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
  console.error(/^live_ui_[a-z_]+$/.test(error.message || '') ? error.message : 'live_ui_bootstrap_failed');
  process.exitCode = 1;
} finally {
  await desktop?.close();
  await rm(directory, { recursive: true, force: true });
}
