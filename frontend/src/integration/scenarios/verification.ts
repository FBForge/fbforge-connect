import { expectedMessage, scopeFor, replyKey } from './messages.ts';
import { uuid } from './model.ts';
import { caseParts, readCaseFile } from '../../cases.js';
import { profileStatus } from '../../profiles.ts';
import { loadCaseEventLog, listEventLog, readEventDocument, discardEventLog } from '../../event-log.js';
import { listSubmissions } from '../../submissions.js';
import { listReplies } from '../../replies.js';
import { checkMessage } from './expectations.ts';
import { referenceMessage } from './references.ts';
import type { NativeInvoke, Session } from '../../contracts.d.ts';
import type { Run, Step, CaseRecord } from './types.ts';

export async function requireContext(invoke: NativeInvoke, session: Session, run: Run, step: Step) {
  if (session.environment !== run.environment || session.apiVersion !== run.assignment.apiVersion)
    throw new Error('scenario_context_changed');
  const side = step.external ? 'sender' : step.side,
    profileId = run.assignment[`${side}ProfileId`];
  if (profileId && (await profileStatus(invoke, session.sessionId)).profileId !== profileId)
    throw new Error('scenario_context_changed');
}
export function candidates(records: CaseRecord[], run: Run, step: Step) {
  const binding = run.bindings.find((b) => b.testCaseId === step.caseId),
    reply = ['reply', 'check_reply'].includes(step.type),
    received = ['receive', 'compare', 'check_reply'].includes(step.type);
  const replyBinding = run.replyBindings?.find((b) => b.messageId === replyKey(step));
  return records.filter(
    (r) =>
      r.available !== false &&
      uuid(r.caseId) &&
      (reply ? uuid(r.replyId) : uuid(r.submissionId)) &&
      Date.parse(r.createdAt) >= Date.parse(run.startedAt) &&
      ['sent', 'verified', 'accepted', 'rejected', 'confirmed'].includes(r.status) &&
      r.kind === (reply ? 'reply' : 'submission') &&
      r.direction === (received ? 'received' : 'sent') &&
      (!run.definition.sharedCase || !run.bindings.length || r.caseId === run.bindings[0].caseId) &&
      !run.bindings.some(
        (b) =>
          b.testCaseId !== step.caseId &&
          (reply
            ? b.replyId && r.replyId === b.replyId
            : b.submissionId && r.submissionId === b.submissionId),
      ) &&
      (!reply ||
        !run.replyBindings?.some((b) => b.messageId !== replyKey(step) && b.replyId === r.replyId)) &&
      (!replyBinding || r.replyId === replyBinding.replyId) &&
      (!binding ||
        (r.caseId === binding.caseId &&
          (reply
            ? step.followupId || !binding.replyId || r.replyId === binding.replyId
            : !binding.submissionId || r.submissionId === binding.submissionId))) &&
      (!run.assignment.receiverDestination ||
        reply ||
        r.destinationId === run.assignment.receiverDestination),
  );
}
export async function receiptEvidence(
  invoke: NativeInvoke,
  session: Session,
  run: Run,
  step: Step,
  current: () => boolean,
) {
  const binding = run.bindings.find((b) => b.testCaseId === step.caseId),
    item = run.pack.cases.find((c) => c.id === step.caseId);
  if (!binding || !item)
    return { passed: false, detail: 'Zuerst die Einreichung eindeutig diesem Test zuordnen.' };
  let summary;
  try {
    summary = await loadCaseEventLog(invoke, session, binding.caseId);
    if (summary.total > 100) throw new Error('content_limit');
    const suffix = `${item.receipt === 'accept' ? 'accept' : 'reject'}-submission`;
    for (let offset = 0; offset < summary.total; offset += 5) {
      if (!current()) throw new Error('content_cancelled');
      const page = await listEventLog(invoke, session, summary, offset);
      for (const event of page.events) {
        if (
          event.subjectId !== binding.submissionId ||
          !event.eventType.endsWith('/' + suffix) ||
          Date.parse(event.issuedAt) < Math.floor(Date.parse(run.startedAt) / 1000) * 1000
        )
          continue;
        if (run.definition.expectedProblem) {
          const raw = await readEventDocument(invoke, session, summary.logId, event, 'claims');
          if (typeof raw !== 'string') throw new Error('scenario_invalid');
          const value = JSON.parse(raw).events?.[event.eventType];
          if (
            !Array.isArray(value?.problems) ||
            !value.problems.some((p: { type?: string }) => p?.type === run.definition.expectedProblem)
          )
            return { passed: false, detail: 'Empfangsbestätigung gefunden. Der erwartete Problemtyp fehlt.' };
        }
        return {
          passed: true,
          detail: 'Erwartete Empfangsbestätigung anhand des verifizierten Event Logs nachgewiesen.',
        };
      }
    }
    return {
      passed: false,
      detail: 'Die erwartete Empfangsbestätigung ist im abgerufenen Event Log noch nicht nachgewiesen.',
    };
  } finally {
    if (summary) await discardEventLog(invoke, session, summary.logId).catch(() => {});
  }
}
export async function verifyRecord(
  invoke: NativeInvoke,
  session: Session,
  run: Run,
  step: Step,
  record: CaseRecord,
  current: () => boolean,
) {
  if (!candidates([record], run, step).length) throw new Error('scenario_context_changed');
  const item = run.pack.cases.find((c) => c.id === step.caseId)!,
    expected = expectedMessage(run, step);
  if (!expected) throw new Error('scenario_invalid');
  const parts = await caseParts(invoke, session, record.recordId);
  if (!parts) throw new Error('scenario_invalid');
  const data = parts.find((p) => p.kind === 'data');
  if (!data || data.totalBytes > 512 * 1024 || data.mimeType !== expected.mimeType)
    return {
      passed: false,
      detail: 'Fachdaten fehlen, sind zu groß oder haben einen anderen Dateityp.',
      differences: [],
    };
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readCaseFile(invoke, session, record.recordId, data);
    const differences = checkMessage(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      expected,
      run.definition,
      item.id,
      scopeFor(step),
      referenceMessage(run, item.id),
    );
    if (differences.length)
      return { passed: false, detail: 'Die Fachdaten erfüllen die Erwartungen nicht.', differences };
    if (parts.filter((p) => p.kind === 'attachment').length !== expected.attachments.length)
      return {
        passed: false,
        detail: 'Die Anzahl der Anlagen weicht ab.',
        differences: [
          {
            path: 'Anlagen / Anzahl',
            expected: String(expected.attachments.length),
            actual: String(parts.filter((p) => p.kind === 'attachment').length),
          },
        ],
      };
    for (const attachment of expected.attachments) {
      if (!current()) throw new Error('content_cancelled');
      const part = parts.find(
        (p) =>
          p.kind === 'attachment' && p.fileName === attachment.fileName && p.mimeType === attachment.mimeType,
      );
      if (!part)
        return {
          passed: false,
          detail: `Anlage fehlt oder hat einen anderen Dateityp: ${attachment.fileName}`,
          differences: [
            {
              path: `Anlage / ${attachment.fileName}`,
              expected: attachment.mimeType,
              actual: 'Datei fehlt oder Dateityp weicht ab',
            },
          ],
        };
      let actual: Uint8Array | undefined;
      try {
        actual = await readCaseFile(invoke, session, record.recordId, part);
        const wanted = atob(attachment.base64);
        if (actual.length !== wanted.length || actual.some((v, i) => v !== wanted.charCodeAt(i)))
          return {
            passed: false,
            detail: `Anlage hat einen anderen Inhalt: ${attachment.fileName}`,
            differences: [
              {
                path: `Anlage / ${attachment.fileName}`,
                expected: `${wanted.length} Bytes, unveränderter Dateiinhalt`,
                actual: `${actual.length} Bytes, Dateiinhalt weicht ab`,
              },
            ],
          };
      } finally {
        actual?.fill(0);
      }
    }
    return {
      passed: true,
      observedData: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      detail: `Fachdaten und ${expected.attachments.length} Anlagen anhand der lokalen, freigegebenen Kopie geprüft.`,
      differences: [],
    };
  } finally {
    bytes?.fill(0);
  }
}
export async function observeRemote(
  invoke: NativeInvoke,
  session: Session,
  run: Run,
  step: Step,
  current: () => boolean,
) {
  if (step.type === 'receipt') return (await receiptEvidence(invoke, session, run, step, current)).passed;
  const binding = run.bindings.find((b) => b.testCaseId === step.caseId);
  if (step.type === 'check_reply' && !binding) return false;
  for (let offset = 0; offset < 100; offset += 20) {
    if (!current()) throw new Error('content_cancelled');
    if (step.type === 'check_reply') {
      const page = await listReplies(invoke, session, offset);
      if (page.replies.some((r: { caseId: string }) => r.caseId === binding!.caseId)) return true;
      if (offset + 20 >= page.totalCount) return false;
    } else {
      if (!run.assignment.receiverDestination) return false;
      const page = await listSubmissions(invoke, session, run.assignment.receiverDestination, offset);
      if (page.submissions.some((r: { caseId: string | null }) => !binding || r.caseId === binding.caseId))
        return true;
      if (offset + 20 >= page.totalCount) return false;
    }
  }
  throw new Error('scenario_observation_limit');
}
