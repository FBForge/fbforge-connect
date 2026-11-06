import type { Scenario, Run, Pack, Scope, Step, Message, Followup } from './types.ts';
export function messageFor(
  pack: Pack,
  followups: Followup[] | undefined,
  caseId: string,
  scope: Scope,
): Message | null {
  const item = pack.cases.find((c) => c.id === caseId);
  if (scope === 'request' || scope === 'reply') return item?.[scope] || null;
  return followups?.find((f) => f.caseId === caseId && `reply:${f.id}` === scope)?.message || null;
}
export function messageOptions(s: Scenario, caseId: string) {
  const item = s.pack.cases.find((c) => c.id === caseId);
  return [
    { value: 'request' as Scope, name: 'Einreichung' },
    ...(item?.reply ? [{ value: 'reply' as Scope, name: 'Erste Antwort' }] : []),
    ...(s.followups || [])
      .filter((f) => f.caseId === caseId)
      .map((f) => ({ value: `reply:${f.id}` as Scope, name: f.name })),
  ];
}
export const scopeFor = (step: Step): Scope =>
  ['reply', 'check_reply'].includes(step.type)
    ? step.followupId
      ? `reply:${step.followupId}`
      : 'reply'
    : 'request';
export const expectedMessage = (run: Run, step: Step) =>
  messageFor(run.pack, run.followups, step.caseId, scopeFor(step));
export const replyKey = (step: Step) => step.followupId || `first:${step.caseId}`;
export function requiresV3(s: Scenario) {
  return (
    s.sharedCase ||
    s.pack.cases.some(
      (c) =>
        c.request.processMessage || c.reply?.processMessage || c.request.replyOffer?.processMessages.length,
    ) ||
    (s.followups || []).some((f) => f.message.processMessage)
  );
}
