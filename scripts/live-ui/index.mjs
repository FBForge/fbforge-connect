// Optional real UI acceptance, always coupled to the isolated live TEST fixture.
import { createDesktop, check } from './desktop.mjs';
import {
  loginSender,
  senderProfileId,
  sendSubmission,
  connectProfile,
  openSubmission,
  replyAndAccept,
  otherAreas,
  switchApi,
} from './exchange.mjs';
import {
  receiveReply,
  rejectInvalid,
  acceptInvalid,
  caseWorkspace,
  bulkReceive,
  previewPdf,
} from './readback.mjs';
import { localTools, ownDestination, keySetup, auditScreen } from './local-tools.mjs';
import { downloadMessage } from './downloads.mjs';
import { diagnosticCode } from '../../frontend/src/diagnostics.js';

export async function exerciseDesktopUI(fixture) {
  let desktop,
    stage = 'installation';
  try {
    desktop = await createDesktop(fixture.directory, fixture.receiverProfiles);
    const { page } = desktop;
    stage = 'sender_login';
    await loginSender(page);
    const senders = { v3: await senderProfileId(page) };
    stage = 'sender_api_switch';
    await switchApi(page, 'v2');
    senders.v2 = await senderProfileId(page, 'v2');
    await switchApi(page, 'v3');
    check(
      (await page.locator('.connection-button').innerText()).includes('Verbunden'),
      'live_ui_api_switch_failed',
    );
    console.log('Real desktop UI: v2/v3 switch with actual credentials and no re-entry passed');
    for (const api of ['v3', 'v2']) {
      stage = `${api}_sender_profile`;
      await connectProfile(page, senders[api]);
      stage = `${api}_json_send`;
      const message = await sendSubmission(page, fixture, api);
      stage = `${api}_receiver_profile`;
      await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === api).id);
      stage = `${api}_private_key_import`;
      await keySetup(page, fixture, api);
      stage = `${api}_json_receive`;
      await openSubmission(page, fixture, message);
      if (api === 'v3') {
        stage = 'received_screen_accessibility';
        await auditScreen(page);
        stage = 'transferred_pdf_preview';
        await previewPdf(page);
        stage = 'submission_download';
        await downloadMessage(desktop, fixture, message);
      }
      stage = `${api}_reply_accept_event_log`;
      await replyAndAccept(desktop, fixture, message, api === 'v2');
      stage = `${api}_sender_restore_reply_receive`;
      await connectProfile(page, senders[api]);
      await receiveReply(desktop, fixture, message, api === 'v3');
      stage = `${api}_local_case`;
      await caseWorkspace(page, message);
    }
    stage = 'bulk_fixture_send';
    await connectProfile(page, senders.v3);
    const valid = await sendSubmission(page, fixture);
    const invalid = await sendSubmission(page, fixture, 'v3', false, true);
    const manual = await sendSubmission(page, fixture, 'v3', false, true);
    await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
    stage = 'bulk_schema_safety';
    await bulkReceive(desktop, fixture, valid, invalid);
    stage = 'schema_failure_manual_acceptance';
    await acceptInvalid(desktop, fixture, manual);
    stage = 'schema_failure_manual_rejection';
    await rejectInvalid(page, fixture, invalid);
    stage = 'destination_management';
    await ownDestination(page, fixture);
    stage = 'local_tools';
    await localTools(page);
    await auditScreen(page);
    stage = 'workspaces';
    await otherAreas(page);
    console.log(
      `Real installed desktop UI acceptance completed; candidate source ${process.env.FBFORGE_UI_SOURCE_SHA}`,
    );
  } catch (error) {
    if (desktop) {
      const values = await desktop.page
        .locator('[aria-labelledby="event-log-title"] .small-note code, .action-notice:visible code')
        .allTextContents()
        .catch(() => []);
      const codes = [
        ...new Set(
          values.map((value) => diagnosticCode(value.trim())).filter((code) => code !== 'unknown_error'),
        ),
      ];
      if (codes.length) console.error(`Real desktop UI diagnostic codes: ${codes.join(', ')}`);
    }
    // Only fixed source locations, never Playwright's argument values or page contents.
    const location =
      /live-ui[\\/](?:exchange|desktop|index|readback|downloads|local-tools)\.mjs:\d+:\d+/.exec(
        error.stack || '',
      )?.[0];
    const diagnostic = /^live_ui_[a-z_]+$/.test(error.message || '') ? error.message : 'ui_driver_error';
    console.error(`Real desktop UI failed at ${stage}; ${diagnostic}; ${location || 'no source location'}`);
    throw new Error(`live_ui_${stage}_failed`);
  } finally {
    await desktop?.close();
  }
}
