import { fictionalValues } from './fictional-values.js';
import { assertSchemaAvailable } from './schema-availability.js';
// Local fictional schema examples. No schema or form content is executed.
export function jsonExample(schema) {
  const documents = schema?.schemaPackage === 1 ? schema.documents : {};
  const base = schema?.schemaPackage === 1 ? schema.schemaUri : '';
  const root = base ? documents?.[base.split('#')[0]] : schema;
  if (root === undefined) throw new Error('schema_unavailable');
  assertSchemaAvailable(root);
  const selected = base.includes('#') ? jsonReference(root, `#${base.split('#').slice(1).join('#')}`) : root;
  if (selected === undefined) throw new Error('Die gewählte Schema-Referenz fehlt.');
  return JSON.stringify(
    jsonValue(selected, root, { field: '', depth: 0, budget: { remaining: 2000 }, documents, base }),
    null,
    2,
  );
}
function jsonValue(schema, root, context) {
  assertSchemaAvailable(schema);
  if (--context.budget.remaining < 0 || context.depth > 24)
    throw new Error('Die Grenze für ein Beispiel wurde erreicht. Das Schema ist zu groß oder rekursiv.');
  if (schema === true) return {};
  if (schema === false) throw new Error('Das JSON-Schema „false“ erlaubt keine gültigen Daten.');
  if (!schema || typeof schema !== 'object') return null;
  const next = { ...context, depth: context.depth + 1 };
  if (typeof schema.$id === 'string' && next.base) next.base = new URL(schema.$id, next.base).href;
  if (typeof schema.$ref === 'string') {
    const uri = next.base ? new URL(schema.$ref, next.base).href : schema.$ref;
    const location = uri.split('#')[0];
    const target = location && location !== next.base?.split('#')[0] ? context.documents?.[location] : root;
    if (target !== undefined) assertSchemaAvailable(target);
    const referenced =
      target === undefined
        ? undefined
        : jsonReference(target, uri.includes('#') ? `#${uri.split('#').slice(1).join('#')}` : '#');
    if (referenced === undefined) throw new Error('Eine Schema-Referenz kann nicht lokal aufgelöst werden.');
    const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'));
    return jsonValue(typeof referenced === 'object' ? { ...referenced, ...siblings } : referenced, target, {
      ...next,
      base: uri,
    });
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length) return jsonAllOf(schema.allOf, root, next);
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return jsonValue(schema.oneOf[0], root, next);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return jsonValue(schema.anyOf[0], root, next);
  const declaredType =
    schema.type || (schema.properties ? 'object' : schema.items || schema.prefixItems ? 'array' : 'string');
  const type = Array.isArray(declaredType)
    ? declaredType.find((item) => item !== 'null') || declaredType[0]
    : declaredType;
  const preferred = jsonPreferredValue(schema, schema.type);
  if (preferred !== undefined) return preferred;
  if (type === 'object') {
    const object = {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const names = [...new Set([...required, ...Object.keys(schema.properties || {})])];
    if (Number.isInteger(schema.maxProperties) && required.size > schema.maxProperties)
      throw new Error('Die erforderlichen Felder widersprechen der Objekt-Grenze.');
    const selected = Number.isInteger(schema.maxProperties) ? names.slice(0, schema.maxProperties) : names;
    for (const name of selected)
      Object.defineProperty(object, name, {
        value: jsonValue(schema.properties?.[name] ?? {}, root, { ...next, field: name }),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return object;
  }
  if (type === 'array') {
    const tuple = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : []);
    const minimum = Number.isInteger(schema.minItems) ? schema.minItems : 0;
    let count = Math.max(minimum, tuple.length, schema.items && !Array.isArray(schema.items) ? 1 : 0);
    if (Number.isInteger(schema.maxItems)) count = Math.min(count, schema.maxItems);
    if (count < minimum || count < 0 || count > 100)
      throw new Error('Die Array-Grenze für ein Beispiel wurde erreicht.');
    const items = Array.from({ length: count }, (_, index) =>
      jsonValue(
        tuple[index] ?? (Array.isArray(schema.items) ? (schema.additionalItems ?? {}) : (schema.items ?? {})),
        root,
        next,
      ),
    );
    if (schema.uniqueItems && new Set(items.map((item) => JSON.stringify(item))).size !== items.length)
      throw new Error('Für dieses Array konnten keine unterschiedlichen Beispielwerte erzeugt werden.');
    return items;
  }
  if (type === 'integer') return integerExample(schema);
  if (type === 'number') return numberExample(schema);
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return stringExample(schema, context.field);
}
function jsonPreferredValue(schema, type) {
  const allowed = (value) =>
    jsonMatchesType(value, type) &&
    (!Array.isArray(schema.enum) ||
      schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) &&
    (typeof value !== 'string' ||
      (value.length >= (schema.minLength || 0) &&
        value.length <= (schema.maxLength ?? Infinity) &&
        matchesJsonPattern(value, schema.pattern || '') &&
        matchesExampleFormat(value, schema.format)));
  if (Object.hasOwn(schema, 'const')) {
    if (!allowed(schema.const)) throw new Error('Die Schema-Konstante widerspricht den Feldvorgaben.');
    return schema.const;
  }
  const candidates = [];
  if (Object.hasOwn(schema, 'default')) candidates.push(schema.default);
  if (Array.isArray(schema.examples)) candidates.push(...schema.examples);
  if (Array.isArray(schema.enum)) {
    if (schema.format === 'bool')
      candidates.push(...schema.enum.filter((value) => value === false || value === 'false'));
    candidates.push(...schema.enum);
  }
  const value = candidates.find(allowed);
  if (value === undefined && Array.isArray(schema.enum))
    throw new Error('Kein erlaubter Auswahlwert erfüllt die Feldvorgaben.');
  return value;
}
function jsonMatchesType(value, type) {
  if (!type) return true;
  if (Array.isArray(type)) return type.some((item) => jsonMatchesType(value, item));
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'string':
      return typeof value === 'string';
    default:
      return false;
  }
}
function jsonReference(root, reference) {
  if (reference === '#') return root;
  if (reference.startsWith('#') && !reference.startsWith('#/')) {
    const pending = [root];
    let remaining = 20000;
    while (pending.length && --remaining > 0) {
      const item = pending.pop();
      if (!item || typeof item !== 'object') continue;
      if (item.$anchor === reference.slice(1) || item.$dynamicAnchor === reference.slice(1)) return item;
      pending.push(...Object.values(item));
    }
    return undefined;
  }
  if (!reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .reduce((value, part) => {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      return value && Object.hasOwn(value, key) ? value[key] : undefined;
    }, root);
}
function jsonAllOf(parts, root, context) {
  const values = parts.map((part) => jsonValue(part, root, context));
  return values.every((value) => value && typeof value === 'object' && !Array.isArray(value))
    ? Object.fromEntries(values.flatMap((value) => Object.entries(value)))
    : values[0];
}
function integerExample(schema) {
  return Math.ceil(numberExample(schema, true));
}
function numberExample(schema, integer = false) {
  let value = Number.isFinite(schema.minimum) ? schema.minimum : 0;
  if (Number.isFinite(schema.exclusiveMinimum))
    value = Math.max(value, schema.exclusiveMinimum + (integer ? 1 : 0.1));
  if (Number.isFinite(schema.multipleOf) && schema.multipleOf > 0)
    value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
  if (Number.isFinite(schema.maximum) && value > schema.maximum)
    throw new Error('Numerische Schema-Grenzen sind nicht erfüllbar.');
  if (Number.isFinite(schema.exclusiveMaximum) && value >= schema.exclusiveMaximum)
    throw new Error('Numerische Schema-Grenzen sind nicht erfüllbar.');
  return value;
}
function stringExample(schema, field = '') {
  const pattern = String(schema.pattern || '');
  const maxLength = Number.isInteger(schema.maxLength) ? schema.maxLength : Infinity;
  const minLength = Number.isInteger(schema.minLength) ? schema.minLength : 0;
  const format = {
    'date-time': '2025-06-18T10:30:00Z',
    datetime: '2025-06-18T10:30:00Z',
    date: '2025-06-18',
    time: '10:30:00Z',
    email: 'erika.mustermann@example.invalid',
    'idn-email': 'erika.mustermann@example.invalid',
    uri: 'https://example.org/test',
    'uri-reference': 'https://example.org/test',
    iri: 'https://example.org/test',
    'iri-reference': 'https://example.org/test',
    uuid: '11111111-1111-4111-8111-111111111111',
    ipv4: '192.0.2.1',
    ipv6: '2001:db8::1',
    hostname: 'example.org',
    'idn-hostname': 'example.org',
    bool: 'false',
  }[schema.format];
  const semantic = fictionalValues(schema, field);
  const candidates = [
    ...semantic,
    format,
    pattern.includes('@') ? 'erika.mustermann@example.invalid' : null,
    pattern.includes(':') ? '10:30' : null,
    'Fiktive Testangabe',
    'Test',
    '+493000000000',
    '12',
    '12345',
    '1',
    '0',
    '00',
    '00000',
    '10000',
    'A',
    'a',
    'false',
    '11111111-1111-4111-8111-111111111111',
    '1985-04-12',
    '2025-06-18T10:30:00Z',
    '',
  ];
  if (Number.isFinite(maxLength) && maxLength >= minLength)
    candidates.push(...semantic.map((value) => value.slice(0, maxLength)));
  if (minLength <= maxLength && minLength <= 10000)
    candidates.push('a'.repeat(minLength), '0'.repeat(minLength));
  for (const candidate of candidates)
    if (
      typeof candidate === 'string' &&
      candidate.length >= minLength &&
      candidate.length <= maxLength &&
      matchesJsonPattern(candidate, pattern) &&
      matchesExampleFormat(candidate, schema.format)
    )
      return candidate;
  throw new Error(
    `Für dieses String-Feld konnte kein gültiger Beispielwert erzeugt werden: ${field || schema.title || pattern.slice(0, 120)}`,
  );
}
function matchesExampleFormat(value, format) {
  if (format === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (format === 'date-time' || format === 'datetime')
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (format === 'email' || format === 'idn-email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return true;
}
function matchesJsonPattern(value, pattern) {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, 'u').test(value);
  } catch (_) {
    try {
      return new RegExp(pattern).test(value);
    } catch (_) {
      return false;
    }
  }
}
