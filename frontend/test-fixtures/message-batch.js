export const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
export async function openBatch(page, { replies = false, total = 3 } = {}) {
  await page.goto(
    `http://127.0.0.1:1420/test-fixtures/application-view.html?browser=1${replies ? '&replies=1' : ''}`,
  );
  await page.evaluate(
    ({ total }) => {
      const original = window.__TAURI_INTERNALS__.invoke;
      const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
      const state = (window.__batchFixture = {
        total,
        calls: [],
        writes: [],
        saves: [],
        failSave: false,
        cancelFolder: false,
        schemaError: null,
        uncertain: false,
        delaySave: false,
        releaseSave: null,
        receipt: null,
      });
      let current;
      const envelope = (args, data) => ({
        apiVersion: args.apiVersion,
        sessionId: args.sessionId,
        environment: 'TEST',
        data,
      });
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        state.calls.push({ command, ...args });
        if (command === 'begin_message_export')
          return state.cancelFolder
            ? null
            : { exportId: 'export-0000000000000001', directory: 'C:\\Fiktiver Export' };
        if (command === 'finish_message_export') return null;
        if (command === 'export_message') {
          if (state.delaySave) await new Promise((resolve) => (state.releaseSave = resolve));
          if (state.failSave) throw 'export_failed';
          state.saves.push(args.source);
          const inventory = await original('list_received_contents', {
            ...args,
            proofId: uuid(9),
            offset: 0,
          });
          const rest = await original('list_received_contents', { ...args, proofId: uuid(9), offset: 2 });
          const totalBytes = [...inventory.data.parts, ...rest.data.parts].reduce(
            (sum, part) => sum + part.totalBytes,
            0,
          );
          return { directory: `C:\\Fiktiver Export\\${args.source.messageId}`, fileCount: 3, totalBytes };
        }
        if (command === 'list_submissions' || command === 'list_replies') {
          const rows = Array.from({ length: state.total }, (_, i) =>
            command === 'list_submissions'
              ? { destinationId: args.destinationId, submissionId: uuid(3 + i), caseId: uuid(70 + i) }
              : { replyId: uuid(3 + i), caseId: uuid(70 + i) },
          );
          return envelope(args, {
            offset: args.offset,
            totalCount: state.total,
            [command === 'list_submissions' ? 'submissions' : 'replies']: rows.slice(
              args.offset,
              args.offset + 20,
            ),
          });
        }
        if (command === 'loaded_keys')
          return envelope(args, {
            keys: [{ destinationId: uuid(2), kid: 'synthetic-sign-key', purpose: 'sign' }],
          });
        if (command === 'load_submission') {
          const result = await original(command, args);
          result.data.submissionId = args.submissionId;
          result.data.caseId = uuid(70 + Number(args.submissionId.slice(0, 8)) - 3);
          return result;
        }
        if (command === 'verify_submission' || command === 'verify_reply') {
          current = args.submissionId || args.replyId;
          if (current === state.schemaError) throw 'data_schema_invalid';
          const result =
            command === 'verify_submission'
              ? await original(command, args)
              : envelope(args, {
                  proofId: uuid(9),
                  replyId: args.replyId,
                  caseId: args.caseId,
                  channelAttemptId: uuid(20),
                  senderDestinationId: uuid(2),
                  partCount: 3,
                  warningCount: 1,
                  warnings: ['MALWARE_SCAN_NOT_CONFIGURED'],
                });
          if (command === 'verify_submission') {
            result.data.submissionId = current;
            result.data.caseId = uuid(70 + Number(current.slice(0, 8)) - 3);
          }
          return result;
        }
        if (command === 'list_received_reply_contents') return original('list_received_contents', args);
        if (command === 'read_received_reply_content') return original('read_received_content', args);
        if (command === 'read_received_reply_schema') return original('read_received_schema', args);
        if (command === 'discard_received_reply') return original('discard_received', args);
        if (command === 'receipt_state')
          return envelope(
            args,
            state.receipt || {
              attemptId: null,
              status: 'idle',
              action: null,
              destinationId: null,
              submissionId: null,
              caseId: null,
              signingKid: null,
              error: null,
            },
          );
        if (command === 'prepare_receipt') {
          const draft = JSON.parse(args.receiptDocument);
          state.receipt = {
            attemptId: uuid(90 + state.writes.length),
            status: 'prepared',
            action: 'accept',
            destinationId: draft.destinationId,
            submissionId: draft.submissionId,
            caseId: draft.caseId,
            signingKid: draft.signingKid,
            error: null,
          };
          return envelope(args, {
            attempt: { ...state.receipt },
            reason: null,
            description: null,
            attachmentId: null,
            warnings: ['MALWARE_SCAN_NOT_CONFIGURED'],
          });
        }
        if (command === 'execute_receipt') {
          state.writes.push(current);
          state.receipt.status = state.uncertain ? 'uncertain' : 'confirmed';
          state.receipt.error = state.uncertain ? 'resource_unavailable' : null;
          return envelope(args, { ...state.receipt });
        }
        if (command === 'cancel_receipt') {
          state.receipt.status = 'cancelled';
          return envelope(args, { ...state.receipt });
        }
        return original(command, args);
      };
    },
    { total },
  );
  if (replies) await page.getByRole('button', { name: 'Antworten laden', exact: true }).click();
  else {
    await page.locator('#pickup-destination').fill(id(2));
    await page.getByRole('button', { name: 'Einreichungen laden', exact: true }).click();
  }
}
