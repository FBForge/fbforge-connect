import { own, object, cleanText, escapePointer, resolveUri, budget, source, mergeHints } from './schema-hints.js';

const annotationKeys = new Set(['title', 'description', '$comment', 'default', 'examples', 'readOnly', 'writeOnly', 'deprecated', '$schema', '$id', 'id', '$anchor', '$defs', 'definitions']);
const supportedGuards = new Set(['type', 'const', 'enum', 'properties', 'required', '$ref', 'allOf', 'oneOf', 'anyOf', 'additionalProperties']);
export function annotateJsonSchema(root, packet) {
  const tick = budget(), resources = new Map(), anchors = new Map(), contexts = new WeakMap();
  const entries = Object.entries(packet.documents);
  if (!entries.length || entries.length > 512) throw new Error('schema_view_limit');
  function put(map, key, context) {
    if (!key) return;
    const rows = map.get(key) || [];
    if (!rows.some(row => row.schema === context.schema)) map.set(key, [...rows, context]);
  }
  function index(schema, uri, location, base, depth = 0, inheritedDialect = null) {
    tick(); if (depth > 64) throw new Error('schema_view_limit');
    if (typeof schema !== 'boolean' && !object(schema)) return null;
    const dialect = object(schema) && typeof schema.$schema === 'string' ? schema.$schema : inheritedDialect;
    const identifier = object(schema) && (/draft-04/.test(dialect || '') ? schema.id : schema.$id);
    const id = typeof identifier === 'string' ? resolveUri(identifier, base) : null;
    const context = { schema, uri, location, base: id || base, dialect, kind: 'JSON-Schema' };
    if (object(schema)) contexts.set(schema, context);
    if (id) { if (id.includes('#') && !id.endsWith('#')) put(anchors, id, context); else put(resources, id.split('#')[0], context); }
    if (object(schema) && typeof schema.$anchor === 'string') put(anchors, `${context.base.split('#')[0]}#${schema.$anchor}`, context);
    if (object(schema)) {
      for (const key of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']) if (object(schema[key])) {
        for (const [name, child] of Object.entries(schema[key])) index(child, uri, `${location}/${key}/${escapePointer(name)}`, context.base, depth + 1, dialect);
      }
      for (const key of ['additionalProperties', 'unevaluatedProperties', 'additionalItems', 'contains', 'propertyNames', 'if', 'then', 'else', 'not', 'contentSchema'])
        if (own(schema, key)) index(schema[key], uri, `${location}/${key}`, context.base, depth + 1, dialect);
      for (const key of ['allOf', 'oneOf', 'anyOf', 'prefixItems']) if (Array.isArray(schema[key]))
        schema[key].forEach((child, i) => index(child, uri, `${location}/${key}/${i}`, context.base, depth + 1, dialect));
      if (Array.isArray(schema.items)) schema.items.forEach((child, i) => index(child, uri, `${location}/items/${i}`, context.base, depth + 1, dialect));
      else if (own(schema, 'items')) index(schema.items, uri, `${location}/items`, context.base, depth + 1, dialect);
    }
    return context;
  }
  for (const [uri, schema] of entries) {
    const canonical = resolveUri(uri, uri); if (!canonical) throw new Error('invalid_schema_uri');
    const context = index(schema, uri, '', canonical);
    if (!context) throw new Error('invalid_schema');
    put(resources, canonical.split('#')[0], context);
  }
  function unique(map, key) { const values = map.get(key); return values?.length === 1 ? values[0] : null; }
  function resolve(reference, origin) {
    tick(); const uri = resolveUri(reference, origin.base); if (!uri) return null;
    const hash = uri.indexOf('#'), document = hash < 0 ? uri : uri.slice(0, hash);
    let fragment; try { fragment = hash < 0 ? '' : decodeURIComponent(uri.slice(hash + 1)); } catch { return null; }
    if (fragment && !fragment.startsWith('/')) return unique(anchors, `${document}#${fragment}`);
    const resource = unique(resources, document); if (!resource) return null;
    let schema = resource.schema;
    for (const part of fragment ? fragment.slice(1).split('/') : []) {
      if (/~(?![01])/u.test(part)) return null;
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!own(schema, key)) return null;
      schema = schema[key];
    }
    return object(schema) ? contexts.get(schema) || null : typeof schema === 'boolean' ? { ...resource, schema, location: resource.location + fragment } : null;
  }
  const selected = resolve(packet.schemaUri, { base: packet.schemaUri });
  if (!selected) return { root, status: 'partial', matchedCount: 0, labelCount: 0, ambiguousCount: 0 };
  function context(schema) { return object(schema) ? contexts.get(schema) : typeof schema === 'boolean' ? { ...selected, schema } : null; }
  function literal(value, data) {
    tick();
    if (value === null) return data.type === 'null';
    if (typeof value === 'string') return data.type === 'string' && data.value === value;
    if (typeof value === 'boolean') return data.type === 'boolean' && data.value === String(value);
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || data.type !== 'number' || !Number.isSafeInteger(Number(data.value))) return undefined;
      return Number(data.value) === value;
    }
    if (Array.isArray(value)) {
      if (data.type !== 'array' || value.length !== data.children.length) return false;
      return combine(value.map((item, i) => literal(item, data.children[i])));
    }
    if (object(value)) {
      if (data.type !== 'object' || data.children.some(child => child.duplicate)) return undefined;
      const keys = Object.keys(value); if (keys.length !== data.children.length) return false;
      return combine(keys.map(key => { const child = data.children.find(child => child.key === key); return child ? literal(value[key], child) : false; }));
    }
    return undefined;
  }
  function combine(values) { return values.includes(false) ? false : values.some(value => value === undefined) ? undefined : true; }
  function integer(raw) {
    const match = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
    if (!match) return false;
    const digits = match[1] + (match[2] || ''); if (!/[1-9]/.test(digits)) return true;
    return Number(match[3] || 0) >= (match[2]?.length || 0) - (digits.match(/0*$/)?.[0].length || 0);
  }
  function guard(ctx, data, seen = new Set()) {
    tick(); if (!ctx || seen.has(ctx.schema)) return undefined;
    if (typeof ctx.schema === 'boolean') return ctx.schema;
    seen = new Set(seen).add(ctx.schema);
    const schema = ctx.schema, values = [];
    if (typeof schema.$ref === 'string' && /draft-(?:04|06|07)/.test(ctx.dialect || '')) return guard(resolve(schema.$ref, ctx), data, seen);
    if (own(schema, 'type')) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      values.push(types.some(type => type === data.type || type === 'integer' && data.type === 'number' && integer(data.value)));
    }
    if (own(schema, 'const')) values.push(literal(schema.const, data));
    if (Array.isArray(schema.enum)) { const matches = schema.enum.map(value => literal(value, data)); values.push(matches.includes(true) ? true : matches.every(value => value === false) ? false : undefined); }
    if (data.type === 'object') {
      if (Array.isArray(schema.required)) values.push(schema.required.every(name => data.children.some(child => child.key === name)));
      if (object(schema.properties)) for (const child of data.children) if (own(schema.properties, child.key)) values.push(guard(context(schema.properties[child.key]), child, seen));
      if (schema.additionalProperties === false && !schema.patternProperties) values.push(data.children.every(child => own(schema.properties, child.key)));
    }
    if (typeof schema.$ref === 'string') values.push(guard(resolve(schema.$ref, ctx), data, seen));
    if (Array.isArray(schema.allOf)) values.push(combine(schema.allOf.map(child => guard(context(child), data, seen))));
    for (const key of ['oneOf', 'anyOf']) if (Array.isArray(schema[key])) {
      const matches = schema[key].map(child => guard(context(child), data, seen));
      values.push(matches.every(value => value !== undefined) ? key === 'oneOf' ? matches.filter(Boolean).length === 1 : matches.some(Boolean) : undefined);
    }
    if (Object.keys(schema).some(key => !annotationKeys.has(key) && !supportedGuards.has(key))) values.push(undefined);
    return combine(values);
  }
  function product(left, right) {
    if (left.length * right.length > 32) throw new Error('schema_view_limit');
    return left.flatMap(a => right.map(b => [...a, ...b]));
  }
  function expand(row, data, seen = new Set()) {
    tick(); const schema = row.ctx?.schema;
    if (schema === true) return [[]];
    if (!object(schema) || seen.has(schema) || typeof schema.$dynamicRef === 'string' || typeof schema.$recursiveRef === 'string') return [];
    seen = new Set(seen).add(schema);
    if (typeof schema.$ref === 'string' && /draft-(?:04|06|07)/.test(row.ctx.dialect || '')) {
      const ref = resolve(schema.$ref, row.ctx); return ref ? expand({ ctx: ref, rank: row.rank + 1 }, data, seen) : [];
    }
    let variants = [[row]];
    if (typeof schema.$ref === 'string') {
      const ref = resolve(schema.$ref, row.ctx); if (!ref) return [];
      variants = product(variants, expand({ ctx: ref, rank: row.rank + 1 }, data, seen));
    }
    if (Array.isArray(schema.allOf)) for (const child of schema.allOf) variants = product(variants, expand({ ctx: context(child), rank: row.rank + 1 }, data, seen));
    for (const key of ['oneOf', 'anyOf']) if (Array.isArray(schema[key])) {
      const choices = schema[key].filter(child => guard(context(child), data) !== false).flatMap(child =>
        expand({ ctx: context(child), rank: row.rank + 1, valueChoice: !data.children.length && (own(child, 'const') || Array.isArray(child?.enum) && child.enum.length === 1) }, data, seen));
      variants = product(variants, choices);
    }
    if (own(schema, 'if')) {
      const match = guard(context(schema.if), data);
      if (match === undefined && (own(schema, 'then') || own(schema, 'else'))) return [];
      const branch = match ? schema.then : schema.else;
      if (branch !== undefined) variants = product(variants, expand({ ctx: context(branch), rank: row.rank + 1 }, data, seen));
    }
    return variants;
  }
  function descriptor(row) {
    const schema = row.ctx.schema;
    return { rank: row.rank, title: row.valueChoice ? null : cleanText(schema.title), description: cleanText(schema.description, 4000),
      type: cleanText(Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type, 128), format: cleanText(schema.format, 128),
      valueLabel: row.valueChoice ? cleanText(schema.title) : null, source: source(row.ctx) };
  }
  let matchedCount = 0, labelCount = 0, ambiguousCount = 0, unmatched = 0;
  function visit(data, offered, required = null) {
    tick(); let variants = [];
    for (const option of offered) {
      let current = [[]];
      for (const row of option) current = product(current, expand(row, data));
      variants.push(...current); if (variants.length > 32) throw new Error('schema_view_limit');
    }
    const hint = mergeHints(variants.map(rows => rows.map(descriptor)), required);
    if (hint) { matchedCount++; if (hint.title) labelCount++; if (hint.ambiguous) ambiguousCount++; } else unmatched++;
    const children = data.children.map((child, index) => {
      const options = [], requirements = [];
      for (const variant of variants) {
        const rows = []; let mandatory = false, constrained = false;
        for (const row of variant) {
          const schema = row.ctx.schema; let selected;
          if (data.type === 'object') {
            if (object(schema.patternProperties) && Object.keys(schema.patternProperties).length || object(schema.dependentSchemas) && Object.keys(schema.dependentSchemas).length || object(schema.dependencies)) { rows.length = 0; break; }
            if (own(schema.properties, child.key)) { selected = schema.properties[child.key]; constrained = true; }
            else if (!schema.patternProperties && object(schema.additionalProperties)) selected = schema.additionalProperties;
            if (Array.isArray(schema.required) && schema.required.includes(child.key)) mandatory = true;
          } else if (data.type === 'array') {
            if (Array.isArray(schema.prefixItems) && index < schema.prefixItems.length) selected = schema.prefixItems[index];
            else if (Array.isArray(schema.items)) selected = schema.items[index] ?? schema.additionalItems;
            else selected = schema.items;
          }
          const ctx = context(selected); if (ctx) rows.push({ ctx, rank: row.rank });
        }
        options.push(rows); requirements.push(mandatory ? true : constrained ? false : null);
      }
      const mandatory = requirements.length && requirements.every(value => value === true) ? true : requirements.length && requirements.every(value => value === false) ? false : null;
      return visit(child, options, mandatory);
    });
    return { ...data, label: hint?.title || data.label, schema: hint, children };
  }
  const annotated = visit(root, [[{ ctx: selected, rank: 0 }]]);
  return { root: annotated, status: unmatched || ambiguousCount ? 'partial' : 'ready', matchedCount, labelCount, ambiguousCount };
}
