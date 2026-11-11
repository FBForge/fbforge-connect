import { clone, invalid } from './model.ts';
import type { Scenario, TestCase } from './types.ts';
function removeSlots(s: Scenario, caseId: string, repliesOnly: boolean) {
  const removed = new Set(
    s.variables
      .filter((v) => v.caseId === caseId && (!repliesOnly || v.scope !== 'request'))
      .map((v) => v.id),
  );
  s.variables = s.variables.filter((v) => !removed.has(v.id));
  s.rules = s.rules.filter((r) => r.caseId !== caseId || (repliesOnly && r.scope === 'request'));
  for (const variant of s.variants) variant.values = variant.values.filter((v) => !removed.has(v.variableId));
  if (s.followups) s.followups = s.followups.filter((f) => f.caseId !== caseId);
}
export function setFirstReply(s: Scenario, caseId: string, enabled: boolean) {
  const item = s.pack.cases.find((c) => c.id === caseId);
  if (!item) invalid();
  if (!enabled) {
    removeSlots(s, caseId, true);
    item.reply = null;
    item.request.replyOffer = null;
    return;
  }
  if (item.reply) return;
  const offer = item.request.replyOffer || {
    schemaUri: 'urn:fbforge:connect:reply:status:1',
    mimeType: 'application/json',
    processMessages: [],
  };
  item.request.replyOffer = clone(offer);
  item.reply = {
    schemaUri: offer.schemaUri,
    mimeType: offer.mimeType,
    data:
      offer.mimeType === 'application/xml'
        ? '<status>eingegangen</status>'
        : '{\n  "status": "eingegangen"\n}',
    attachments: [],
    processMessage: null,
  };
}
export function duplicateCase(s: Scenario, caseId: string) {
  const item = s.pack.cases.find((c) => c.id === caseId);
  if (!item) invalid();
  const variables = s.variables.filter((v) => v.caseId === caseId),
    rules = s.rules.filter((r) => r.caseId === caseId),
    followups = (s.followups || []).filter((f) => f.caseId === caseId);
  if (
    s.pack.cases.length >= 20 ||
    s.variables.length + variables.length > 32 ||
    s.rules.length + rules.length > 64 ||
    (s.followups || []).length + followups.length > 16
  )
    throw Error('scenario_authoring_limit');
  const id = crypto.randomUUID(),
    next: TestCase = { ...clone(item), id, name: `${item.name.slice(0, 150)} – Kopie` },
    scopes = new Map(followups.map((f) => [`reply:${f.id}`, `reply:${crypto.randomUUID()}`])),
    variableIds = new Map(variables.map((v) => [v.id, crypto.randomUUID()]));
  const scope = (old: string) => scopes.get(old) || old;
  const copied = clone(s);
  copied.pack.cases.push(next);
  copied.variables.push(
    ...variables.map((v) => ({
      ...v,
      id: variableIds.get(v.id)!,
      caseId: id,
      scope: scope(v.scope) as typeof v.scope,
    })),
  );
  copied.rules.push(
    ...rules.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      caseId: id,
      scope: scope(r.scope) as typeof r.scope,
    })),
  );
  if (followups.length)
    copied.followups!.push(
      ...followups.map((f) => ({ ...clone(f), id: scopes.get(`reply:${f.id}`)!.slice(6), caseId: id })),
    );
  for (const variant of copied.variants)
    variant.values.push(
      ...variant.values
        .filter((v) => variableIds.has(v.variableId))
        .map((v) => ({ ...v, variableId: variableIds.get(v.variableId)! })),
    );
  if (new TextEncoder().encode(JSON.stringify(copied)).length > 8 * 1024 * 1024 - 4096)
    throw Error('scenario_authoring_limit');
  Object.assign(s, copied);
  return id;
}
export function removeCase(s: Scenario, caseId: string) {
  if (s.pack.cases.length <= 1 || !s.pack.cases.some((c) => c.id === caseId)) invalid();
  removeSlots(s, caseId, false);
  s.pack.cases = s.pack.cases.filter((c) => c.id !== caseId);
}
