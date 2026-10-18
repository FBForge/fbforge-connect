const fileErrors = new Set([
  'invalid_input',
  'file_invalid',
  'key_rejected',
  'test_certificate_required',
  'content_limit',
]);

/** Sequential imports keep the native command channel idle between files. */
export async function importKeyFiles(files, importDocument, isCurrent) {
  if (!files.length || files.length > 16) throw new Error('invalid_input');
  const result = { state: null, imported: 0, failures: [] };
  for (const file of files) {
    if (!isCurrent()) return null;
    let bytes, document;
    try {
      if (file.size > 32768) throw new Error('invalid_input');
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        throw new Error('file_invalid');
      }
      if (!isCurrent()) return null;
      if (bytes.byteLength > 32768) throw new Error('invalid_input');
      try {
        document = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error('file_invalid');
      }
      result.state = await importDocument(document);
      if (!isCurrent()) return null;
      result.imported++;
    } catch (cause) {
      const code = typeof cause === 'string' ? cause : cause?.message;
      if (!fileErrors.has(code)) throw cause;
      result.failures.push({ name: String(file.name || 'Schlüsseldatei').slice(0, 255), code });
    } finally {
      // Release the reference; immutable JavaScript strings cannot be securely erased.
      // eslint-disable-next-line no-useless-assignment
      document = '';
      if (bytes) bytes.fill(0);
    }
  }
  return result;
}
