import { invoke } from '../native.ts';
import { caseParts, readCaseFile } from '../cases.js';
import { compareTestContent } from './test-flows.js';
import { contentDifferences } from './content-differences.js';
export function useFlowVerification({
  props,
  candidates,
  recordId,
  step,
  testCase,
  run,
  records,
  differences,
  error,
  notice,
  act,
}) {
  return async function verify() {
    const selected = candidates.value.find((item) => item.recordId === recordId.value),
      activeStep = step.value,
      expected = testCase.value,
      activeRun = run.value;
    if (!selected || !activeStep || !activeRun) return;
    return act(async (current) => {
      const session = { ...props.session };
      if (session.environment !== activeRun.environment) throw new Error();
      const parts = await caseParts(invoke, session, selected.recordId);
      const data = parts.find((part) => part.kind === 'data');
      if (!data || data.totalBytes > 512 * 1024) throw new Error();
      let bytes;
      try {
        bytes = await readCaseFile(invoke, session, selected.recordId, data);
        const reply = ['reply', 'check_reply'].includes(activeStep.type),
          message = reply ? expected.reply : expected.request;
        const matches =
          message &&
          data.mimeType === message.mimeType &&
          compareTestContent(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            message.data,
            message.mimeType,
          );
        if (!current() || run.value !== activeRun) return;
        if (!matches) {
          differences.value = contentDifferences(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            message.data,
            message.mimeType,
          );
          error.value =
            'Die Fachdaten weichen vom Testfall ab. Die Unterschiede stehen unten. Der Schritt bleibt offen.';
          return;
        }
        if (parts.filter((part) => part.kind === 'attachment').length !== message.attachments.length) {
          error.value = 'Die Anzahl der Anlagen stimmt nicht mit dem Testfall überein.';
          return;
        }
        if (
          activeStep.type === 'receipt' &&
          selected.status !== (expected.receipt === 'accept' ? 'accepted' : 'rejected')
        ) {
          error.value = 'Der Empfang wurde nicht wie im Testfall erwartet bestätigt.';
          return;
        }
        // Compare attachment bytes too, including names and types; no arbitrary equality checkbox.
        for (const expectedAttachment of message.attachments) {
          const part = parts.find(
            (p) =>
              p.kind === 'attachment' &&
              p.fileName === expectedAttachment.fileName &&
              p.mimeType === expectedAttachment.mimeType,
          );
          if (!part) {
            error.value = `Die Anlage „${expectedAttachment.fileName}“ fehlt oder hat einen anderen Dateityp.`;
            return;
          }
          let actual;
          try {
            actual = await readCaseFile(invoke, session, selected.recordId, part);
            const wanted = atob(expectedAttachment.base64);
            if (actual.length !== wanted.length || actual.some((b, i) => b !== wanted.charCodeAt(i))) {
              error.value = `Der Inhalt der Anlage „${expectedAttachment.fileName}“ weicht vom Testfall ab.`;
              return;
            }
          } finally {
            actual?.fill(0);
          }
        }
        if (!current() || run.value !== activeRun) return;
        activeRun.bindings[activeStep.caseId] = {
          caseId: selected.caseId,
          submissionId: selected.submissionId || activeRun.bindings[activeStep.caseId]?.submissionId,
          ...(selected.replyId ? { replyId: selected.replyId } : {}),
        };
        activeRun.results.push({
          step: activeStep.type,
          testCaseId: activeStep.caseId,
          recordId: selected.recordId,
          caseId: selected.caseId,
          submissionId: selected.submissionId,
          replyId: selected.replyId,
          checkedAt: new Date().toISOString(),
          status: 'passed',
        });
        records.value = [];
        recordId.value = '';
        notice.value = 'Schritt anhand der lokalen Nachricht und erwarteter Inhalte erfolgreich geprüft.';
      } finally {
        bytes?.fill(0);
      }
    });
  };
}
