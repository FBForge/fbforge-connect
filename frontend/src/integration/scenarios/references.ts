import { messageFor } from './messages.ts';
import { clone, invalid } from './model.ts';
import { messageFields, replaceField } from './fields.ts';
import type { Run, Message } from './types.ts';
export function bindReferences(run: Run, caseId: string, actual: string) {
  const item = run.pack.cases.find((c) => c.id === caseId);
  if (!item) invalid();
  const fields = messageFields(actual, item.request.mimeType),
    variant = run.definition.variants.find((v) => v.id === run.variantId)!;
  const variables = run.definition.variables.filter(
    (v) => v.caseId === caseId && v.scope !== 'request' && v.kind === 'reference',
  );
  const source = (id: string, value: string) =>
    variant.values.find((v) => v.variableId === id)?.value ?? value;
  const paths = new Set([
    ...variables.map((v) => source(v.id, v.value)),
    ...run.definition.rules
      .filter((r) => r.caseId === caseId && r.scope !== 'request' && r.operator === 'reference')
      .map((r) => r.value),
  ]);
  const references = [...paths].map((path) => {
    const field = fields.find((f) => f.path === path);
    if (!field || field.raw.length > 4096) invalid();
    return { testCaseId: caseId, path, raw: field.raw };
  });
  const copies = new Map<Message, string>();
  for (const variable of variables) {
    const reply = messageFor(run.pack, run.followups, caseId, variable.scope);
    if (!reply) invalid();
    const value = references.find((r) => r.path === source(variable.id, variable.value));
    if (!value) invalid();
    copies.set(
      reply,
      replaceField(copies.get(reply) || reply.data, reply.mimeType, variable.path, value.raw),
    );
  }
  for (const [reply, data] of copies) reply.data = data;
  run.references = [...run.references.filter((r) => r.testCaseId !== caseId), ...references];
}
export function referenceMessage(run: Run, caseId: string): Message {
  const item = run.pack.cases.find((c) => c.id === caseId);
  if (!item) invalid();
  const message = clone(item.request);
  for (const ref of run.references.filter((r) => r.testCaseId === caseId))
    message.data = replaceField(message.data, message.mimeType, ref.path, ref.raw);
  return message;
}
