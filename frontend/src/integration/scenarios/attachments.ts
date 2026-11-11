import { attachmentBytes } from '../../test-packs.js';
import type { Message, Scenario } from './types.ts';
type Attachment = Message['attachments'][number];
export async function attachmentsFromFiles(
  files: File[],
  existing: Attachment[],
  replace: number | null = null,
): Promise<Attachment[]> {
  if (
    !files.length ||
    (replace !== null && (!existing[replace] || files.length !== 1)) ||
    existing.length + files.length - Number(replace !== null) > 39 ||
    files.some((file) => file.size > 4 * 1024 * 1024)
  )
    throw Error('test_pack_limit');
  const estimated =
    existing.reduce((size, a, i) => size + (i === replace ? 0 : a.base64.length), 0) +
    files.reduce((size, file) => size + 4 * Math.ceil(file.size / 3), 0);
  if (estimated > 8 * 1024 * 1024 - 4096) throw Error('test_pack_limit');
  const added: Attachment[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      if (bytes.length > 4 * 1024 * 1024) throw Error('test_pack_limit');
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 12000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 12000));
      const attachment = {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        description: null,
        base64: btoa(binary),
      };
      attachmentBytes(attachment).fill(0);
      added.push(attachment);
    } finally {
      bytes.fill(0);
    }
  }
  const next = [...existing];
  if (replace === null) next.push(...added);
  else next.splice(replace, 1, ...added);
  if (new Set(next.map((a) => a.fileName)).size !== next.length) throw Error('test_attachment_duplicate');
  return next;
}
export function requireAttachmentBudget(scenario: Scenario, message: Message, next: Attachment[]) {
  const size =
    new TextEncoder().encode(JSON.stringify(scenario)).length -
    new TextEncoder().encode(JSON.stringify(message.attachments)).length +
    new TextEncoder().encode(JSON.stringify(next)).length;
  if (size > 8 * 1024 * 1024 - 4096) throw Error('test_pack_limit');
}
