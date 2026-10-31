// Live runtime operations on the isolated installed app and owned TEST destination only.
import { check, until } from './desktop.mjs';
import { navigate, connectProfile, sendSubmission, openSubmission, replyAndAccept } from './exchange.mjs';
import { receiveReply } from './readback.mjs';
import { nativeSignatureUpdate } from './downloads.mjs';
import { returnToInbox } from './inbox.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });
export async function reviewProcessAndInbox(desktop, fixture, senders) {
  const page = desktop.page;
  await connectProfile(page, senders.v3);
  const message = await sendSubmission(page, fixture, 'v3', false, false, true);
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await navigate(page, 'Empfangen');
  await page.getByRole('tab', { name: 'Einreichungen', exact: true }).click();
  await returnToInbox(page);
  await page.locator('#pickup-destination').fill(fixture.destination);
  await page.locator('#pickup-submission').fill('');
  await button(page, 'Einreichungen laden').click();
  const owned = page.getByRole('checkbox', {
    name: `Einreichung ${message.submissionId} auswählen`,
    exact: true,
  });
  await owned.waitFor();
  await button(page, 'Alter aus Event Logs laden').click();
  await until(
    async () => !(await button(page, 'Alter aus Event Logs laden').isDisabled()),
    'live_ui_inbox_age_pending',
  );
  const row = page.locator('tr').filter({ has: owned });
  check(!(await row.innerText()).includes('Zeitpunkt unbekannt'), 'live_ui_signed_inbox_age_unknown');
  await page.getByRole('combobox', { name: 'Alter auf dieser Seite', exact: true }).selectOption('9');
  check(!(await owned.isVisible()), 'live_ui_new_submission_wrongly_old');
  await page.getByRole('combobox', { name: 'Alter auf dieser Seite', exact: true }).selectOption('all');
  await page.getByRole('checkbox', { name: 'Älteste zuerst (diese Seite)', exact: true }).check();
  await owned.waitFor();
  await openSubmission(page, fixture, message);
  await page.getByText('Prozessnachricht:', { exact: false }).first().waitFor();
  await replyAndAccept(desktop, fixture, message);
  await connectProfile(page, senders.v3);
  await receiveReply(desktop, fixture, message);
  console.log(
    'Real desktop UI: v3 process-addressed send, real signed inbox ages, age filter and oldest-first view, process metadata, reply and acknowledgements passed',
  );
}
export async function reviewShortcuts(page, fixture) {
  await navigate(page, 'Senden');
  const target = page.locator('#send-target');
  const next = button(page, 'Nächsten Test vorbereiten');
  if (await next.isVisible()) {
    await next.click();
    const dialog = page.getByRole('dialog', { name: 'Nächsten Test vorbereiten?', exact: true });
    for (const input of await dialog.getByRole('checkbox').all()) await input.uncheck();
    await dialog.getByRole('button', { name: 'Neuen Entwurf beginnen', exact: true }).click();
  }
  await target.fill(fixture.destination);
  const mark = button(page, 'Als Favorit merken');
  if (await mark.isVisible()) await mark.click();
  await button(page, 'Aus Favoriten entfernen').waitFor();
}
export async function reviewRuntime(desktop, fixture) {
  const page = desktop.page;
  await navigate(page, 'Info');
  const updates = page.locator('.application-updates');
  const search = updates.getByRole('button', { name: 'Nach Updates suchen', exact: true });
  await until(async () => !(await search.isDisabled()), 'live_ui_update_check_busy');
  await search.click();
  await until(async () => !(await search.isDisabled()), 'live_ui_update_check_stuck', 90000);
  const codes = await updates.locator('code').allTextContents();
  if (codes.length) {
    check(
      codes.every((code) => code.trim() === 'update_feed_unavailable'),
      'live_ui_update_check_unexpected_failure',
    );
    console.log(
      'Real desktop UI: actual GitHub update check correctly reported the unavailable release feed, without offering an unchecked installation',
    );
  } else console.log('Real desktop UI: actual GitHub update check completed');
  if (process.env.FBFORGE_UI_SCANNER !== 'true') return;
  await navigate(page, 'Virenscan');
  await page.getByText('Scanner bereit', { exact: true }).waitFor();
  await nativeSignatureUpdate(desktop, fixture, () => button(page, 'Signaturen aktualisieren').click());
  const progress = page.getByRole('progressbar', { name: 'Scanner-Aktionsfortschritt', exact: true });
  if (await progress.isVisible()) {
    await navigate(page, 'Senden');
    await page.locator('#send-target').waitFor();
    await until(
      async () => !(await page.locator('#send-target').isDisabled()),
      'live_ui_signature_update_blocked_sender',
    );
    await navigate(page, 'Virenscan');
    const cancel = button(page, 'Vorgang abbrechen');
    const cancelled = await cancel.isVisible();
    if (cancelled) await cancel.click();
    await until(async () => !(await progress.isVisible()), 'live_ui_signature_cancel_stuck', 90000);
    console.log(
      cancelled
        ? 'Real desktop UI: actual FreshClam operation allowed navigation and editing, retained progress after returning and accepted cancellation'
        : 'Real desktop UI: actual FreshClam operation allowed navigation and editing and completed while changing workspaces',
    );
  } else
    console.log('Real desktop UI: actual FreshClam operation completed before an interruption was needed');
  await page.getByText('Scanner bereit', { exact: true }).waitFor({ timeout: 90000 });
  console.log('Real desktop UI: local scanner returned to readiness with a verified signature database');
}
