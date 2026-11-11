import type { Assignment, Scenario, Message } from './types.ts';
import type { NativeInvoke } from '../../contracts.d.ts';
import { clone, invalid, validateScenario } from './model.ts';
export interface Preparation {
  format: 'fbforge-connect-preparation';
  version: 1;
  definition: Scenario;
  assignment: Assignment;
  variantId: string;
  environment: 'TEST' | 'STAGE' | 'PROD';
  savedAt: string;
}
const exact = (value: object, names: string[]) => Object.keys(value).sort().join() === names.sort().join();
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || value.length > max) invalid();
}
function process(value: unknown) {
  if (value === null) return;
  if (!value || typeof value !== 'object' || !exact(value, ['processModelId', 'messageId'])) invalid();
  const p = value as { processModelId: string; messageId: string };
  text(p.processModelId, 1000);
  text(p.messageId, 1000);
  p.processModelId = 'preparation';
  p.messageId = 'preparation';
}
function message(m: Message) {
  text(m.data, 512 * 1024);
  text(m.schemaUri, 4096);
  m.data = m.mimeType === 'application/xml' ? '<r/>' : '{}';
  m.schemaUri = 'urn:fbforge:preparation';
  process(m.processMessage);
  if ('serviceIdentifier' in m) {
    text(m.serviceIdentifier, 4096);
    m.serviceIdentifier = 'preparation';
  }
  if ('serviceName' in m) {
    text(m.serviceName, 160);
    m.serviceName = 'preparation';
  }
  if ('region' in m && m.region !== null) {
    text(m.region, 4096);
    m.region = null;
  }
  if (m.replyOffer) {
    text(m.replyOffer.schemaUri, 4096);
    m.replyOffer.schemaUri = 'urn:fbforge:preparation';
    if (!Array.isArray(m.replyOffer.processMessages)) invalid();
    m.replyOffer.processMessages.forEach(process);
  }
}
/** Validate the envelope and shape, while allowing unfinished editable text. Never normalize the saved original. */
export function validatePreparation(input: unknown): Preparation {
  if (
    !input ||
    typeof input !== 'object' ||
    !exact(input, ['format', 'version', 'definition', 'assignment', 'variantId', 'environment', 'savedAt'])
  )
    invalid();
  if (new TextEncoder().encode(JSON.stringify(input)).length > 8 * 1024 * 1024 - 4096) invalid();
  const p = clone(input) as Preparation;
  if (
    p.format !== 'fbforge-connect-preparation' ||
    p.version !== 1 ||
    !['TEST', 'STAGE', 'PROD'].includes(p.environment) ||
    typeof p.savedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(p.savedAt) ||
    !Number.isFinite(Date.parse(p.savedAt))
  )
    invalid();
  if (
    !p.assignment ||
    !exact(p.assignment, [
      'apiVersion',
      'senderProfileId',
      'receiverProfileId',
      'sourceDestination',
      'receiverDestination',
    ]) ||
    !['v2', 'v3'].includes(p.assignment.apiVersion)
  )
    invalid();
  for (const [key, value] of Object.entries(p.assignment)) if (key !== 'apiVersion') text(value, 160);
  const s = p.definition;
  if (
    !s?.pack ||
    !Array.isArray(s.pack.cases) ||
    !Array.isArray(s.variables) ||
    !Array.isArray(s.rules) ||
    !Array.isArray(s.variants)
  )
    invalid();
  const name = (value: string) => {
    text(value, 160);
    return value.trim() ? value : 'Vorbereitung';
  };
  s.name = name(s.name);
  s.pack.name = name(s.pack.name);
  for (const item of s.pack.cases) {
    item.name = name(item.name);
    message(item.request);
    if (item.reply) message(item.reply);
  }
  for (const f of s.followups || []) {
    f.name = name(f.name);
    message(f.message);
  }
  for (const v of s.variables) {
    v.label = name(v.label);
    text(v.path, 1024);
    if (!v.path.trim()) v.path = '/preparation';
  }
  for (const r of s.rules) {
    text(r.path, 1024);
    if (!r.path.trim()) r.path = '/preparation';
  }
  for (const v of s.variants) v.name = name(v.name);
  text(s.expectedProblem, 4096);
  s.expectedProblem = '';
  if (s.comparison === 'rules' && !s.rules.length) s.comparison = 'exact';
  validateScenario(s);
  if (!s.variants.some((v) => v.id === p.variantId)) invalid();
  return clone(input) as Preparation;
}
export async function readPreparation(invoke: NativeInvoke, environment: Preparation['environment']) {
  const value = await invoke('test_library', { request: { action: 'preparation_read', environment } });
  if (value === null) return null;
  const checked = validatePreparation(value);
  if (checked.environment !== environment) invalid();
  return checked;
}
export const savePreparation = (invoke: NativeInvoke, document: Preparation) =>
  invoke('test_library', {
    request: { action: 'preparation_save', document: validatePreparation(document) },
  });
export const deletePreparation = (invoke: NativeInvoke, environment: Preparation['environment']) =>
  invoke('test_library', { request: { action: 'preparation_delete', environment } });
export { registerPreparationFlush, flushPreparations } from './preparation-flush.ts';
