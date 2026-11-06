import { caseParts, readCaseFile } from '../../cases.js';
import { validateTestPack } from '../../test-packs.js';
import type { NativeInvoke, Session } from '../../contracts.d.ts';
import type { CaseRecord, Message, Pack, TestCase } from './types.ts';

interface Choices {
  name: string;
  serviceIdentifier: string;
  schemaUri: string;
  replySchemaUri: string;
  receipt: 'accept' | 'reject' | 'none';
}
async function captureSchemas(
  invoke: NativeInvoke,
  session: Session,
  record: CaseRecord,
  schemaUri: string,
  current: () => boolean,
): Promise<TestCase['schemas']> {
  const parts = await caseParts(invoke, session, record.recordId),
    part = parts?.find((p) => p.kind === 'schema' && p.fileName === schemaUri);
  if (!part) return [];
  if (part.totalBytes > 2 * 1024 * 1024) throw new Error('test_pack_limit');
  if (!current()) throw new Error('content_cancelled');
  const bytes = await readCaseFile(invoke, session, record.recordId, part);
  try {
    const packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (packet.schemaPackage !== 1 || packet.schemaUri !== schemaUri) throw new Error('scenario_invalid');
    if (packet.documents && typeof packet.documents === 'object' && !Array.isArray(packet.documents))
      return Object.entries(packet.documents).map(([uri, content]) => ({
        uri,
        mimeType: 'application/json',
        content: JSON.stringify(content),
      }));
    if (Array.isArray(packet.schemas))
      return packet.schemas.map((row: { name: string; text: string }) => ({
        uri: new URL(row.name, schemaUri).href,
        mimeType: 'application/xml',
        content: row.text,
      }));
    throw new Error('scenario_invalid');
  } finally {
    bytes.fill(0);
  }
}
async function captureMessage(
  invoke: NativeInvoke,
  session: Session,
  record: CaseRecord,
  schemaUri: string,
  current: () => boolean,
): Promise<Message> {
  if (
    record.available === false ||
    !['sent', 'verified', 'accepted', 'rejected', 'confirmed'].includes(record.status) ||
    record.warnings.includes('MALWARE_ATTACHMENT_BLOCKED')
  )
    throw new Error('scenario_capture_unavailable');
  const parts = await caseParts(invoke, session, record.recordId);
  if (!parts) throw new Error('scenario_invalid');
  const data = parts.find((p) => p.kind === 'data'),
    attachments = parts.filter((p) => p.kind === 'attachment');
  if (
    !data ||
    data.totalBytes > 512 * 1024 ||
    attachments.some((p) => p.totalBytes > 4 * 1024 * 1024) ||
    parts.filter((p) => ['data', 'attachment'].includes(p.kind)).reduce((n, p) => n + p.totalBytes, 0) >
      5 * 1024 * 1024
  )
    throw new Error('test_pack_limit');
  async function read(part: NonNullable<Awaited<ReturnType<typeof caseParts>>>[number]) {
    if (!current()) throw new Error('content_cancelled');
    return readCaseFile(invoke, session, record.recordId, part);
  }
  const bytes = await read(data);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    bytes.fill(0);
  }
  const message: Message = {
    schemaUri,
    mimeType: data.mimeType || '',
    data: text,
    attachments: [],
    processMessage: null,
  };
  for (const part of attachments) {
    const bytes = await read(part);
    try {
      let binary = '';
      for (let i = 0; i < bytes.length; i += 12000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 12000));
      message.attachments.push({
        fileName: part.fileName || '',
        mimeType: part.mimeType || '',
        description: null,
        base64: btoa(binary),
      });
    } finally {
      bytes.fill(0);
    }
  }
  return message;
}
export async function packFromCase(
  invoke: NativeInvoke,
  session: Session,
  request: CaseRecord,
  reply: CaseRecord | null,
  choices: Choices,
  current = () => true,
): Promise<Pack> {
  if (request.kind !== 'submission' || (reply && (reply.kind !== 'reply' || reply.caseId !== request.caseId)))
    throw new Error('scenario_invalid');
  const message = await captureMessage(invoke, session, request, choices.schemaUri, current);
  const schemas = await captureSchemas(invoke, session, request, choices.schemaUri, current);
  message.serviceIdentifier = choices.serviceIdentifier;
  message.serviceName = choices.name;
  message.region = null;
  message.replyOffer = null;
  let answer: Message | null = null;
  if (reply) {
    answer = await captureMessage(invoke, session, reply, choices.replySchemaUri, current);
    const additional = await captureSchemas(invoke, session, reply, choices.replySchemaUri, current);
    for (const schema of additional) {
      const existing = schemas.find((s) => s.uri === schema.uri);
      if (existing && existing.content !== schema.content) throw new Error('scenario_invalid');
      if (!existing) schemas.push(schema);
    }
    message.replyOffer = { schemaUri: answer.schemaUri, mimeType: answer.mimeType, processMessages: [] };
  }
  if (!current()) throw new Error('content_cancelled');
  return validateTestPack({
    format: 'fbforge-connect-testpack',
    version: 1,
    name: choices.name,
    cases: [
      {
        id: `test-${crypto.randomUUID().slice(0, 8)}`,
        name: choices.name,
        request: message,
        reply: answer,
        receipt: choices.receipt,
        schemas,
      },
    ],
  });
}
