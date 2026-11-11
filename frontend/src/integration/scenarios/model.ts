import { validateTestPack } from '../../test-packs.js';
import { validateTestFlow } from '../test-flows.js';
import { messageFor } from './messages.ts';
import type { Scenario, Pack, Step, Mode, Run } from './types.ts';

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const uuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const title = (s: unknown, max = 160): s is string =>
  typeof s === 'string' && !!s.trim() && s.length <= max && !/[\x00-\x1f\x7f]/.test(s);
export function invalid(): never {
  throw new Error('scenario_invalid');
}
const keys = (v: object, names: string[]) => Object.keys(v).sort().join() === names.sort().join();
export function validateScenario(input: unknown): Scenario {
  if (!input || typeof input !== 'object') invalid();
  const s = input as Scenario;
  if (
    !keys(s, [
      'format',
      'version',
      'id',
      'name',
      'mode',
      'sharedCase',
      'pack',
      'variables',
      'variants',
      'rules',
      'comparison',
      'expectedProblem',
      ...(Object.hasOwn(s, 'followups') ? ['followups'] : []),
    ]) ||
    s.format !== 'fbforge-connect-scenario' ||
    s.version !== 2 ||
    !uuid(s.id) ||
    !title(s.name) ||
    typeof s.sharedCase !== 'boolean' ||
    !['sender', 'receiver', 'both'].includes(s.mode) ||
    !['exact', 'xml-structure', 'rules', 'field-exceptions'].includes(s.comparison) ||
    typeof s.expectedProblem !== 'string' ||
    s.expectedProblem.length > 4096 ||
    /[\x00-\x20]/.test(s.expectedProblem)
  )
    invalid();
  validateTestPack(s.pack);
  if (Object.hasOwn(s, 'followups')) {
    if (!Array.isArray(s.followups) || s.followups.length > 16) invalid();
    const ids = new Set();
    for (const f of s.followups) {
      const item = s.pack.cases.find((c) => c.id === f?.caseId);
      if (
        !f ||
        !keys(f, ['id', 'caseId', 'name', 'message']) ||
        !uuid(f.id) ||
        ids.has(f.id) ||
        !title(f.name) ||
        !item?.reply ||
        !item.request.replyOffer
      )
        invalid();
      ids.add(f.id);
      validateTestPack({ ...s.pack, cases: [{ ...item, reply: f.message }] });
      if (
        !f.message ||
        f.message.schemaUri !== item.reply.schemaUri ||
        f.message.mimeType !== item.reply.mimeType
      )
        invalid();
    }
  }
  if (
    !Array.isArray(s.variables) ||
    s.variables.length > 32 ||
    !Array.isArray(s.rules) ||
    s.rules.length > 64 ||
    !Array.isArray(s.variants) ||
    !s.variants.length ||
    s.variants.length > 16
  )
    invalid();
  for (const [items, kind] of [
    [s.variables, 'variable'],
    [s.rules, 'rule'],
  ] as const) {
    const ids = new Set();
    for (const row of items) {
      const fields =
        kind === 'variable'
          ? ['id', 'label', 'caseId', 'scope', 'path', 'kind', 'value']
          : ['id', 'caseId', 'scope', 'path', 'operator', 'value'];
      if (
        !row ||
        !keys(row, fields) ||
        !uuid(row.id) ||
        ids.has(row.id) ||
        !messageFor(s.pack, s.followups, row.caseId, row.scope) ||
        !title(row.path, 1024) ||
        typeof row.value !== 'string' ||
        row.value.length > 4096
      )
        invalid();
      if (
        kind === 'variable' &&
        (!('kind' in row) ||
          !['text', 'number', 'boolean', 'date', 'uuid', 'reference'].includes(row.kind) ||
          !title(row.label))
      )
        invalid();
      if (
        kind === 'rule' &&
        (!('operator' in row) || !['equals', 'present', 'date', 'reference'].includes(row.operator))
      )
        invalid();
      ids.add(row.id);
    }
  }
  const ids = new Set();
  for (const v of s.variants) {
    if (
      !v ||
      !keys(v, ['id', 'name', 'values']) ||
      !uuid(v.id) ||
      ids.has(v.id) ||
      !title(v.name) ||
      !Array.isArray(v.values) ||
      v.values.length > 32
    )
      invalid();
    ids.add(v.id);
    const seen = new Set();
    for (const value of v.values) {
      if (
        !value ||
        !keys(value, ['variableId', 'value']) ||
        !s.variables.some((row) => row.id === value.variableId) ||
        seen.has(value.variableId) ||
        typeof value.value !== 'string' ||
        value.value.length > 4096
      )
        invalid();
      seen.add(value.variableId);
    }
  }
  if (
    s.variables.filter((v) => v.kind === 'reference').length +
      s.rules.filter((r) => r.operator === 'reference').length >
    64
  )
    invalid();
  if (s.comparison === 'rules' && !s.rules.length) invalid();
  if (new TextEncoder().encode(JSON.stringify(s)).length > 8 * 1024 * 1024 - 4096) invalid();
  return clone(s);
}
export function scenarioFrom(input: unknown, mode: Mode = 'both'): Scenario {
  if (!input || typeof input !== 'object') invalid();
  const source = input as { format?: string; pack?: Pack };
  if (source.format === 'fbforge-connect-scenario') return validateScenario(input);
  const pack =
    source.format === 'fbforge-connect-testflow' ? validateTestFlow(input).pack : validateTestPack(input);
  return validateScenario({
    format: 'fbforge-connect-scenario',
    version: 2,
    id: crypto.randomUUID(),
    name: pack.name,
    mode,
    sharedCase: false,
    pack,
    variables: [],
    variants: [{ id: crypto.randomUUID(), name: 'Standard', values: [] }],
    rules: [],
    comparison: 'exact',
    expectedProblem: '',
  });
}
const names = {
  send: 'Einreichung senden',
  receive: 'Eingang öffnen',
  compare: 'Inhalte prüfen',
  receipt: 'Empfangsbestätigung prüfen',
  reply: 'Antwort senden',
  check_reply: 'Antwort prüfen',
};
export function scenarioSteps(s: Scenario): Step[] {
  return s.pack.cases.flatMap((item) => {
    const types: Step['type'][] =
      s.mode === 'sender'
        ? ['send']
        : s.mode === 'receiver'
          ? ['receive', 'compare']
          : ['send', 'receive', 'compare'];
    if (item.receipt !== 'none') types.push('receipt');
    if (item.reply)
      types.push(...(s.mode === 'sender' ? (['check_reply'] as const) : (['reply', 'check_reply'] as const)));
    const base: Step[] = types.map((type) => ({
      id: `${item.id}:${type}`,
      caseId: item.id,
      type,
      side: ['send', 'check_reply'].includes(type) ? 'sender' : 'receiver',
      external:
        (s.mode === 'sender' && type === 'receipt') || (s.mode === 'receiver' && type === 'check_reply'),
      title: names[type],
    }));
    const extra = (s.followups || [])
      .filter((f) => f.caseId === item.id)
      .flatMap((f) => {
        const kinds: Step['type'][] = s.mode === 'sender' ? ['check_reply'] : ['reply', 'check_reply'];
        return kinds.map((type) => ({
          id: `${item.id}:${type}:${f.id}`,
          caseId: item.id,
          type,
          side: type === 'reply' ? ('receiver' as const) : ('sender' as const),
          external: s.mode === 'receiver' && type === 'check_reply',
          title: `${names[type]} · ${f.name}`,
          followupId: f.id,
        }));
      });
    return [...base, ...extra];
  });
}
export async function definitionFingerprint(s: Scenario) {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, val]) => [k, stable(val)]),
          )
        : v;
  const bytes = new TextEncoder().encode(JSON.stringify(stable(validateScenario(s))));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function latestChecks(run: Run) {
  return scenarioSteps(run.definition).map((step) => ({
    step,
    attempt: [...run.attempts].reverse().find((a) => a.stepId === step.id),
  }));
}
