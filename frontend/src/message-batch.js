import { loadSubmission } from './submissions.js';
import { verifySubmission, verifyReply, listReceivedContents, discardReceived } from './receiving.js';
import { prepareReceipt, executeReceipt, cancelReceipt } from './receipts.js';
import { exportMessage, exportSource } from './message-export.js';
import { withSchemaSourceAccess } from './schema-source-access.js';

const code = (cause) => (typeof cause === 'string' ? cause : cause?.message || 'resource_unavailable');
const check = (current) => {
  if (!current()) throw new Error('content_cancelled');
};

// The export must finish before a receipt is prepared. Uncertain outcomes are never retried.
export async function runMessageBatch(options) {
  const { invoke, session, reply = false, current, onProgress, onOutcome = () => {} } = options;
  const results = [];
  for (const item of options.items) {
    if (!current()) break;
    const row = { ...item, status: 'checking', error: null, saved: null };
    results.push(row);
    onProgress([...results]);
    let proof, prepared;
    try {
      if (!reply) await loadSubmission(invoke, session, options.destinationId, item.submissionId);
      check(current);
      proof = await withSchemaSourceAccess(
        () =>
          reply
            ? verifyReply(
                invoke,
                session,
                item.caseId,
                item.replyId,
                options.schemas(),
                options.allowExternalSchemas(),
              )
            : verifySubmission(
                invoke,
                session,
                options.destinationId,
                item.submissionId,
                options.schemas(),
                options.allowExternalSchemas(),
              ),
        options.requestSchemas,
        current,
      );
      check(current);
      const parts = [];
      for (let offset = 0; offset < proof.partCount; offset += 2) {
        parts.push(...(await listReceivedContents(invoke, session, proof, offset, reply)).parts);
        check(current);
      }
      if (
        parts.length !== proof.partCount ||
        new Set(parts.map((part) => part.contentId)).size !== parts.length ||
        parts.reduce((sum, part) => sum + part.totalBytes, 0) > 64 * 1024 * 1024
      )
        throw new Error('engine_protocol_error');
      row.status = 'saving';
      onProgress([...results]);
      row.saved = await exportMessage(
        invoke,
        session,
        options.exportId,
        exportSource({ ...item, ...proof }, reply),
      );
      if (
        row.saved.fileCount !== parts.length ||
        row.saved.totalBytes !== parts.reduce((sum, part) => sum + part.totalBytes, 0)
      )
        throw new Error('engine_protocol_error');
      check(current);
      row.caseId = proof.caseId;
      if (!options.accept) {
        row.status = 'saved';
        continue;
      }
      const data = parts.find((part) => part.kind === 'data');
      const blocked =
        !['application/json', 'application/xml'].includes(data?.mimeType) ||
        proof.warnings.some(
          (warning) =>
            warning !== 'MALWARE_SCAN_PASSED' &&
            (warning !== 'MALWARE_SCAN_NOT_CONFIGURED' || !options.allowNoScanner),
        );
      if (blocked) {
        row.status = 'manual';
        row.error = 'batch_review_required';
        continue;
      }
      prepared = await prepareReceipt(
        invoke,
        session,
        {
          destinationId: proof.destinationId,
          submissionId: proof.submissionId,
          caseId: proof.caseId,
          action: 'accept',
          signingKid: options.signingKid,
          reason: null,
          description: null,
          attachmentId: null,
        },
        proof,
      );
      check(current);
      row.status = 'accepting';
      onProgress([...results]);
      const outcome = await executeReceipt(invoke, session, prepared.attempt);
      prepared = null;
      onOutcome({ ...outcome, apiVersion: session.apiVersion, sessionId: session.sessionId });
      row.status =
        outcome.status === 'confirmed' ? 'accepted' : outcome.status === 'uncertain' ? 'uncertain' : 'manual';
      row.error = outcome.error;
      if (row.status === 'uncertain') break;
    } catch (cause) {
      row.status = code(cause) === 'content_cancelled' ? 'cancelled' : 'manual';
      row.error = code(cause);
      if (
        row.status === 'cancelled' ||
        [
          'session_missing',
          'engine_disconnected',
          'engine_protocol_error',
          'environment_mismatch',
          'export_failed',
          'export_expired',
        ].includes(row.error)
      )
        break;
    } finally {
      if (prepared) await cancelReceipt(invoke, session, prepared.attempt.attemptId).catch(() => {});
      if (proof) await discardReceived(invoke, session, proof.proofId, reply).catch(() => {});
      onProgress([...results]);
    }
  }
  return results;
}
