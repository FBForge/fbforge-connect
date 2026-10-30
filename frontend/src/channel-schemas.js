// Bounded, offline authoring for simple JSON reply schemas. No network or executable schema content.
export const CHANNEL_DRAFT_FORMAT = 'fbforge-connect-channel-schema';
export const CHANNEL_FILE_LIMIT = 2 * 1024 * 1024;
export const CHANNEL_FIELD_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'date',
  'date-time',
  'string-array',
];
const text = (s, max, empty = false) =>
  typeof s === 'string' &&
  s.length <= max &&
  (empty || s.trim()) &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const fail = () => {
  throw new Error('channel_schema_invalid');
};
export function schemaIdentifier(value) {
  if (!text(value, 4096) || /\s|[<>"\\^`{|}#]|%(?![a-f0-9]{2})/i.test(value)) fail();
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') {
      if (!parsed.hostname || parsed.username || parsed.password) fail();
    } else if (parsed.protocol !== 'urn:' || !/^urn:[a-z0-9][a-z0-9-]{0,31}:[^\s:][^\s]*$/i.test(value))
      fail();
  } catch {
    fail();
  }
  return value;
}
export function channelTemplate(kind = 'status') {
  return {
    schemaUri: `urn:fbforge:connect:reply:${kind === 'request' ? 'nachforderung' : 'status'}:1`,
    title: kind === 'request' ? 'Nachforderung von Unterlagen' : 'Fachliche Statusmitteilung',
    description: 'Vereinbartes Antwortschema für fiktive Integrationsdaten.',
    statuses:
      kind === 'request'
        ? ['nachforderung', 'unterlagen_eingegangen']
        : ['eingegangen', 'in_bearbeitung', 'abgeschlossen'],
    fields: [
      { name: 'nachricht', title: 'Mitteilung', type: 'string', required: true },
      ...(kind === 'request'
        ? [
            { name: 'unterlagen', title: 'Benötigte Unterlagen', type: 'string-array', required: true },
            { name: 'frist', title: 'Frist', type: 'date', required: false },
          ]
        : [{ name: 'referenz', title: 'Geschäftszeichen', type: 'string', required: false }]),
    ],
  };
}
export function checkedChannelDefinition(v) {
  if (!exact(v, ['schemaUri', 'title', 'description', 'statuses', 'fields'])) fail();
  schemaIdentifier(v.schemaUri);
  if (
    !text(v.title, 160) ||
    !text(v.description, 2000, true) ||
    !Array.isArray(v.statuses) ||
    !v.statuses.length ||
    v.statuses.length > 16 ||
    new Set(v.statuses).size !== v.statuses.length ||
    v.statuses.some((s) => typeof s !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(s)) ||
    !Array.isArray(v.fields) ||
    v.fields.length > 32
  )
    fail();
  const seen = new Set(['status', '__proto__', 'constructor', 'prototype']);
  for (const row of v.fields) {
    if (
      !exact(row, ['name', 'title', 'type', 'required']) ||
      typeof row.name !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(row.name) ||
      seen.has(row.name) ||
      !text(row.title, 160) ||
      !CHANNEL_FIELD_TYPES.includes(row.type) ||
      typeof row.required !== 'boolean'
    )
      fail();
    seen.add(row.name);
  }
  return JSON.parse(JSON.stringify(v));
}
export function createChannelSchema(definition) {
  const v = checkedChannelDefinition(definition);
  const properties = { status: { type: 'string', title: 'Fachlicher Status', enum: v.statuses } };
  const example = { status: v.statuses[0] },
    required = ['status'];
  for (const field of v.fields) {
    const type = ['date', 'date-time'].includes(field.type)
      ? 'string'
      : field.type === 'string-array'
        ? 'array'
        : field.type;
    properties[field.name] = {
      type,
      title: field.title,
      ...(type === 'string' ? { maxLength: 2000 } : {}),
      ...(['date', 'date-time'].includes(field.type) ? { format: field.type } : {}),
      ...(type === 'array' ? { items: { type: 'string', maxLength: 2000 }, maxItems: 50 } : {}),
    };
    if (field.required) required.push(field.name);
    example[field.name] = {
      string: 'Fiktive Mitteilung',
      integer: 1,
      number: 1.5,
      boolean: true,
      date: '2030-01-15',
      'date-time': '2030-01-15T10:00:00Z',
      'string-array': ['Fiktive Unterlage'],
    }[field.type];
  }
  return {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: v.schemaUri,
      title: v.title,
      description: v.description,
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
    example,
    offer: { schemaUri: v.schemaUri, mimeType: 'application/json' },
    draft: { format: CHANNEL_DRAFT_FORMAT, version: 1, definition: v },
  };
}
export async function readChannelFile(file, draft = false) {
  if (!file || file.size > CHANNEL_FILE_LIMIT) fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()));
  } catch {
    fail();
  }
  if (!draft) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'object') fail();
    return schemaIdentifier(value.$id);
  }
  if (
    !exact(value, ['format', 'version', 'definition']) ||
    value.format !== CHANNEL_DRAFT_FORMAT ||
    value.version !== 1
  )
    fail();
  return checkedChannelDefinition(value.definition);
}
