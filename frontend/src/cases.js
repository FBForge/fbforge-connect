import { requestResource } from './resources.js';
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const fail = () => {
  throw new Error('engine_protocol_error');
};
export const caseStatus = (value) =>
  ({
    verified: 'Inhalte geprüft',
    unverified: 'Inhalte noch nicht geprüft',
    sent: 'Gesendet',
    accepted: 'Angenommen',
    rejected: 'Abgelehnt',
    confirmed: 'Bestätigt',
    failed: 'Fehlgeschlagen',
    uncertain: 'Ausgang ungewiss',
    unavailable: 'Kopie nicht lesbar',
    prepared: 'Vorbereitet',
    running: 'In Bearbeitung',
    cancelled: 'Abgebrochen',
  })[value] || 'Unbekannt';
export async function caseRequest(invoke, session, operation, args = {}) {
  return requestResource(invoke, session, 'case_workspace', {
    operation,
    recordId: null,
    contentId: null,
    offset: 0,
    persistent: null,
    ...args,
  });
}
export async function listCases(invoke, session) {
  const result = await caseRequest(invoke, session, 'list');
  if (
    !Array.isArray(result.records) ||
    result.records.length > 200 ||
    typeof result.persistent !== 'boolean' ||
    typeof result.canPersist !== 'boolean'
  )
    fail();
  const seen = new Set();
  for (const record of result.records) {
    if (
      !uuid(record.recordId) ||
      !uuid(record.revision) ||
      seen.has(record.recordId) ||
      !['submission', 'reply'].includes(record.kind) ||
      !['sent', 'received'].includes(record.direction) ||
      typeof record.title !== 'string' ||
      record.title.length > 256 ||
      (record.available !== false && !Number.isFinite(Date.parse(record.createdAt))) ||
      !Number.isSafeInteger(record.totalBytes) ||
      record.totalBytes < 0 ||
      record.totalBytes > 88 * 1024 * 1024 ||
      !Array.isArray(record.warnings) ||
      record.warnings.length > 16 ||
      ['caseId', 'submissionId', 'replyId', 'destinationId'].some(
        (key) => record[key] !== null && !uuid(record[key]),
      )
    )
      fail();
    seen.add(record.recordId);
  }
  return result;
}
export async function caseParts(invoke, session, recordId) {
  if (!uuid(recordId)) throw new Error('invalid_input');
  const parts = [];
  let total;
  for (let offset = 0; offset < 44; offset += 2) {
    const page = await caseRequest(invoke, session, 'parts', { recordId, offset });
    if (
      page.recordId !== recordId ||
      page.offset !== offset ||
      !Number.isInteger(page.total) ||
      page.total < 1 ||
      page.total > 42 ||
      (total !== undefined && total !== page.total) ||
      !Array.isArray(page.parts) ||
      page.parts.length !== Math.min(2, page.total - offset)
    )
      fail();
    total = page.total;
    for (const part of page.parts) {
      if (
        !uuid(part.contentId) ||
        parts.some((p) => p.contentId === part.contentId) ||
        !['metadata', 'data', 'attachment', 'schema'].includes(part.kind) ||
        !Number.isSafeInteger(part.totalBytes) ||
        part.totalBytes < 0 ||
        part.totalBytes > 32 * 1024 * 1024 ||
        (part.fileName !== null && (typeof part.fileName !== 'string' || part.fileName.length > 4096)) ||
        (part.mimeType !== null && (typeof part.mimeType !== 'string' || part.mimeType.length > 256))
      )
        fail();
      parts.push(part);
    }
    if (parts.length === total) return parts;
  }
  fail();
}
export async function readCaseFile(invoke, session, recordId, part, { signal } = {}) {
  if (
    !uuid(recordId) ||
    !uuid(part?.contentId) ||
    !Number.isSafeInteger(part.totalBytes) ||
    part.totalBytes < 0 ||
    part.totalBytes > 32 * 1024 * 1024
  )
    throw new Error('invalid_input');
  const result = new Uint8Array(part.totalBytes);
  try {
    let offset = 0;
    do {
      if (signal?.aborted) throw new Error('content_cancelled');
      const page = await caseRequest(invoke, session, 'read', {
        recordId,
        contentId: part.contentId,
        offset,
      });
      const expected = Math.min(24576, part.totalBytes - offset);
      if (
        page.recordId !== recordId ||
        page.contentId !== part.contentId ||
        page.byteOffset !== offset ||
        page.totalBytes !== part.totalBytes ||
        typeof page.chunk !== 'string' ||
        page.chunk.length > 32768 ||
        page.complete !== (offset + expected === part.totalBytes)
      )
        fail();
      let chunk;
      try {
        chunk = atob(page.chunk);
      } catch {
        fail();
      }
      if (chunk.length !== expected || btoa(chunk) !== page.chunk) fail();
      result.set(
        Uint8Array.from(chunk, (c) => c.charCodeAt(0)),
        offset,
      );
      offset += expected;
    } while (offset < result.length);
    if (signal?.aborted) throw new Error('content_cancelled');
    return result;
  } catch (error) {
    result.fill(0);
    throw error;
  }
}

export function caseErrorMessage(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return {
    vault_limit:
      'Die geschützte Vorgangsablage hat ihre Größen- oder Datensatzgrenze erreicht. Lösche nicht mehr benötigte lokale Kopien.',
    vault_invalid:
      'Diese lokale Kopie ist beschädigt oder kann mit diesem Windows-Benutzerkonto nicht gelesen werden. Andere Kopien bleiben erhalten.',
    vault_unavailable:
      'Die geschützte Vorgangsablage ist nicht verfügbar. Prüfe das Benutzerkonto, Dateizugriffsrechte und den freien Speicherplatz.',
  }[code];
}
