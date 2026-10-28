export async function certificateMaterial(file, password = '') {
  if (!file || file.size > 24576 || typeof password !== 'string' || password.length > 1024)
    throw new Error('invalid_input');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (bytes.length > 24576) throw new Error('invalid_input');
    if (/\.(?:p12|pfx)$/i.test(file.name)) {
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { format: 'pkcs12', content: btoa(binary), password };
    }
    return { format: 'jwk', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } finally {
    bytes.fill(0);
  }
}
