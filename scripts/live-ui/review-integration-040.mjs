// Exercise 0.4 authoring and durable results in the installed app, with actual native storage.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, cleanEnvironment, until } from './desktop.mjs';
import { connectProfile, navigate } from './exchange.mjs';
import { nativeFile } from './downloads.mjs';
import { testOverview } from './test-workspace.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function savedJson(desktop, fixture, action, file) {
  const path = await nativeFile(desktop, fixture, action, file);
  await until(
    () =>
      readFile(path).then(
        () => true,
        () => false,
      ),
    'live_ui_040_export_not_written',
  );
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}
export async function reviewProvenRun(desktop, fixture, runId) {
  const page = desktop.page;
  await button(page, 'Ergebnisse').click();
  await button(page, 'Als Referenz festlegen').click();
  await button(page, 'Referenz aufheben').waitFor();
  const copy = button(page, 'Testergebnis fürs Ticket kopieren');
  await copy.click();
  await copy.locator('..').getByText('Testergebnis fürs Ticket kopiert.', { exact: true }).waitFor();
  const clip = spawnSync(
    join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-Clipboard -Raw',
    ],
    { env: cleanEnvironment(), encoding: 'utf8', timeout: 15000, maxBuffer: 65536 },
  );
  check(
    clip.status === 0 &&
      clip.stdout.includes('6 Prüfschritte.') &&
      clip.stdout.includes('Anlagen vollständig.'),
    'live_ui_ticket_clipboard_invalid',
  );
  const result = await savedJson(
    desktop,
    fixture,
    () => button(page, 'Prüfergebnis exportieren').click(),
    'ui-040-proven-result.json',
  );
  check(
    result.version === 2 &&
      result.attempts.length >= 6 &&
      result.attempts.every((a) => a.status === 'passed') &&
      !JSON.stringify(result).includes('base64'),
    'live_ui_proven_result_export_failed',
  );
  await testOverview(page);
  const row = page.locator(`[data-run-id="${runId}"]`);
  check(
    await row.getByRole('button', { name: /^Durchlauf löschen:/ }).isDisabled(),
    'live_ui_reference_delete_unprotected',
  );
  await row.getByRole('button', { name: /^Durchlauf öffnen:/ }).click();
  const replace = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
  if (await replace.isVisible())
    await replace.getByRole('button', { name: 'Test wechseln', exact: true }).click();
  await button(page, 'Ergebnisse').click();
  await button(page, 'Referenz aufheben').click();
  await button(page, 'Als Referenz festlegen').waitFor();
  console.log(
    'Real installed desktop: successful real round trip pinned as a protected reference, deletion refused, ticket text present in actual Windows clipboard and versioned result export verified',
  );
}
export async function reviewIntegrationAuthoring(desktop, fixture, senders) {
  let page = desktop.page;
  await connectProfile(page, senders.v3);
  await testOverview(page);
  await page.getByRole('combobox', { name: 'Testvorlage', exact: true }).selectOption('accept');
  await button(page, 'Test vorbereiten').click();
  const replace = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
  if (await replace.isVisible())
    await replace.getByRole('button', { name: 'Test wechseln', exact: true }).click();
  const name = `${fixture.runName} variable Daten`;
  await page.getByLabel('Testname', { exact: true }).fill(name);
  await page.getByLabel('Empfangs-Destination', { exact: true }).fill(fixture.destination);
  await page
    .getByLabel('Fachdaten', { exact: true })
    .fill(JSON.stringify({ referenz: 'fiktive-basis', status: 'eingegangen' }));
  await page.getByText('Variable Angaben und Datensätze', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Feld für variable Angabe', exact: true })
    .selectOption('/referenz');
  await button(page, 'Variable Angabe hinzufügen').click();
  await page.getByLabel('Bezeichnung der variablen Angabe', { exact: true }).fill('Fiktive Referenz');
  await page.getByLabel('Standardwert', { exact: true }).fill('fiktiver-standard');
  await button(page, 'Datensatz hinzufügen').click();
  await page.getByLabel('Datensatzname', { exact: true }).nth(1).fill('Zweite Gegenprobe');
  await page.getByLabel('Fiktive Referenz', { exact: true }).nth(1).fill('fiktiver-zweiter-wert');
  await page.getByText('Prüferwartungen anpassen', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Inhaltsvergleich', exact: true })
    .selectOption('field-exceptions');
  await page.getByRole('combobox', { name: 'Feld für Erwartung', exact: true }).selectOption('/status');
  await button(page, 'Erwartung hinzufügen').click();
  await page.getByRole('combobox', { name: 'Bedingung', exact: true }).selectOption('present');
  const definition = await savedJson(
    desktop,
    fixture,
    () => button(page, 'Testdatei exportieren').click(),
    'ui-040-definition.json',
  );
  check(
    definition.name === name &&
      definition.variants.length === 2 &&
      definition.variables.length === 1 &&
      definition.rules[0].operator === 'present' &&
      definition.comparison === 'field-exceptions',
    'live_ui_040_authoring_export_invalid',
  );
  await button(page, 'Test speichern').click();
  await page
    .getByText('Test dauerhaft für Ihr Windows-Benutzerkonto gespeichert.', { exact: true })
    .waitFor();
  await button(page, 'Als Testserie planen').click();
  let series = page.locator('section.scenario-series');
  await series.getByRole('checkbox', { name: 'Zweite Gegenprobe', exact: true }).check();
  await series.getByRole('checkbox', { name: 'API v2', exact: true }).check();
  await series.getByRole('checkbox', { name: 'API v3', exact: true }).check();
  await series.getByLabel('Name der Testserie', { exact: true }).fill(`${name} Serie`);
  await button(series, 'Testserie anlegen').click();
  await until(
    async () => (await series.locator('tbody tr').count()) === 4,
    'live_ui_040_series_dimensions_invalid',
  );
  const exported = await savedJson(
    desktop,
    fixture,
    () => button(series, 'Serienergebnis exportieren').click(),
    'ui-040-series.json',
  );
  check(
    exported.rows.length === 4 && exported.rows.every((row) => row.status === 'not_started'),
    'live_ui_040_series_claims_unrun_success',
  );
  await desktop.restartGracefully();
  page = desktop.page;
  await connectProfile(page, senders.v3);
  await testOverview(page);
  const saved = page
    .locator('[data-test-entry-id]')
    .filter({ has: page.getByRole('button', { name: `Test öffnen: ${name}`, exact: true }) });
  await saved.getByRole('button', { name: `Test öffnen: ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
  if (await dialog.isVisible())
    await dialog.getByRole('button', { name: 'Test wechseln', exact: true }).click();
  const restored = await savedJson(
    desktop,
    fixture,
    () => button(page, 'Testdatei exportieren').click(),
    'ui-040-definition-after-restart.json',
  );
  check(JSON.stringify(restored) === JSON.stringify(definition), 'live_ui_040_definition_restart_changed');
  await navigate(page, 'Testwerkzeuge');
  console.log(
    'Real installed desktop: variables, two datasets, full comparison with field condition, definition export and restart durability, four-row v2/v3 series and honest not-started result export passed',
  );
}
