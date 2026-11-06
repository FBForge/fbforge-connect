import { invalid, uuid } from './model.ts';
import { messageFor, replyKey } from './messages.ts';
import { fieldSnippet } from './fields.ts';
import type { Attempt, Run, Step } from './types.ts';
export const detailLimit = 128 * 1024;
export function boundedAttempt(run: Run, input: Omit<Attempt, 'at' | 'stepId'>) {
  const result = { ...input };
  if (input.differences) {
    result.differences = [];
    let budget =
      detailLimit -
      new TextEncoder().encode(JSON.stringify(run.attempts.map((a) => a.differences || []))).length;
    for (const row of input.differences.slice(0, 20)) {
      const bounded = {
        path: fieldSnippet(row.path, 1024),
        expected: fieldSnippet(row.expected, 512),
        actual: fieldSnippet(row.actual, 512),
      };
      budget -= new TextEncoder().encode(JSON.stringify(bounded)).length + 2;
      if (budget < 0) break;
      result.differences.push(bounded);
    }
    result.differencesOmitted =
      input.differences.length > result.differences.length ||
      input.differences.some((d) => d.path.length > 1024 || d.expected.length > 512 || d.actual.length > 512);
  }
  return result;
}
export function validateRunDetails(r: Run, steps: Step[]) {
  const followups = r.definition.followups || [];
  if ((r.followups || []).length !== followups.length || !Array.isArray(r.followups || [])) invalid();
  const ids = new Set();
  for (const f of r.followups || []) {
    if (
      ids.has(f.id) ||
      !followups.some((v) => v.id === f.id && v.caseId === f.caseId && v.name === f.name) ||
      !messageFor(r.pack, r.followups, f.caseId, `reply:${f.id}`)
    )
      invalid();
    ids.add(f.id);
  }
  const seen = new Set();
  if (!Array.isArray(r.replyBindings || []) || (r.replyBindings || []).length > 36) invalid();
  for (const b of r.replyBindings || []) {
    if (
      !b ||
      Object.keys(b).sort().join() !== 'messageId,replyId' ||
      !uuid(b.replyId) ||
      seen.has(b.replyId) ||
      seen.has(b.messageId) ||
      !steps.some((s) => ['reply', 'check_reply'].includes(s.type) && replyKey(s) === b.messageId)
    )
      invalid();
    seen.add(b.replyId);
    seen.add(b.messageId);
  }
  let size = 0;
  for (const a of r.attempts) {
    if (a.differences !== undefined) {
      if (!Array.isArray(a.differences) || a.differences.length > 20) invalid();
      for (const d of a.differences)
        if (
          !d ||
          Object.keys(d).sort().join() !== 'actual,expected,path' ||
          typeof d.path !== 'string' ||
          !d.path ||
          d.path.length > 1024 ||
          typeof d.expected !== 'string' ||
          d.expected.length > 512 ||
          typeof d.actual !== 'string' ||
          d.actual.length > 512
        )
          invalid();
      size += new TextEncoder().encode(JSON.stringify(a.differences)).length;
    }
    if (a.differencesOmitted !== undefined && typeof a.differencesOmitted !== 'boolean') invalid();
    if (
      a.context !== undefined &&
      (!a.context ||
        Object.keys(a.context).sort().join() !== 'caseId,replyId,submissionId' ||
        Object.values(a.context).some((v) => v !== null && !uuid(v)))
    )
      invalid();
  }
  if (size > detailLimit) invalid();
}
