import { clone } from './model.ts';
import { validateTestPack } from '../../test-packs.js';
import { boundedAttempt, validateRunDetails } from './run-details.ts';
import { requiresV3 } from './messages.ts';
import { resolveMessages } from './data.ts';
import {
  definitionFingerprint,
  invalid,
  latestChecks,
  scenarioSteps,
  uuid,
  validateScenario,
} from './model.ts';
import type { Assignment, Attempt, Run, Scenario } from './types.ts';

export async function startRun(
  definition: Scenario,
  variantId: string,
  environment: Run['environment'],
  assignment: Assignment,
): Promise<Run> {
  const snapshot = validateScenario(definition),
    startedAt = new Date().toISOString();
  if (requiresV3(snapshot) && assignment.apiVersion !== 'v3') invalid();
  const run: Run = {
    format: 'fbforge-connect-scenario-run',
    version: 2,
    id: crypto.randomUUID(),
    definition: snapshot,
    fingerprint: await definitionFingerprint(snapshot),
    variantId,
    environment,
    assignment: clone(assignment),
    startedAt,
    ...resolveMessages(snapshot, variantId, startedAt),
    cursor: 0,
    attempts: [],
    bindings: [],
    reference: false,
    references: [],
  };
  return validateRun(run);
}
export function validateRun(input: unknown): Run {
  if (!input || typeof input !== 'object') invalid();
  const r = input as Run;
  if (
    Object.keys(r).sort().join() !==
    [
      'format',
      'version',
      'id',
      'definition',
      'fingerprint',
      'variantId',
      'environment',
      'assignment',
      'startedAt',
      'pack',
      'cursor',
      'attempts',
      'bindings',
      'reference',
      'references',
      ...['followups', 'replyBindings'].filter((k) => Object.hasOwn(r, k)),
    ]
      .sort()
      .join()
  )
    invalid();
  validateScenario(r.definition);
  validateTestPack(r.pack);
  const steps = scenarioSteps(r.definition);
  if (!Array.isArray(r.references) || r.references.length > 64) invalid();
  for (const ref of r.references) {
    if (
      !ref ||
      Object.keys(ref).sort().join() !== 'path,raw,testCaseId' ||
      !r.pack.cases.some((c) => c.id === ref.testCaseId) ||
      typeof ref.path !== 'string' ||
      ref.path.length > 1024 ||
      typeof ref.raw !== 'string' ||
      ref.raw.length > 4096
    )
      invalid();
    const value = JSON.parse(ref.raw);
    if (value !== null && typeof value === 'object') invalid();
  }
  if (
    r.format !== 'fbforge-connect-scenario-run' ||
    r.version !== 2 ||
    !uuid(r.id) ||
    !r.definition.variants.some((v) => v.id === r.variantId) ||
    !['TEST', 'STAGE', 'PROD'].includes(r.environment) ||
    !Number.isFinite(Date.parse(r.startedAt)) ||
    !/^[a-f0-9]{64}$/.test(r.fingerprint) ||
    !Number.isInteger(r.cursor) ||
    r.cursor < 0 ||
    r.cursor > steps.length ||
    !Array.isArray(r.attempts) ||
    r.attempts.length > 480 ||
    !Array.isArray(r.bindings) ||
    r.bindings.length > 20 ||
    typeof r.reference !== 'boolean'
  )
    invalid();
  if (
    !r.assignment ||
    Object.keys(r.assignment).sort().join() !==
      ['apiVersion', 'senderProfileId', 'receiverProfileId', 'sourceDestination', 'receiverDestination']
        .sort()
        .join() ||
    !['v2', 'v3'].includes(r.assignment.apiVersion) ||
    Object.entries(r.assignment).some(([k, v]) => k !== 'apiVersion' && v !== '' && !uuid(v))
  )
    invalid();
  if (r.pack.cases.map((c) => c.id).join() !== r.definition.pack.cases.map((c) => c.id).join()) invalid();
  for (const a of r.attempts)
    if (
      !a ||
      Object.keys(a).sort().join() !==
        [
          'at',
          'detail',
          'recordId',
          'status',
          'stepId',
          ...['differences', 'differencesOmitted', 'context'].filter((k) => Object.hasOwn(a, k)),
        ]
          .sort()
          .join() ||
      !steps.some((s) => s.id === a.stepId) ||
      !['passed', 'failed', 'blocked', 'manual', 'cancelled'].includes(a.status) ||
      !Number.isFinite(Date.parse(a.at)) ||
      typeof a.detail !== 'string' ||
      a.detail.length > 2048 ||
      (a.recordId !== null && !uuid(a.recordId))
    )
      invalid();
  for (const step of steps.slice(0, r.cursor))
    if (
      !['passed', 'manual'].includes(
        [...r.attempts].reverse().find((a) => a.stepId === step.id)?.status || '',
      )
    )
      invalid();
  const ids = new Set();
  for (const b of r.bindings) {
    if (
      !b ||
      Object.keys(b).sort().join() !== 'caseId,replyId,submissionId,testCaseId' ||
      !uuid(b.caseId) ||
      !r.pack.cases.some((c) => c.id === b.testCaseId) ||
      ids.has(b.testCaseId) ||
      (r.definition.sharedCase && r.bindings[0].caseId !== b.caseId) ||
      [b.submissionId, b.replyId].some((v) => v !== null && !uuid(v))
    )
      invalid();
    ids.add(b.testCaseId);
  }
  validateRunDetails(r, steps);
  if (r.followups) validateScenario({ ...r.definition, pack: r.pack, followups: r.followups });
  if (r.reference && !canReference(r)) invalid();
  if (new TextEncoder().encode(JSON.stringify(r)).length > 8 * 1024 * 1024 - 4096)
    throw new Error('scenario_size_limit');
  return clone(r);
}
export function addAttempt(run: Run, result: Omit<Attempt, 'stepId' | 'at'>) {
  const step = scenarioSteps(run.definition)[run.cursor];
  if (!step || run.reference || run.attempts.length >= 480) invalid();
  run.attempts.push({
    ...boundedAttempt(run, result),
    detail: result.detail.slice(0, 2048),
    stepId: step.id,
    at: new Date().toISOString(),
  });
  if (['passed', 'manual'].includes(result.status)) run.cursor++;
}
export function canReference(run: Run) {
  return (
    run.cursor === scenarioSteps(run.definition).length &&
    latestChecks(run).every((c) => c.attempt?.status === 'passed')
  );
}
export function compareRuns(current: Run, reference: Run) {
  const comparable =
    current.definition.id === reference.definition.id &&
    current.variantId === reference.variantId &&
    current.environment === reference.environment;
  const changedDefinition = current.fingerprint !== reference.fingerprint;
  const changedTarget = (
    ['senderProfileId', 'receiverProfileId', 'sourceDestination', 'receiverDestination'] as const
  ).some((key) => current.assignment[key] !== reference.assignment[key]);
  const old = new Map(latestChecks(reference).map((c) => [c.step.id, c]));
  const rows = latestChecks(current).map((c) => ({
    name: `${current.definition.pack.cases.find((item) => item.id === c.step.caseId)?.name} · ${c.step.title}`,
    before: old.get(c.step.id)?.attempt?.status || 'pending',
    after: c.attempt?.status || 'pending',
    regression:
      comparable &&
      !changedTarget &&
      !changedDefinition &&
      old.get(c.step.id)?.attempt?.status === 'passed' &&
      c.attempt?.status === 'failed',
  }));
  return {
    comparable,
    changedDefinition,
    changedTarget,
    changedApi: current.assignment.apiVersion !== reference.assignment.apiVersion,
    rows,
  };
}
