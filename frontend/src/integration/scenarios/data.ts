import { clone } from './model.ts';
import { validateTestPack } from '../../test-packs.js';
import { invalid } from './model.ts';
import { messageFields, replaceField } from './fields.ts';
import { validDate } from './expectations.ts';
import type { Scenario, Variable } from './types.ts';

export function variableValue(variable: Variable, value: string, now: string) {
  switch (variable.kind) {
    case 'text':
      return JSON.stringify(value);
    case 'number':
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) invalid();
      return value;
    case 'boolean':
      if (!['true', 'false'].includes(value)) invalid();
      return value;
    case 'date': {
      const date = value || now.slice(0, 10);
      if (!validDate(date)) invalid();
      return JSON.stringify(date);
    }
    case 'uuid':
      return JSON.stringify(crypto.randomUUID());
    case 'reference':
      return '';
  }
}
export function resolvePack(s: Scenario, variantId: string, now = new Date().toISOString()) {
  const pack = clone(s.pack),
    variant = s.variants.find((v) => v.id === variantId);
  if (!variant) invalid();
  const variables = [...s.variables].sort(
    (a, b) => Number(a.kind === 'reference') - Number(b.kind === 'reference'),
  );
  for (const variable of variables) {
    const item = pack.cases.find((c) => c.id === variable.caseId),
      message = item?.[variable.scope];
    if (!item || !message) invalid();
    const value = variant.values.find((v) => v.variableId === variable.id)?.value ?? variable.value;
    let raw = variableValue(variable, value, now);
    if (variable.kind === 'reference') {
      if (variable.scope !== 'reply') invalid();
      raw = messageFields(item.request.data, item.request.mimeType).find((f) => f.path === value)?.raw || '';
      if (!raw) invalid();
    }
    message.data = replaceField(message.data, message.mimeType, variable.path, raw);
  }
  validateTestPack(pack);
  return pack;
}
