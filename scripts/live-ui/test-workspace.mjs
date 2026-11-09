// Drive the common test workspace through its actual controls.
import { check, until } from './desktop.mjs';
import { navigate } from './exchange.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });

export async function testTools(page) {
  await navigate(page, 'Testwerkzeuge');
  await page.getByRole('tab', { name: 'Tests', exact: true }).click();
}
export async function testOverview(page) {
  await testTools(page);
  const back = button(page, 'Zur Testübersicht');
  if (await back.isVisible()) await back.click();
  await page.getByRole('heading', { name: 'Neuen Test vorbereiten', exact: true }).waitFor();
}
export async function openStoredTest(page, kind, name) {
  await testOverview(page);
  const row = page.locator(`[data-test-entry-id^="${kind}:"]`).filter({
    has: page.getByRole('button', { name: `Test öffnen: ${name}`, exact: true }),
  });
  await row.getByRole('button', { name: `Test öffnen: ${name}`, exact: true }).click();
  const replace = page.getByRole('dialog', { name: 'Anderen Test öffnen?', exact: true });
  if (await replace.isVisible()) await button(replace, 'Test wechseln').click();
  await page.getByRole('textbox', { name: 'Testname', exact: true }).waitFor();
}
export async function checkTestStep(page) {
  const refresh = button(page, 'Nachweise aktualisieren');
  const ready = () =>
    until(
      async () => (await refresh.count()) === 0 || !(await refresh.isDisabled()),
      'live_ui_flow_check_pending',
    );
  await refresh.click();
  await ready();
  const receipt = button(page, 'Empfangsbestätigung nachweisen');
  if (await receipt.isVisible()) {
    await receipt.click();
    await ready();
    return;
  }
  const choice = page.getByRole('combobox', { name: 'Nachricht für diesen Testschritt', exact: true });
  await choice.waitFor();
  const options = choice.locator('option:not([value=""])');
  check((await options.count()) === 1, 'live_ui_flow_evidence_ambiguous');
  await choice.selectOption(await options.first().getAttribute('value'));
  await button(page, 'Ausgewählte Nachricht prüfen').click();
  await ready();
}
