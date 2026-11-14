import { testReuse } from '../scenario-navigation.mjs';
// Each series row uses real installed controls and its own confirmed TEST exchange.
import { check, until } from './desktop.mjs';
import { connectProfile, sendSubmission, openSubmission, acceptReceived } from './exchange.mjs';
import { testTools, checkTestStep } from './test-workspace.mjs';
import { resolvePack } from '../../frontend/src/integration/scenarios/data.ts';
const button = (page, name) => page.getByRole('button', { name, exact: true });
export async function reviewExecutedSeries(desktop, fixture, senders, definition, name, savedJson) {
  const page = desktop.page;
  await testReuse(page);
  await button(page, 'Als Testserie planen').click();
  const series = page.locator('section.scenario-series');
  await series
    .getByRole('combobox', { name: 'Gespeicherte Testserie', exact: true })
    .selectOption({ label: `${name} Serie · TEST · 4 Durchläufe` });
  await button(series, 'Testserie öffnen').click();
  for (const api of ['v2', 'v3']) {
    for (const variant of definition.variants) {
      await connectProfile(page, senders[api]);
      const row = series
        .locator('tbody tr')
        .filter({ has: page.getByRole('rowheader', { name: variant.name, exact: true }) })
        .filter({ has: page.getByRole('cell', { name: api, exact: true }) });
      await button(row, 'Durchlauf starten').click();
      const dialog = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
      if (await dialog.isVisible()) await button(dialog, 'Test wechseln').click();
      const request = resolvePack(definition, variant.id).cases[0].request;
      const message = await sendSubmission(page, { ...fixture, request }, api);
      await testTools(page);
      await checkTestStep(page);
      await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === api).id);
      await openSubmission(page, fixture, message);
      await testTools(page);
      await checkTestStep(page);
      await checkTestStep(page);
      await openSubmission(page, fixture, message);
      await acceptReceived(desktop, fixture, message);
      await testTools(page);
      await checkTestStep(page);
      await page.getByText('4 von 4 Schritten automatisch nachgewiesen.', { exact: true }).waitFor();
      await button(page, 'Zur Testserie').click();
      await button(series, 'Prüfstand aktualisieren').click();
      await row.getByText('Erfolgreich', { exact: true }).waitFor();
      console.log(
        `Real installed series row: ${api}, dataset ${definition.variants.indexOf(variant) + 1}, real send/read/compare/receipt passed`,
      );
    }
  }
  const result = await savedJson(
    desktop,
    fixture,
    () => button(series, 'Serienergebnis exportieren').click(),
    'ui-040-series-executed.json',
  );
  check(
    result.rows.length === 4 &&
      result.rows.every((row) => row.status === 'passed') &&
      new Set(result.rows.map((row) => row.runId)).size === 4,
    'live_ui_series_real_results_incomplete',
  );
  await button(page, 'Zum geöffneten Test').click();
  await button(page, 'Test schließen').click();
  await page
    .getByRole('dialog', { name: 'Test schließen?', exact: true })
    .getByRole('button', { name: 'Speichern und schließen', exact: true })
    .click();
  await until(
    async () => !(await page.locator('.scenario-activity').isVisible()),
    'live_ui_closed_test_banner_remains',
  );
}
