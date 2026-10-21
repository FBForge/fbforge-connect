import { assertSchemaAvailable } from './schema-availability.js';
import { expandedXmlName, parseLocalXml } from './safe-xml.js';

export const COMPARISON_BYTES = 512 * 1024;
const LIMIT = 3000;
const invalid = (code = 'schema_comparison_invalid') => {
  throw new Error(code);
};
const escape = (value) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function ordered(value, key = '', depth = 0, budget = { remaining: 12000 }) {
  if (depth > 64 || --budget.remaining < 0) invalid('schema_comparison_limit');
  if (Array.isArray(value)) {
    const items = value.map((item) => ordered(item, '', depth + 1, budget));
    return ['required', 'enum', 'type'].includes(key)
      ? items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : items;
  }
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, ordered(value[name], name, depth + 1, budget)]),
    );
  return value;
}
function jsonRows(source) {
  let schema;
  try {
    schema = JSON.parse(source);
    assertSchemaAvailable(schema);
  } catch {
    invalid();
  }
  schema = ordered(schema);
  const rows = new Map();
  const childMaps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
  const childSchemas = new Set([
    'items',
    'additionalItems',
    'additionalProperties',
    'unevaluatedProperties',
    'unevaluatedItems',
    'contains',
    'propertyNames',
    'not',
    'if',
    'then',
    'else',
  ]);
  const childArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  function walk(item, path, required = false, depth = 0) {
    if (depth > 48 || rows.size >= LIMIT) invalid('schema_comparison_limit');
    if (typeof item === 'boolean') {
      rows.set(path, { allowed: item, fieldRequired: required });
      return;
    }
    if (!object(item)) invalid();
    const rules = Object.assign(Object.create(null), { fieldRequired: required });
    for (const [key, value] of Object.entries(item)) {
      if (childMaps.has(key)) {
        if (!object(value)) invalid();
        for (const [name, child] of Object.entries(value))
          walk(
            child,
            `${path}/${key}/${escape(name)}`,
            key === 'properties' && Array.isArray(item.required) && item.required.includes(name),
            depth + 1,
          );
      } else if (childSchemas.has(key) && (object(value) || typeof value === 'boolean'))
        walk(value, `${path}/${key}`, false, depth + 1);
      else if (childArrays.has(key) && Array.isArray(value))
        value.forEach((child, index) => walk(child, `${path}/${key}/${index}`, false, depth + 1));
      else if (key !== 'required') rules[key] = value;
    }
    // Required names are represented on each field. Undeclared names still need a visible rule.
    if (Array.isArray(item.required)) rules.requiredNames = item.required;
    rows.set(path, rules);
  }
  walk(schema, '#');
  return rows;
}
const qnames = new Set([
  'type',
  'ref',
  'base',
  'itemType',
  'substitutionGroup',
  'refer',
  'defaultAttributes',
]);
function xsdRows(source) {
  let root;
  try {
    root = parseLocalXml(source, COMPARISON_BYTES);
  } catch {
    invalid();
  }
  if (root.name !== 'xs:schema') invalid();
  const rows = new Map();
  function walk(node, path) {
    if (rows.size >= LIMIT) invalid('schema_comparison_limit');
    if (node.name === 'xs:annotation') return;
    const rules = Object.create(null);
    for (const [key, value] of Object.entries(node.attrs)) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
      const name = key.includes(':') ? expandedXmlName(key, node.ns) : key;
      rules[name] = qnames.has(key)
        ? expandedXmlName(value, node.ns)
        : key === 'memberTypes'
          ? value
              .trim()
              .split(/\s+/)
              .map((part) => expandedXmlName(part, node.ns))
              .sort()
          : value;
    }
    if (node.text.trim()) rules.text = node.text.trim();
    rows.set(path, rules);
    const seen = new Map();
    let position = 0;
    for (const child of node.children) {
      if (child.name === 'xs:annotation') continue;
      const key = `${expandedXmlName(child.name, child.ns)}${child.attrs.name ? `(${escape(child.attrs.name)})` : child.attrs.ref ? `(${expandedXmlName(child.attrs.ref, child.ns)})` : ''}`;
      const occurrence = seen.get(key) || 0;
      seen.set(key, occurrence + 1);
      const childPath = `${path}/${key}${occurrence ? `[${occurrence}]` : ''}`;
      walk(child, childPath);
      if (node.name === 'xs:sequence') rows.get(childPath).sequencePosition = position++;
    }
  }
  walk(root, '#');
  return rows;
}
function changeReason(before, after) {
  if (!before) return after.fieldRequired ? 'Neues Pflichtfeld' : 'Hinzugefügt';
  if (!after) return 'Entfernt';
  if (!before.fieldRequired && after.fieldRequired) return 'Jetzt ein Pflichtfeld';
  if (JSON.stringify(before.type) !== JSON.stringify(after.type)) return 'Datentyp geändert';
  if (
    Array.isArray(before.enum) &&
    Array.isArray(after.enum) &&
    before.enum.some((value) => !after.enum.some((next) => JSON.stringify(value) === JSON.stringify(next)))
  )
    return 'Auswahlwerte entfernt';
  if (
    ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties', 'minOccurs'].some(
      (key) =>
        after[key] !== undefined &&
        Number(after[key]) > Number(before[key] ?? (key === 'minOccurs' ? 1 : -Infinity)),
    )
  )
    return 'Untergrenze verschärft';
  if (
    ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties', 'maxOccurs'].some(
      (key) => after[key] !== undefined && Number(after[key]) < Number(before[key] ?? Infinity),
    )
  )
    return 'Obergrenze verschärft';
  if (JSON.stringify(before.$ref) !== JSON.stringify(after.$ref)) return 'Schema-Referenz geändert';
  return 'Regeln oder Angaben geändert';
}
export function compareSchemas(before, after, format = 'json') {
  for (const source of [before, after])
    if (
      typeof source !== 'string' ||
      !source.trim() ||
      new TextEncoder().encode(source).length > COMPARISON_BYTES
    )
      invalid('schema_comparison_limit');
  if (!['json', 'xsd'].includes(format)) invalid();
  const parse = format === 'json' ? jsonRows : xsdRows;
  const previous = parse(before),
    next = parse(after),
    changes = [];
  for (const path of new Set([...previous.keys(), ...next.keys()])) {
    const oldRules = previous.get(path),
      newRules = next.get(path);
    if (JSON.stringify(ordered(oldRules)) === JSON.stringify(ordered(newRules))) continue;
    changes.push({
      path,
      kind: !oldRules ? 'added' : !newRules ? 'removed' : 'changed',
      reason: changeReason(oldRules, newRules),
      before: oldRules ?? null,
      after: newRules ?? null,
    });
  }
  return {
    format,
    changes,
    counts: {
      added: changes.filter((item) => item.kind === 'added').length,
      removed: changes.filter((item) => item.kind === 'removed').length,
      changed: changes.filter((item) => item.kind === 'changed').length,
    },
    note: 'Strukturvergleich, kein vollständiger Kompatibilitätsnachweis. Referenzen, Imports und Codelisten werden nicht extern geladen. Prüfen Sie Änderungen mit Ihren Testfällen.',
  };
}
export function comparisonError(cause) {
  return cause?.message === 'schema_comparison_limit'
    ? 'Das Schema ist zu groß oder zu tief verschachtelt. Maximal 512 KiB pro Datei und 3000 Struktureinträge.'
    : 'Bitte zwei gültige JSON-Schemata oder zwei gültige XSD-Dateien auswählen. Fehlerantworten, DTDs und externe Entitäten werden nicht übernommen.';
}
