import { assertSchemaAvailable } from './schema-availability.js';
import { parseLocalXml } from './safe-xml.js';

export const TEST_PACK_BYTES = 8 * 1024 * 1024;
export const TEST_DATA_BYTES = 512 * 1024;
const TEST_SCHEMA_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const bad = (code = 'test_pack_invalid') => {
  throw new Error(code);
};
const exact = (object, fields) =>
  object &&
  typeof object === 'object' &&
  !Array.isArray(object) &&
  Object.keys(object).length === fields.length &&
  fields.every((key) => Object.hasOwn(object, key));
const text = (value, max = 1000) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\x00-\x1f\x7f]/.test(value);
const uri = (value) => text(value, 4096) && /^(urn:[^\s]+|https?:\/\/[^\s]+)$/.test(value);
const mime = (value) => ['application/json', 'application/xml'].includes(value);
const processMessage = (value) =>
  value === null ||
  (exact(value, ['processModelId', 'messageId']) && text(value.processModelId) && text(value.messageId));

export function testDataBytes(data, mimeType, limit = TEST_DATA_BYTES) {
  if (typeof data !== 'string' || !data.trim() || encoder.encode(data).length > limit || !mime(mimeType))
    bad();
  try {
    if (mimeType === 'application/json') JSON.parse(data);
    else parseLocalXml(data, limit);
  } catch {
    bad('test_data_invalid');
  }
  return encoder.encode(data);
}

export function attachmentBytes(attachment) {
  if (
    !exact(attachment, ['fileName', 'mimeType', 'description', 'base64']) ||
    !text(attachment.fileName, 160) ||
    /[\\/:]/.test(attachment.fileName) ||
    ['.', '..'].includes(attachment.fileName) ||
    !text(attachment.mimeType, 128) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(attachment.mimeType) ||
    !(attachment.description === null || text(attachment.description, 1000)) ||
    typeof attachment.base64 !== 'string' ||
    attachment.base64.length > 6 * 1024 * 1024 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.base64)
  )
    bad();
  const binary = atob(attachment.base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (btoa(binary) !== attachment.base64 || bytes.length > 4 * 1024 * 1024) bad();
  return bytes;
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length > 39) bad();
  const names = new Set();
  for (const attachment of attachments) {
    const bytes = attachmentBytes(attachment);
    bytes.fill(0);
    if (names.has(attachment.fileName)) bad();
    names.add(attachment.fileName);
  }
}
function validateMessage(message, request = false) {
  const fields = ['schemaUri', 'mimeType', 'data', 'attachments', 'processMessage'];
  if (request) fields.push('serviceIdentifier', 'serviceName', 'region', 'replyOffer');
  if (
    !exact(message, fields) ||
    !uri(message.schemaUri) ||
    !mime(message.mimeType) ||
    !processMessage(message.processMessage)
  )
    bad();
  testDataBytes(message.data, message.mimeType).fill(0);
  validateAttachments(message.attachments);
  if (!request) return;
  if (
    !(
      text(message.serviceIdentifier, 4096) ||
      (message.processMessage && message.serviceIdentifier === '')
    ) ||
    !text(message.serviceName, 500) ||
    !(message.region === null || text(message.region, 100))
  )
    bad();
  const offer = message.replyOffer;
  if (
    offer !== null &&
    (!exact(offer, ['schemaUri', 'mimeType', 'processMessages']) ||
      !uri(offer.schemaUri) ||
      !mime(offer.mimeType) ||
      !Array.isArray(offer.processMessages) ||
      offer.processMessages.length > 50 ||
      offer.processMessages.some((entry) => entry === null || !processMessage(entry)))
  )
    bad();
}
export function validateTestPack(pack) {
  if (
    !exact(pack, ['format', 'version', 'name', 'cases']) ||
    pack.format !== 'fbforge-connect-testpack' ||
    pack.version !== 1 ||
    !text(pack.name, 160) ||
    !Array.isArray(pack.cases) ||
    !pack.cases.length ||
    pack.cases.length > 20
  )
    bad();
  const ids = new Set();
  for (const item of pack.cases) {
    if (
      !exact(item, ['id', 'name', 'request', 'reply', 'receipt', 'schemas']) ||
      typeof item.id !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) ||
      !text(item.name, 160) ||
      ids.has(item.id) ||
      !['accept', 'reject', 'none'].includes(item.receipt) ||
      !Array.isArray(item.schemas) ||
      item.schemas.length > 20
    )
      bad();
    ids.add(item.id);
    validateMessage(item.request, true);
    if (item.reply !== null) {
      validateMessage(item.reply);
      const offer = item.request.replyOffer;
      if (
        !offer ||
        item.reply.schemaUri !== offer.schemaUri ||
        item.reply.mimeType !== offer.mimeType ||
        (item.reply.processMessage &&
          !offer.processMessages.some(
            (entry) =>
              entry.processModelId === item.reply.processMessage.processModelId &&
              entry.messageId === item.reply.processMessage.messageId,
          ))
      )
        bad('test_reply_mismatch');
    }
    const schemas = new Set();
    for (const schema of item.schemas) {
      if (
        !exact(schema, ['uri', 'mimeType', 'content']) ||
        !uri(schema.uri) ||
        !mime(schema.mimeType) ||
        schemas.has(schema.uri)
      )
        bad();
      schemas.add(schema.uri);
      testDataBytes(schema.content, schema.mimeType, TEST_SCHEMA_BYTES).fill(0);
      if (schema.mimeType === 'application/json') {
        const definition = JSON.parse(schema.content);
        try {
          assertSchemaAvailable(definition);
        } catch {
          bad('test_schema_invalid');
        }
        if (definition.$id && definition.$id !== schema.uri) bad('schema_id_mismatch');
      } else if (parseLocalXml(schema.content, TEST_SCHEMA_BYTES).name !== 'xs:schema')
        bad('test_schema_invalid');
    }
  }
  if (encoder.encode(JSON.stringify(pack)).length > TEST_PACK_BYTES) bad('test_pack_limit');
  return pack;
}
export function parseTestPack(source) {
  if (typeof source !== 'string' || encoder.encode(source).length > TEST_PACK_BYTES) bad('test_pack_limit');
  let pack;
  try {
    pack = JSON.parse(source);
  } catch {
    bad();
  }
  return validateTestPack(pack);
}
export function serializeTestPack(pack) {
  const source = JSON.stringify(validateTestPack(pack), null, 2);
  if (encoder.encode(source).length > TEST_PACK_BYTES) bad('test_pack_limit');
  return source;
}
export function testCaseFiles(item) {
  return item.request.attachments.map((attachment) => {
    const bytes = attachmentBytes(attachment);
    try {
      return {
        file: new File([bytes], attachment.fileName, { type: attachment.mimeType }),
        mimeType: attachment.mimeType,
        description: attachment.description || '',
      };
    } finally {
      bytes.fill(0);
    }
  });
}
export async function packFromDraft(draft, dataFile, attachments, schemas = []) {
  if (
    dataFile.size > TEST_DATA_BYTES ||
    attachments.some((item) => item.file.size > 4 * 1024 * 1024) ||
    schemas.length > 20 ||
    schemas.some((item) => item.file.size > 2 * 1024 * 1024) ||
    dataFile.size +
      attachments.reduce((sum, item) => sum + item.file.size, 0) +
      schemas.reduce((sum, item) => sum + item.file.size, 0) >
      5 * 1024 * 1024
  )
    bad('test_pack_limit');
  const request = Object.fromEntries(
    [
      'serviceIdentifier',
      'serviceName',
      'region',
      'schemaUri',
      'mimeType',
      'processMessage',
      'replyOffer',
    ].map((key) => [key, JSON.parse(JSON.stringify(draft[key]))]),
  );
  request.serviceName ||= 'Eigener Prozesstest';
  request.data = new TextDecoder('utf-8', { fatal: true }).decode(await dataFile.arrayBuffer());
  request.attachments = [];
  for (const item of attachments) {
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    try {
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 12000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 12000));
      request.attachments.push({
        fileName: item.file.name,
        mimeType: item.mimeType,
        description: item.description || null,
        base64: btoa(binary),
      });
    } finally {
      bytes.fill(0);
    }
  }
  const local = [];
  for (const item of schemas)
    local.push({
      uri: item.uri,
      mimeType:
        item.file.name.toLowerCase().endsWith('.xsd') || item.file.type.includes('xml')
          ? 'application/xml'
          : 'application/json',
      content: new TextDecoder('utf-8', { fatal: true }).decode(await item.file.arrayBuffer()),
    });
  return validateTestPack({
    format: 'fbforge-connect-testpack',
    version: 1,
    name: draft.serviceName || 'Eigener Testfall',
    cases: [
      {
        id: `test-${crypto.randomUUID().slice(0, 8)}`,
        name: draft.serviceName || 'Eigener Testfall',
        request,
        reply: null,
        receipt: 'none',
        schemas: local,
      },
    ],
  });
}
export function testPackError(cause) {
  const messages = {
    test_pack_invalid:
      'Das ist kein gültiges FBForge-Testpaket der Version 1. Zugangsdaten, Schlüssel und unbekannte Felder sind in Paketen nicht erlaubt.',
    test_pack_limit:
      'Das Testpaket ist zu groß. Maximal 8 MiB je Paket, 512 KiB Fachdaten, 2 MiB je Schema und 4 MiB je Anlage.',
    test_data_invalid:
      'Fachdaten oder Schema sind kein gültiges JSON beziehungsweise XML. DTDs und externe Entitäten sind nicht erlaubt.',
    test_schema_invalid: 'Eine Schemadatei enthält kein verwendbares JSON-Schema oder XSD.',
    schema_id_mismatch: 'Die $id im lokalen Schema stimmt nicht mit seiner Schema-URI im Testpaket überein.',
    test_reply_mismatch:
      'Die erwartete Antwort passt nicht zum angebotenen Antwortschema oder zur erlaubten Prozessnachricht.',
  };
  return Object.hasOwn(messages, cause?.message)
    ? messages[cause.message]
    : 'Das Testpaket konnte nicht verarbeitet werden. Bitte Dateiformat und Größe prüfen.';
}
